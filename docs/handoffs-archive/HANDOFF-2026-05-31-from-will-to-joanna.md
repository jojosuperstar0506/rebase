# Handoff — 2026-05-31 (Will → Joanna)

**TL;DR:** Tonight closed most of **Epic #85 / sub-issue #142** (per-user auth + workspace ownership enforcement). 5 draft PRs queued in a stack: **#158 → #159 → #160 → #161 → #162**. A code-review pass on the stack caught 3 critical exploitable bugs that we'd have shipped — those are all fixed in #162.

Your Claude session should read this top-to-bottom before touching auth code or merging anything.

---

## What was shipped

### Sub-issue #142 — JWT verify + customer_id filter, end-to-end

Pre-tonight state: the backend never verified the JWT we issued at login. The `x-user-id` header was taken on faith. Any logged-in user could read another's workspace data by sending `?workspace_id=<other-uuid>` (textbook IDOR).

Post-tonight state (once the 5 PRs land):
- ✅ JWT signatures actually verified on every protected route
- ✅ Workspace ownership enforced on 16 GET + 10 POST/PATCH/DELETE routes
- ✅ Expensive routes (`/run-analysis`, `/scrape`, `/deep-dive`) protected from unauthorized triggers
- ✅ JWT_SECRET fail-closed in production (no more silent 'rebase-dev-secret' fallback)
- ✅ Anonymous (`anon-*`) users 401 on protected routes (Phase 1 had silently let them through)
- ✅ DELETE competitor cascade is transactional (PR #115's "no zombies" promise actually delivered)
- ✅ 21 auth-middleware tests (up from 9) lock down each IDOR vector and the contract

### The PR stack

```
main
 └─ #158 (Phase 1 foundation)            ← review + merge first
     └─ #159 (Phase 2 cluster A)         ← merge second
         └─ #160 (Phase 2 B+C+D+E)       ← merge third
             └─ #161 (Phase 3 writes)    ← merge fourth
                 └─ #162 (review fixes)  ← merge fifth, closes most of #142
```

Each PR is small + focused, but they ARE stacked (each base = the previous branch). When you merge #158, GitHub auto-retargets #159's base to main. Repeat down the stack.

---

## Critical: ECS config you need to verify before merging

I rotated `JWT_SECRET` on ECS tonight from the placeholder string `change_me_in_dot_env` to a real 64-char hex:

```
JWT_SECRET=654dd10544a8d78b1b90bf604143ed1b002baa1cc4c3f994362c42e5413b84d6
```

(File: `/root/rebase/backend/.env`)

I **also** updated Vercel's `JWT_SECRET` env var to the same value (per the [environment variables panel](https://vercel.com/jojosuperstar0506s-projects/rebase/settings/environment-variables) — pre-existing value was `rebase2026-will-joanna-secret-key`, now matches ECS).

**If you re-deploy from your branch BEFORE merging this stack**, double-check `JWT_SECRET` matches on both sides. Mismatch = every JWT verify fails silently and the new middleware downgrades to legacy x-user-id path → security gain is zero.

To verify on ECS: `ssh root@8.217.242.191 'grep JWT_SECRET /root/rebase/backend/.env'`
To verify on Vercel: settings → environment-variables → JWT_SECRET should match.

**Side effect of the rotation:** all existing logged-in users have stale tokens (signed with the old placeholder). After the next Vercel deploy, they get logged out. Just re-login once. For 1 customer (OMI), trivial.

---

## What "drop x-user-id" actually means (this confused Will tonight)

If you read PR #161 / #162 / the plan doc, you'll see "Phase 4: drop x-user-id." This is NOT removing user identifiers from the system.

| The user identifier (KEEP forever) | The `x-user-id` HTTP header (DROP in Phase 4) |
|---|---|
| `RB-OMI-A1B2`, stored in `workspaces.user_id`, in JWT.sub, in logs, in DB queries | One of two transport mechanisms — a plain HTTP header carrying the user ID, no signature |

Phase 4 stops accepting the unsigned/spoofable transport. The actual user identifiers are still everywhere. Full explanation lives in `docs/AUTH-MIGRATION-PLAN.md` at the top.

---

## The code review caught 3 real bugs — read PR #162 carefully

A `/code-review --effort high` against the full 4-PR stack surfaced 15 findings. 3 were CRITICAL exploitable bugs I would have shipped:

**1. IDOR via workspace_id source mismatch.** The middleware resolved `workspace_id` in priority `query → body → params.workspace_id → params.id` and used whichever it found first. Two attack vectors:
   - `PATCH /api/ci/workspace/<victim>` with body `{workspace_id: <owned>}` → middleware authorized owned, handler updated victim
   - `POST /api/ci/run-analysis?workspace_id=<owned>` with body `{workspace_id: <victim>}` → middleware authorized owned, handler triggered Apify+DeepSeek on victim's tab
   
   **Fix in #162:** middleware collects ALL sources, requires consensus. Mismatch = 400.

**2. JWT_SECRET defaulted to `'rebase-dev-secret'`.** If env unset in prod (deploy slip), backend silently used the public-in-repo fallback string — anyone with repo read access could forge tokens for any user. **Fix in #162:** new `getJwtSecret()` throws in production when env unset.

**3. Anon-XXX legacy bypass.** Frontend generates `anon-XXX` x-user-id for logged-out browsers. Backend was accepting these as "authenticated" via the legacy path, defeating Phase 1 enforcement for the entire anon class. **Fix in #162:** legacy path rejects `anon-*` prefix.

Plus 9 important/minor fixes (transactional DELETE cascade, ciIndices.ts parallel headers that would break in Phase 4, case-insensitive Bearer prefix, etc.). All documented in `docs/AUTH-MIGRATION-PLAN.md` review-fix log.

---

## Merge procedure (your call when)

1. **Verify JWT_SECRET on ECS matches Vercel** (see config section above)
2. **Merge in order:** #158 → #159 → #160 → #161 → #162
3. **Smoke-test after each:** open prod, log in, click around, watch DevTools Network for unexpected 401/403
4. **The acid test (after #162 merges):** in browser console:
   ```js
   // Should 400 (mismatch) — this is the IDOR fix
   fetch('/api/ci/run-analysis?workspace_id=00000000-0000-0000-0000-000000000000', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('rebase_token') },
     body: JSON.stringify({ workspace_id: 'YOUR-REAL-WORKSPACE-ID' })
   }).then(r => r.json()).then(console.log)
   // Expected: { error: 'workspace_id mismatch — ...' }
   ```

If anything breaks unexpectedly, revert the PR that broke it via GitHub UI ("Revert" button) and ping Will.

---

## What's left on Epic #85 / #142 (Phase 4 — ~2.5 hrs, separate session)

- Drop `x-user-id` fallback entirely from `requireUserAuth` and `findCallerWorkspace`
- Update all 3 frontend `getHeaders()` helpers to send Bearer only (drop x-user-id)
- Refactor `GET /api/ci/analysis/status` to handle workspace_id-or-job_id duality with a more nuanced helper
- Tighten `POST /api/ci/scrape` to admin-only or per-user rate-limit (currently any authed user can trigger Apify spend on any brand)
- Write integration test (#143): spin up 2 fixture workspaces, prove customer A's token can't read customer B's data through any endpoint
- After all green: remove the legacy code paths

This phase closes both sub-issue #142 AND sub-issue #143 in one go.

---

## Other Epic #85 work (NOT in this stack)

- **#141 (HTTPS on ECS + delete Vercel auth proxies)** — still blocked on domain decision. Will hasn't bought one yet. Path of least resistance: Cloudflare Registrar (~$10/yr, free TLS proxy). Defer-able indefinitely — Vercel proxies work fine.
- **#133 (backup script hardening)** — still pending from the 2026-05-26 batch.

---

## Things changed since the 2026-05-26 handoff

- ECS `/root/rebase/backend/.env` now has real `JWT_SECRET` (was placeholder)
- `docs/AUTH-MIGRATION-PLAN.md` exists (created in PR #158)
- `docs/SCRAPING-DEPLOY-RUNBOOK.md` § "Trigger scoring" curl now requires `x-user-id` header
- 21 auth-middleware tests in `tests/auth-middleware.test.mjs` (was 9)
- 2 frontend service files send Bearer + x-user-id: `ciApi.ts`, `ciIndices.ts`

If your session edits any other file under `frontend/src/services/`, audit it for a `getHeaders()` function and apply the same fix (send Bearer alongside x-user-id, clear malformed tokens).

---

## File ownership reminder

Per `CLAUDE.md` § "Where things live":
- I touched `backend/server.js` (your: don't touch unless ratified)
- I touched `frontend/src/services/ciApi.ts` and `ciIndices.ts` (your turf — flagging in case you have parallel changes)
- The Vercel proxies (`api/ci.js`, `api/v2.js`) got 3 lines each — header forwarding only

If you have in-flight branches that touch any of these, expect merge conflicts on the auth-related lines. The fixes are mechanical.

---

## Questions?

Quote-reply in WeChat or comment on the relevant PR. Three I'd flag specifically:

1. Do you want me to do Phase 4 in the next session, or pick up something else (e.g. #132 polling bug, #146 cost telemetry, your intelligence epic #136)?
2. Do you want a domain bought (Cloudflare $10/yr) to unblock #141? Or keep deferring?
3. Anything in the merge procedure that's unclear?

— Will (via Claude, 2026-05-31)
