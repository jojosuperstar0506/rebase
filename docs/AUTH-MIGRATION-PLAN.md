# Auth migration plan (Epic #85, sub-issue #142)

**Status:** Phase 1 merged (PR #158). Phase 2 cluster A in flight.
**Last updated:** 2026-05-31
**Owner:** Will (backend), coordinates with Joanna for frontend swap.

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
