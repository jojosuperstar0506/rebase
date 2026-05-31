// Tests for requireUserAuth middleware (Phase 1 of Epic #85 / sub-issue #142).
//
// Documents the JWT-verify-then-legacy-fallback contract. Mirrors the
// implementation in backend/server.js — when you change one, change the
// other. (Phase 4 will extract the middleware into a module so both can
// import it; for now they live in parallel.)
//
// Zero external deps: signs/verifies HS256 tokens with node:crypto, mocks
// req/res with plain objects. Matches the dep-free pattern of the existing
// tests/verify-code-proxy.test.mjs so CI doesn't need backend's node_modules.
//
// Run: node --test tests/auth-middleware.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const TEST_SECRET = 'test-jwt-secret-for-middleware-tests';

// ── Tiny HS256 JWT helpers (sign + verify) ──────────────────────────────────
// Matches the on-the-wire shape that jsonwebtoken produces for HS256 with no
// special claims. Enough to test the middleware's verify path; not a
// replacement for the real library.
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}
function verifyJwt(token, secret) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed');
  const expected = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  // Use timing-safe compare for parity with real jwt.verify
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('invalid signature');
  }
  return JSON.parse(b64urlDecode(p).toString('utf8'));
}

// ── Middleware (mirror of backend/server.js requireUserAuth) ────────────────
function requireUserAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearer) {
    try {
      const payload = verifyJwt(bearer, TEST_SECRET);
      req.user = {
        accountId: (payload.sub || '').toString(),
        email: payload.email || '',
        name: payload.name || '',
        tokenWorkspaceId: payload.workspace_id || null,
        verifiedVia: 'jwt',
      };
      return next();
    } catch {
      // fall through to legacy path
    }
  }
  const legacyId = req.headers['x-user-id'];
  if (legacyId) {
    req.user = {
      accountId: legacyId.toString(),
      email: '',
      name: '',
      tokenWorkspaceId: null,
      verifiedVia: 'legacy_header',
    };
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// ── Mock req/res helpers ────────────────────────────────────────────────────
function mockReq(headers = {}) {
  // Lower-case keys to match Express's normalization.
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  return { headers: lower };
}
function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
function runMiddleware(headers) {
  return new Promise((resolve) => {
    const req = mockReq(headers);
    const res = mockRes();
    let nextCalled = false;
    requireUserAuth(req, res, () => {
      nextCalled = true;
      resolve({ req, res, nextCalled });
    });
    // If next isn't called synchronously, the middleware took the res.json path.
    // Defer to the next tick so we resolve with the response payload.
    setImmediate(() => {
      if (!nextCalled) resolve({ req, res, nextCalled });
    });
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('rejects request with no auth (401)', async () => {
  const { res, nextCalled } = await runMiddleware({});
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.error, 'Authentication required');
});

test('accepts valid Bearer JWT and populates req.user from payload', async () => {
  const token = signJwt(
    { sub: 'RB-OMI-A1B2', email: 'will@rebase.cn', name: 'Will' },
    TEST_SECRET
  );
  const { req, nextCalled } = await runMiddleware({ Authorization: `Bearer ${token}` });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.accountId, 'RB-OMI-A1B2');
  assert.strictEqual(req.user.email, 'will@rebase.cn');
  assert.strictEqual(req.user.verifiedVia, 'jwt');
});

test('falls back to x-user-id when no Bearer present (legacy path)', async () => {
  const { req, nextCalled } = await runMiddleware({ 'x-user-id': 'RB-LEGACY-CAFE' });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.accountId, 'RB-LEGACY-CAFE');
  assert.strictEqual(req.user.verifiedVia, 'legacy_header');
});

test('falls back to x-user-id when Bearer is tampered/invalid (Phase 1 leniency)', async () => {
  const tampered = signJwt({ sub: 'spoof' }, 'wrong-secret');
  const { req, nextCalled } = await runMiddleware({
    Authorization: `Bearer ${tampered}`,
    'x-user-id': 'RB-REAL-USER',
  });
  assert.strictEqual(nextCalled, true);
  // Should land on the legacy path since JWT verify failed
  assert.strictEqual(req.user.accountId, 'RB-REAL-USER');
  assert.strictEqual(req.user.verifiedVia, 'legacy_header');
});

test('rejects when Bearer fails and no x-user-id fallback present', async () => {
  const bad = signJwt({ sub: 'spoof' }, 'wrong-secret');
  const { res, nextCalled } = await runMiddleware({ Authorization: `Bearer ${bad}` });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('prefers Bearer over x-user-id when both present (Bearer wins)', async () => {
  const token = signJwt({ sub: 'RB-JWT-USER' }, TEST_SECRET);
  const { req, nextCalled } = await runMiddleware({
    Authorization: `Bearer ${token}`,
    'x-user-id': 'RB-DIFFERENT-USER',   // should be ignored
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.accountId, 'RB-JWT-USER');
  assert.strictEqual(req.user.verifiedVia, 'jwt');
});

test('extracts workspace_id from v2 token payload', async () => {
  const token = signJwt(
    { sub: 'user-uuid-v2', workspace_id: 'ws-uuid-123', email: 'a@b.cn' },
    TEST_SECRET
  );
  const { req, nextCalled } = await runMiddleware({ Authorization: `Bearer ${token}` });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.accountId, 'user-uuid-v2');
  assert.strictEqual(req.user.tokenWorkspaceId, 'ws-uuid-123');
});

test('malformed Bearer (not three parts) falls through to legacy path', async () => {
  const { req, nextCalled } = await runMiddleware({
    Authorization: 'Bearer not.a.valid.token',
    'x-user-id': 'RB-FALLBACK',
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.verifiedVia, 'legacy_header');
  assert.strictEqual(req.user.accountId, 'RB-FALLBACK');
});

test('empty Bearer token treated as missing (no crash)', async () => {
  const { res, nextCalled } = await runMiddleware({ Authorization: 'Bearer ' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});
