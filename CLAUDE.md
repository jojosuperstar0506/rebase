# Rebase Platform — Development Guidelines

> The shared rulebook for everyone working in this repo — Joanna, William,
> and every Claude Code session. Read this first. When conventions change,
> update this file in the same PR.

## Before You Touch Data, the DB, or ECS — read `docs/SCHEMA.md` first

**Required reading whenever the task involves any of:**
- Writing SQL against the production DB (especially on ECS at `8.217.242.191`)
- Adding or modifying a file in `backend/migrations/`
- Debugging "where does X data live" or "why is field Y empty in the UI"
- Touching anything in `services/competitor_intel/db_bridge.py`
- Adding columns the frontend reads (must match the schema doc's "Where does X live?" table)

`docs/SCHEMA.md` is the **single source of truth** for the 17-table layout (5 conceptual layers: identity → raw scrape → scored → brief → operational). It has the data-flow diagram, a "Where does X live?" lookup, and the 7 SQL recipes we keep rewriting.

**If you change a migration, you MUST update `docs/SCHEMA.md` in the same PR.** Drift between code and the schema doc is worse than no doc.

## Collaboration Rules

### `main` is production
`main` auto-deploys to Vercel. A push to `main` IS a production deploy.
- **Never commit directly to `main`.** Every change goes through a branch + PR.
- This holds even for one-line fixes, and even when working solo.
- Self-merge is fine once the Vercel preview check is green — the PR is for
  the preview URL and the permanent record, not for gatekeeping.

### Branches
- Name them `<owner>/<area>-<short-desc>` — e.g. `joanna/frontend-login-redesign`,
  `will/backend-erp-connector`, `claude/agent-scoring-fix`.
- One branch = one logical change. Keep branches short-lived.
- Delete the branch after merge. Don't let branches pile up.

### Pull Requests
- Fill in the PR template: What changed / Why / How to test / Areas touched.
- Link the issue it closes: `Fixes #123` (auto-closes the issue on merge).
- The PR description is the changelog — write it for the other founder.

### Where things live — update the RIGHT place
| Path | What | Primary owner |
|------|------|---------------|
| `frontend/` | React + Vite SPA | Joanna |
| `api/` | Vercel serverless functions — **the deployed ones** | William |
| `backend/` | Node/Express API on ECS | William |
| `gateway/` | FastAPI gateway | William |
| `services/competitor_intel/` | OMI competitive-intel pipeline | Joanna |
| `services/diagnostics/` | Intake + analysis + report | William |
| `services/{agent-executor,multi-agent,workflow-engine,cost-engine,product-agent}/` | Python services | see CODEOWNERS |
| `backend/migrations/` | Postgres schema — numbered SQL only. **Updating here = update `docs/SCHEMA.md` in same PR** | William |
| `docs/`, `ROADMAP.md`, `README.md` | Shared docs. `docs/SCHEMA.md` = DB cheat-sheet (read before SQL/migration work) | Both |

- `.github/CODEOWNERS` auto-requests the right reviewer when you touch an
  area. Trust it — if it pings the other founder, that area isn't yours.
- There is exactly ONE deployed `api/` — the repo-root one. Do not add a
  second copy elsewhere.

### API changes
- Changing a request/response shape = update the contract in the SAME PR.
- Frontend ↔ backend request/response types live in `shared/`. Keep both
  sides in sync; never let one drift.

### Database
- Schema changes ONLY via a new numbered migration in `backend/migrations/`.
- Never edit a migration that has already been applied — always add a new
  number.

### Documentation — what lives where
- **GitHub Issues** — the live task list. What to do next. Labelled by
  `area:` and `owner:`. (This replaces the old `TODO.md`.)
- **`ROADMAP.md`** — strategy. Quarter-level what & why. Not task-level.
- **PR descriptions** — the changelog. Every merge documents itself.
- **`CLAUDE.md`** (this file) — the rules. Update when conventions change.

### Definition of done — PR checklist
- [ ] Branched off latest `main`, named `<owner>/<area>-<desc>`
- [ ] PR template filled in; linked issue (`Fixes #…`)
- [ ] Build / tests pass; Vercel preview checked
- [ ] Docs updated if behavior, API shape, or DB schema changed
- [ ] Branch deleted after merge

---

## Environment Variables — NEVER Hardcode

All external service URLs, API keys, and region-specific config MUST come from environment variables (`.env` file), never hardcoded in source code.

**Before writing any code that connects to an external service, check `.env.example` for the variable name.**

Examples of what MUST be an env var:
- Database host/port/credentials
- AI model API keys and base URLs (DeepSeek, Qwen, GLM)
- Object storage endpoints (OSS)
- Dify API URL and key
- Redis connection
- Neo4j connection
- Cloud region identifier

This ensures we can switch from Alibaba Cloud Hong Kong to Guangzhou (or any other region) by changing `.env` only — zero code changes.

## Quick Reference

- **GitHub Issues** — the live task board. What we're working on now.
- **`.github/CODEOWNERS`** — who owns which directory; drives PR review routing.
- **`CLAUDE.md`** — this file. The shared rulebook (humans + AI sessions).
- **`docs/SCHEMA.md`** — DB cheat-sheet. 17 tables, 5 layers, "where does X live" lookup, SQL recipes. **Read before any DB/migration work.**
- **`docs/SCRAPING-STRATEGY.md`** — current scraping approach (Apify Tier B via easyapi actors).
- **`docs/SCRAPING-DEPLOY-RUNBOOK.md`** — phased ECS deploy procedure for the scraper.
- **`.env.example`** — template with all variable names and comments. Copy to `.env` for local dev.
- **`.env`** — your actual secrets. NEVER commit this (it's in `.gitignore`).
- **`ROADMAP.md`** — strategy: 5-layer product plan, sprints, cloud strategy. Not task-level tracking.
- **`README.md`** — project overview, team roles, tech stack, quick start.

## Document Consistency

`README.md` and `ROADMAP.md` must stay in sync. When updating one, check if the other needs matching changes — especially for: team roles, tech stack, cloud strategy, and current work status.

## Cloud Strategy

- Phase 1: Alibaba Cloud Hong Kong (no ICP needed, fast launch)
- Phase 2: Add Guangzhou for mainland compliance
- All config is region-agnostic via env vars

## AI Models

Use env vars for model selection. Default stack:
- DeepSeek V3 — primary (production analysis, classification)
- Qwen — backup (Chinese language tasks)
- GLM-4-Flash — free tier (dev/testing)
