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
// PHASE 4: Bearer-only. The legacy x-user-id fallback is gone — no JWT,
// no req.user, 401. Kept in sync with backend/server.js. Edit one, edit both.
function requireUserAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  // Case-insensitive Bearer prefix (review fix #10).
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const bearer = bearerMatch ? bearerMatch[1] : null;
  if (!bearer) {
    return res.status(401).json({ error: 'Authentication required (Bearer token)' });
  }
  try {
    const payload = verifyJwt(bearer, TEST_SECRET);
    req.user = {
      accountId: (payload.sub || '').toString(),
      email: payload.email || '',
      name: payload.name || '',
      tokenWorkspaceId: payload.workspace_id || null,
      verifiedVia: 'jwt',
    };
    if (!req.user.accountId) {
      return res.status(401).json({ error: 'Token missing subject' });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Middleware (mirror of backend/server.js requireWorkspaceOwnership) ──────
// This is the new "all sources must agree" middleware from review fix #1+2.
// In production it does a DB query — for tests we stub the ownership lookup
// to a known good account/workspace pair.
const TEST_OWNED_WORKSPACE_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const TEST_OWNED_ACCOUNT_ID = 'RB-TEST-USER';
function ownershipCheckStub(workspaceId, accountId) {
  return workspaceId === TEST_OWNED_WORKSPACE_ID && accountId === TEST_OWNED_ACCOUNT_ID;
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s) { return typeof s === 'string' && UUID_PATTERN.test(s); }

async function requireWorkspaceOwnership(req, res, next) {
  const candidates = [];
  if (req.query && req.query.workspace_id !== undefined) {
    candidates.push({ src: 'query.workspace_id', val: req.query.workspace_id });
  }
  if (req.body && req.body.workspace_id !== undefined) {
    candidates.push({ src: 'body.workspace_id', val: req.body.workspace_id });
  }
  if (req.params && req.params.workspace_id !== undefined) {
    candidates.push({ src: 'params.workspace_id', val: req.params.workspace_id });
  }
  if (req.params && req.params.id !== undefined) {
    candidates.push({ src: 'params.id', val: req.params.id });
  }
  if (candidates.length === 0) {
    return res.status(400).json({ error: 'Missing workspace_id' });
  }
  const stringified = candidates.map((c) => ({ src: c.src, val: String(c.val) }));
  const first = stringified[0].val;
  for (const c of stringified.slice(1)) {
    if (c.val !== first) {
      return res.status(400).json({ error: 'workspace_id mismatch' });
    }
  }
  const workspaceId = first;
  if (!isValidUuid(workspaceId)) {
    return res.status(400).json({ error: 'Invalid workspace_id' });
  }
  if (!req.user || !req.user.accountId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!ownershipCheckStub(workspaceId, req.user.accountId)) {
    return res.status(403).json({ error: 'Workspace not owned by this account' });
  }
  next();
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
  assert.match(res.body.error, /Bearer/);
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

test('PHASE 4: x-user-id alone is no longer accepted (was Phase 1-3 legacy path)', async () => {
  const { res, nextCalled } = await runMiddleware({ 'x-user-id': 'RB-LEGACY-CAFE' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('PHASE 4: tampered Bearer 401s — no x-user-id fallback', async () => {
  const tampered = signJwt({ sub: 'spoof' }, 'wrong-secret');
  const { res, nextCalled } = await runMiddleware({
    Authorization: `Bearer ${tampered}`,
    'x-user-id': 'RB-REAL-USER',   // ignored — no fallback
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('rejects when Bearer fails (no fallback)', async () => {
  const bad = signJwt({ sub: 'spoof' }, 'wrong-secret');
  const { res, nextCalled } = await runMiddleware({ Authorization: `Bearer ${bad}` });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('Bearer wins regardless of any other headers', async () => {
  const token = signJwt({ sub: 'RB-JWT-USER' }, TEST_SECRET);
  const { req, nextCalled } = await runMiddleware({
    Authorization: `Bearer ${token}`,
    'x-user-id': 'RB-DIFFERENT-USER',   // ignored
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

test('PHASE 4: malformed Bearer 401s — no fallback', async () => {
  const { res, nextCalled } = await runMiddleware({
    Authorization: 'Bearer not.a.valid.token',
    'x-user-id': 'RB-WOULD-HAVE-WORKED-IN-PHASE-3',
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('empty Bearer token treated as missing (no crash)', async () => {
  const { res, nextCalled } = await runMiddleware({ Authorization: 'Bearer ' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('PHASE 4: token with empty sub claim 401s ("token missing subject")', async () => {
  const token = signJwt({ sub: '', email: 'a@b.cn' }, TEST_SECRET);
  const { res, nextCalled } = await runMiddleware({ Authorization: `Bearer ${token}` });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

// ── Review-fix regression tests (still relevant in Phase 4) ─────────────────

test('REVIEW FIX #10: accepts lowercase bearer prefix (case-insensitive)', async () => {
  const token = signJwt({ sub: 'RB-LOWERCASE-USER' }, TEST_SECRET);
  const { req, nextCalled } = await runMiddleware({
    Authorization: `bearer ${token}`,
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.accountId, 'RB-LOWERCASE-USER');
  assert.strictEqual(req.user.verifiedVia, 'jwt');
});

test('REVIEW FIX #10: accepts ALL-CAPS BEARER prefix', async () => {
  const token = signJwt({ sub: 'RB-UPPER-USER' }, TEST_SECRET);
  const { req, nextCalled } = await runMiddleware({
    Authorization: `BEARER ${token}`,
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.verifiedVia, 'jwt');
});

// ── Ownership middleware tests (review fix #1+#2) ──────────────────────────

// Helper to run requireWorkspaceOwnership with a pre-populated req.user.
function runOwnership(req) {
  return new Promise((resolve) => {
    const res = mockRes();
    let nextCalled = false;
    requireWorkspaceOwnership(req, res, () => {
      nextCalled = true;
      resolve({ req, res, nextCalled });
    });
    setImmediate(() => { if (!nextCalled) resolve({ req, res, nextCalled }); });
  });
}

const OWNED_REQ_USER = { accountId: TEST_OWNED_ACCOUNT_ID, verifiedVia: 'jwt' };

test('REVIEW FIX #1: ownership passes when single source (query) matches owned workspace', async () => {
  const { res, nextCalled } = await runOwnership({
    user: OWNED_REQ_USER,
    query: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    body: {},
    params: {},
  });
  assert.strictEqual(nextCalled, true, res.body && res.body.error);
});

test('REVIEW FIX #1: ownership passes when all sources agree', async () => {
  const { nextCalled } = await runOwnership({
    user: OWNED_REQ_USER,
    query: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    body: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    params: { id: TEST_OWNED_WORKSPACE_ID },
  });
  assert.strictEqual(nextCalled, true);
});

test('REVIEW FIX #1 (CRITICAL): rejects body.workspace_id vs params.id mismatch with 400', async () => {
  // The IDOR vector: PATCH /api/ci/workspace/<victim> with body { workspace_id: <owned> }.
  // Pre-fix: middleware authorized body (owned), handler operated on params.id (victim).
  // Post-fix: 400 'workspace_id mismatch'.
  const { res, nextCalled } = await runOwnership({
    user: OWNED_REQ_USER,
    query: {},
    body: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    params: { id: 'bbbbbbbb-1111-2222-3333-444444444444' },  // victim
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /mismatch/);
});

test('REVIEW FIX #2 (CRITICAL): rejects query.workspace_id vs body.workspace_id mismatch with 400', async () => {
  // The IDOR vector: POST /api/ci/run-analysis?workspace_id=<owned> with body { workspace_id: <victim> }.
  // Pre-fix: middleware authorized query (owned), handler operated on body (victim).
  // Post-fix: 400 'workspace_id mismatch'.
  const { res, nextCalled } = await runOwnership({
    user: OWNED_REQ_USER,
    query: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    body: { workspace_id: 'bbbbbbbb-1111-2222-3333-444444444444' },  // victim
    params: {},
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /mismatch/);
});

test('REVIEW FIX #14: array workspace_id (duplicate query keys) safely rejected as invalid UUID', async () => {
  // Express parses `?workspace_id=a&workspace_id=b` as the array ['a','b'].
  // After String() coercion the candidate becomes 'a,b' — not a UUID — so we
  // get a clean 400 instead of an array reaching pg.
  const { res, nextCalled } = await runOwnership({
    user: OWNED_REQ_USER,
    query: { workspace_id: [TEST_OWNED_WORKSPACE_ID, 'bbbbbbbb-1111-2222-3333-444444444444'] },
    body: {},
    params: {},
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
});

test('ownership rejects when user does not own workspace (403)', async () => {
  const { res, nextCalled } = await runOwnership({
    user: { accountId: 'RB-OTHER-USER', verifiedVia: 'jwt' },
    query: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    body: {},
    params: {},
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test('ownership 400 when no workspace_id source present', async () => {
  const { res } = await runOwnership({
    user: OWNED_REQ_USER,
    query: {},
    body: {},
    params: {},
  });
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /Missing/);
});

test('ownership 400 on non-UUID workspace_id', async () => {
  const { res } = await runOwnership({
    user: OWNED_REQ_USER,
    query: { workspace_id: 'not-a-uuid' },
    body: {},
    params: {},
  });
  assert.strictEqual(res.statusCode, 400);
});

test('ownership 401 when middleware ordered wrong (no req.user)', async () => {
  // Defense-in-depth: even if someone forgets requireUserAuth, ownership
  // middleware refuses to authorize against an unset req.user.
  const { res } = await runOwnership({
    user: undefined,
    query: { workspace_id: TEST_OWNED_WORKSPACE_ID },
    body: {},
    params: {},
  });
  assert.strictEqual(res.statusCode, 401);
});
