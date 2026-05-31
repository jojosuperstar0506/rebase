# Auth migration plan (Epic #85, sub-issue #142)

**Status:** ✅ All 4 phases + review fixes complete. PRs #158-#163 queued for merge.
**Last updated:** 2026-05-31
**Owner:** Will (backend), coordinates with Joanna for frontend swap.

## ✅ Migration complete

| Phase | PR | Status |
|---|---|---|
| 1 — JWT verify middleware + 8 routes opted in | #158 | ✅ Ready to merge |
| 2A — Workspace ownership enforced (3 routes) | #159 | ✅ Ready to merge |
| 2B-E — Workspace ownership enforced (13 routes) | #160 | ✅ Ready to merge |
| 3 — POST/PATCH/DELETE write routes | #161 | ✅ Ready to merge |
| Review fixes (3 critical IDOR + 9 minor) | #162 | ✅ Ready to merge |
| 4 — Drop legacy x-user-id, admin-tighten /scrape, integration test #143 | #163 | ✅ Ready to merge |

Sub-issues this closes:
- **#142** — JWT + customer_id middleware on every protected endpoint ✅
- **#143** — Integration test: customer A cannot read customer B's data ✅

## Review-fix log (PR #162)

A high-effort `/code-review` against the 4-PR stack surfaced 15 findings. PR #162 addresses the 10 most material ones before merge:

| # | Severity | Bug | Fix shipped |
|---|---|---|---|
| 1 | 🔴 CRITICAL IDOR | body.workspace_id beat params.id on PATCH /workspace/:id | `requireWorkspaceOwnership` now rejects mismatched workspace_id across query/body/params with 400 |
| 2 | 🔴 CRITICAL IDOR | query.workspace_id beat body.workspace_id on POST routes | Same fix as #1 — all sources must agree |
| 3 | 🔴 CRITICAL auth bypass | JWT_SECRET defaulted to 'rebase-dev-secret' if env missing | New `getJwtSecret()` throws in NODE_ENV=production; one shared helper used by all 3 sign/verify sites |
| 4 | 🟡 anon class bypass | `anon-XXX` x-user-id passed as authenticated | Legacy path rejects `anon-*` prefix |
| 6 | 🟡 cascade integrity | DELETE competitor was 5 separate queries — orphan rows on network blip | Wrapped in BEGIN/COMMIT with `SELECT … FOR UPDATE`, restoring PR #115's promise |
| 7 | 🟡 Phase 4 break | `ciIndices.ts` had a parallel `getHeaders` that didn't send Bearer | Updated to mirror `ciApi.ts` (TODO: extract to shared util) |
| 8 | 🟡 ops break | `SCRAPING-DEPLOY-RUNBOOK.md` curl 401s after Phase 3 | Updated curl with `x-user-id` header + owner-lookup query |
| 9 | 🟡 silent no-op | PATCH workspace handler still read body.user_id | Now uses `req.user.accountId` |
| 10 | 🟡 silent downgrade | `Bearer` prefix was case-sensitive | Regex `/^Bearer\s+/i` |
| 12 | 🟢 minor | DELETE :id non-UUID → generic 500 | `isValidUuid` guard at top |
| 13 | 🟢 minor | Frontend malformed-token catch was empty | Now clears localStorage like the stale-sub branch |
| 14 | 🟢 defensive | Duplicate query-key produces array | `String()` coercion makes array a non-UUID string → clean 400 |

Findings 5, 11, 15 were re-checked and judged non-issues or out-of-scope:
- **5** (alerts/read break): frontend always sends workspace_id; verified clean
- **11** (invalid-UUID 400 vs []): frontend hardening, separate concern — handled at frontend layer
- **15** (POST /api/ci/workspace unmigrated): documented Phase 1 exception (anonymous onboarding requirement)

## Decisions locked (2026-05-31)

1. **Enforce-immediately, no dry-run period.** At 1-customer scale (OMI), the cost of a missed-route false-403 is "Will pings me, I fix in 5 min." Dry-run overhead doesn't pay back yet. Revisit when real beta users join (M1 exit).
2. **Drop `x-user-id` fallback at Phase 4** (the safer default). Keep both auth paths working through Phases 2-3 so any missed call site still resolves. Final integration test in Phase 4 verifies every route is JWT-verified before we remove the legacy path.
3. **Routes without a `workspace_id` param** (e.g. `/api/ci/scrape-targets`, internal service endpoints) stay on `requireSecret`-only — no `requireWorkspaceOwnership` since there's nothing to check. They're documented as exceptions in the cluster list below.

---

## Why this doc exists

Today, **any logged-in user can read any other user's data** by manipulating `?workspace_id=<uuid>` in a request URL. This is a textbook IDOR (Insecure Direct Object Reference) vulnerability. It hasn't bitten us because:

1. We have ~1 real customer (OMI).
2. Workspace UUIDs are not easily enumerable from outside.

Both of those go away the moment we onboard beta users (the M1 goal). This doc captures the migration plan so we don't ship M1 with this hole open.

---

## Important: "drop x-user-id" ≠ "drop user identifiers"

This is the most-confused part of the plan, so calling it out up-front. Two things easily blur together:

| The user identifier (KEEP forever) | The `x-user-id` HTTP header (DROP in Phase 4) |
|---|---|
| `RB-OMI-A1B2` (invite code, or v2 UUID) | The HTTP header `x-user-id: RB-OMI-A1B2` |
| Stored in `workspaces.user_id`, in JWT's `sub` claim, in every log line, in every DB query | One of two transport mechanisms the frontend uses to tell the backend "I am this user" |
| Identifies the customer; appears everywhere | Just plumbing |

**The same user ID travels through two channels today:**

- **Channel A — Authorization header (cryptographically signed):**
  `Authorization: Bearer eyJ...` → decoded payload: `{ sub: "RB-OMI-A1B2", ... }`. Signature proves the user really logged in.
- **Channel B — x-user-id header (plain string):**
  `x-user-id: RB-OMI-A1B2` → just a string. Anyone with `API_SECRET` can write any value here. No tamper protection.

**Phase 4 = stop accepting Channel B, only accept Channel A.** `req.user.accountId` is still populated on every authenticated request. Logs still say `account RB-OMI-A1B2 attempted X`. DB queries still scope on `user_id = 'RB-OMI-A1B2'`. **Nothing about identification changes** — we just remove the trusted-text-input bypass.

Analogy: it's like switching from "show me your name on a Post-it" to "show me your government ID." You still have a name in both cases. We just stop accepting Post-its.

---

---

## The two problems in one sentence each

**Problem A — JWT is never verified on protected requests.** The backend's only auth check on `/api/*` is the `x-rebase-secret` header (a shared secret between Vercel and ECS, defined in `backend/server.js:39`). Anyone with that secret can spoof any user by setting `x-user-id` to any value. The JWT issued at login (`server.js:1006`, `server.js:4695`) is never `jwt.verify()`'d server-side.

**Problem B — `workspace_id` from query/body is trusted without ownership check.** Every endpoint does `req.query.workspace_id` and uses it directly to query data. There's no check that the authenticated user owns that workspace. Even with Problem A fixed, user A could send `?workspace_id=<user B's UUID>` and read user B's data.

---

## What's already in place

Good news — we don't start from zero:

- ✅ Every tenant-scoped table has `workspace_id` FK (Layer 3-5 in `docs/SCHEMA.md`)
- ✅ Every analytics handler already filters by `workspace_id` (just trusts the value blindly)
- ✅ JWTs ARE issued at login on both auth paths:
  - V1 (invite-code, `/api/auth/verify-code`) — sub = invite code, signed with `JWT_SECRET`
  - V2 (email+password, `/api/v2/auth/signup` and `/login`) — sub = user_id UUID, signed with `JWT_SECRET`
- ✅ Frontend already pulls `sub` from JWT and sends it as `x-user-id` (`frontend/src/services/ciApi.ts:55`)
- ✅ Helper `findCallerWorkspace(req)` exists (`server.js:4711`) — currently reads `x-user-id`, easy to extend to verify JWT

---

## The 3-phase plan

Splitting this across 3 PRs (not one big-bang) so each phase is reviewable and reversible.

### Phase 1 — Foundation, no enforcement (THIS PR)

**Scope:**
1. Add `requireUserAuth` middleware that:
   - Verifies `Authorization: Bearer <jwt>` if present → sets `req.user`
   - Falls back to legacy `x-user-id` header with a deprecation warning → sets `req.user` (`verifiedVia: 'legacy_header'`)
   - Returns 401 if neither present
2. Update `findCallerWorkspace` to prefer `req.user.accountId` (set by middleware) over reading `x-user-id` directly
3. Apply `requireUserAuth` to:
   - `/api/ci/workspaces` (the dropdown query — uses x-user-id today)
   - `/api/ci/workspace` / `/api/v2/onboarding/*` cluster (uses `findCallerWorkspace` today)
   - These are the smallest blast radius — they're the routes where identity matters most for "what data do I see"
4. Frontend: send `Authorization: Bearer <token>` header alongside the existing `x-user-id`
5. Vercel proxies (`api/ci.js`, `api/v2.js`, `api/admin.js`): forward the `Authorization` header
6. Add `requireWorkspaceOwnership` helper as a no-op import (wired in Phase 2)
7. Tests: add basic JWT-verification cases

**What this phase DOES NOT do:**
- ❌ Enforce workspace ownership (Problem B is still present)
- ❌ Remove the `x-user-id` legacy path (kept for backward compat)
- ❌ Touch the 40+ other `/api/ci/*` routes

**Verification:**
- Existing frontend works unchanged (both headers in transit).
- New requests with valid Bearer tokens populate `req.user` from JWT signature.
- Requests with no auth at all return 401.
- Audit log shows which code paths still rely on `x-user-id` (informs Phase 2 ordering).

**Risk:** Low. Adds capability; removes nothing.

### Phase 2 — Enforce workspace ownership on read-only routes

**Scope:** Apply `requireWorkspaceOwnership` middleware to GET routes, one cluster at a time, in this order:

1. **Cluster A — workspace + competitors** (~6 routes): `/api/ci/workspace`, `/api/ci/competitors`. Most-trafficked, simplest data.
2. **Cluster B — dashboard read** (~3 routes): `/api/ci/dashboard`, `/api/ci/intelligence`, `/api/ci/domain-scores`.
3. **Cluster C — brief read** (~4 routes): `/api/ci/brief`, `/api/ci/library`, `/api/ci/analytics`, `/api/ci/indices`.
4. **Cluster D — alerts + trends** (~5 routes): `/api/ci/alerts*`, `/api/ci/trends*`, `/api/ci/brand-insights`.
5. **Cluster E — deep-dive** (~3 routes): `/api/ci/deep-dive*`.

Each cluster is one PR. After each PR: smoke-test the UI for that section, then move on. Total ~21 routes.

**Decision needed before starting:**
- **Dry-run first?** (recommended) — log "would have denied" without blocking for one deploy per cluster, then flip to enforcement.
- Or **enforce immediately** — faster but riskier.

### Phase 3 — Enforce on write routes + analysis triggers

**Scope:** POST/PATCH/DELETE routes (highest risk of breaking user flows):

- `/api/ci/competitors` (POST/PATCH/DELETE)
- `/api/ci/run-analysis`, `/api/ci/scrape`
- `/api/ci/connections*`, `/api/ci/alerts/read`
- `/api/ci/brief/draft`, `/api/ci/deep-dive`
- `/api/v2/onboarding/*` (PATCH/POST)

~12 routes. One final PR. After this lands, the `x-user-id` legacy header support can be removed (Phase 4 cleanup).

### Phase 4 — Cleanup + integration test (closes sub-issue #143)

- Delete legacy `x-user-id` code path from `requireUserAuth` and `findCallerWorkspace`
- Delete `'x-user-id'` forwarding from Vercel proxies
- Add integration test: spin up 2 fixture workspaces, mint 2 tokens, prove customer A's token can't read customer B's workspace data via any endpoint
- Update `docs/SCHEMA.md` "auth model" section

---

## Routes inventory (the work is here)

**~75 total routes in `backend/server.js`.** Categorized for migration planning:

| Category | Count | Auth model |
|---|---|---|
| Admin (`/api/admin/*`) | 12 | Stay on `x-rebase-secret` (Vercel→ECS shared secret). Will + Joanna only callers. |
| Public auth (`/api/auth/verify-code`, `/api/v2/auth/*`) | 3 | Stay public (already whitelisted). |
| CI workspace-scoped (`/api/ci/*?workspace_id=`) | ~40 | **Migrate to `requireUserAuth + requireWorkspaceOwnership` over Phases 2-3** |
| CI lookup (no workspace_id) (`/api/ci/workspaces`, `/api/ci/workspace/me`) | 3 | **Migrate to `requireUserAuth` in Phase 1** |
| V2 onboarding (`/api/v2/onboarding/*`) | 6 | **Migrate to `requireUserAuth` in Phase 1 (read), Phase 3 (write)** |
| Legacy + utility (`/api/chat`, `/api/onboarding`, `/intelligence/feedback`, `/api/submit-lead`) | ~5 | Public or internal — not in scope. |
| Misc CI (`/api/ci/admin/*`, `/api/ci/parse-link`, `/api/ci/resolve-brand`, `/api/ci/brands/search`) | ~6 | Review case-by-case in Phase 3. |

---

## Decisions Will needs to make before Phase 2

1. **Dry-run vs enforce-immediately on each cluster?**
   - Dry-run (recommended): one deploy per cluster in log-only mode, then flip to enforcement after watching logs for 24-48h
   - Enforce-immediately: faster but rollback is reactive not proactive
2. **Drop `x-user-id` fallback after Phase 2 or after Phase 4?**
   - After Phase 2: forces all writes to use Bearer immediately — cleaner, slightly riskier
   - After Phase 4: legacy path stays alive until final integration test passes — safer, more code paths to maintain meanwhile
3. **Admin auth** — keep `x-rebase-secret` indefinitely, or eventually introduce admin JWTs?
   - For 2-person team and ~12 admin routes, shared secret is fine. Revisit at >5 admins.

---

## Why not just delete `x-user-id` and force Bearer everywhere right now?

Tempting, but the failure mode is bad: any frontend code path that doesn't send `Authorization: Bearer` would 401 immediately on the first deploy after merge. Without dry-run telemetry, we don't know which paths those are. The cost of Phase 1's backward compat is ~30 lines of fallback code; the cost of getting it wrong is "every user 401s for an hour while you debug." Worth it.

---

## How to verify Phase 1 worked

Before opening as ready-for-review:

1. ✅ `npm run build` passes (frontend types)
2. ✅ `node --test tests/` passes (no new test failures)
3. ✅ Deploy to staging (or local) — log in via current frontend → verify `/api/ci/workspaces` still returns workspaces (Bearer accepted)
4. ✅ Strip `Authorization` header from a request manually → verify it still works via `x-user-id` fallback (legacy path warning logged)
5. ✅ Strip BOTH headers → verify 401 (was previously 200 with empty data)
6. ✅ Send a valid `x-user-id` but a TAMPERED Bearer token → verify it falls through to x-user-id (JWT failure logged but not blocking)

Phase 2 starts after Will reviews this PR and approves the dry-run-vs-enforce decision.
