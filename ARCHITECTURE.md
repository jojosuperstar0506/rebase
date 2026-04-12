# Rebase Platform Architecture

## System Overview

```
                        +---------------------+
                        |    User Browser      |
                        |  (React 19 + Vite)   |
                        +----------+----------+
                                   |
                        +----------v----------+
                        |    Vercel (CDN)      |
                        |  Static SPA + 7 API  |
                        |  Serverless Functions |
                        +----------+----------+
                                   |
                          x-rebase-secret
                          x-user-id (JWT)
                                   |
                        +----------v----------+
                        |  Alibaba Cloud ECS   |
                        |  Express.js :8000    |
                        |  (Hong Kong Region)  |
                        +--+------+-------+---+
                           |      |       |
              +------------+  +---+---+  ++----------+
              |               |       |  |           |
    +---------v------+ +-----v----+ +v---v------+ +--v-----------+
    |  PostgreSQL    | | Python   | | AI Models | | Alibaba OSS  |
    |  (Alibaba RDS) | | Services | |           | | (Storage)    |
    +----------------+ +----------+ +-----------+ +--------------+
```

## Data Flow

```
+------------------------------------------------------------------+
|                                                                    |
|  FRONTEND (Vercel)          BACKEND (ECS)          DATA LAYER     |
|                                                                    |
|  React SPA                  Express.js              PostgreSQL     |
|  +-----------+              +-----------+           +----------+  |
|  | Login     |--invite----->| verify-   |           |workspaces|  |
|  |           |<---JWT-------| code      |           |competi-  |  |
|  +-----------+              +-----------+           | tors     |  |
|                                                     |analysis_ |  |
|  +-----------+   /api/ci/*  +-----------+           | results  |  |
|  | CI Dash-  |--workspace-->| /workspace|---------->|analysis_ |  |
|  | board     |   /me        | /me       |  SELECT   | narra-   |  |
|  |           |<--JSON-------| (GET)     |<----------|  tives   |  |
|  +-----------+              +-----------+           |ci_alerts |  |
|                                                     |ci_*_jobs |  |
|  +-----------+              +-----------+           +----------+  |
|  | Settings  |--run-------->| /run-     |                |        |
|  | Start     |  analysis    | analysis  |--spawn-------->|        |
|  | Analysis  |<--job_id-----| (POST)    |    Python      |        |
|  +-----------+              +-----------+  scoring_   +--v-----+  |
|                                            pipeline   | Python |  |
|  +-----------+              +-----------+  .py        |Services|  |
|  | Dashboard |--poll------->| /analysis |             |--------|  |
|  | Progress  |  every 3s    | /status   |             |scoring |  |
|  | Bar       |<--progress---| (GET)     |             |narrate |  |
|  +-----------+              +-----------+             |scrape  |  |
|                                                       |alerts  |  |
|  +-----------+              +-----------+             +--------+  |
|  | AI Suggest|--category--->| /suggest- |                         |
|  | (LLM)    |  + price     | competi-  |----> DeepSeek API       |
|  |           |<--brands-----| tors      |<---- (LLM response)    |
|  +-----------+              +-----------+                         |
|                                                                    |
+------------------------------------------------------------------+
```

## Component Details

### Frontend (Vercel)
- **Framework**: React 19 + TypeScript + Vite
- **Routing**: React Router DOM 7
- **State**: AppContext (theme/lang/auth) + localStorage (CI data cache)
- **Auth Token**: JWT stored in `localStorage.rebase_token`
- **CI Data**: Dual strategy - API first, localStorage fallback
- **Key Pages**: /ci (dashboard), /ci/settings, /ci/landscape, /ci/competitors, /ci/deep-dive/:brand

### Vercel Serverless Functions (7)
| Function | Purpose |
|----------|---------|
| `api/ci.js` | Unified proxy for ALL /api/ci/* routes to ECS |
| `api/ai.js` | Anthropic Claude proxy |
| `api/auth/verify-code.js` | Login auth proxy |
| `api/admin.js` | Admin dashboard proxy |
| `api/onboarding.js` | Public onboarding form |
| `api/submit-lead.js` | Calculator lead capture |
| `api/workflow-lead.js` | Workflow lead capture |

**Required Vercel Environment Variables:**
- `ECS_URL` - Backend URL (e.g., `http://47.xxx.xxx.xxx:8000`)
- `API_SECRET` - Shared secret for ECS auth
- `ANTHROPIC_API_KEY` - For /api/ai proxy

### Backend (Alibaba ECS)
- **Runtime**: Node.js + Express.js on port 8000
- **Process Manager**: PM2
- **Auth**: `requireSecret` middleware (x-rebase-secret header)
- **Rate Limiting**: 20 req/min general, 60 req/min CI routes
- **30+ API endpoints** under /api/ci/*

### Database (PostgreSQL on Alibaba RDS)
| Table | Purpose |
|-------|---------|
| `workspaces` | One per user - brand profile |
| `workspace_competitors` | Tracked competitors per workspace |
| `platform_connections` | XHS/Douyin/SYCM auth cookies |
| `scraped_products` | Product data from competitors |
| `scraped_brand_profiles` | Brand metrics per platform |
| `analysis_results` | Scored metrics (momentum/threat/wtp) |
| `analysis_narratives` | AI-generated cross-brand insights |
| `ci_alerts` | Real-time anomaly alerts |
| `ci_deep_dive_jobs` | Deep-dive job tracking (5 stages) |
| `ci_analysis_jobs` | General analysis job tracking (4 stages) |

### AI Models
| Model | Provider | Use Case |
|-------|----------|----------|
| Claude (Opus/Sonnet) | Anthropic | Primary chat, analysis, narratives |
| DeepSeek V3 | DeepSeek | CI analysis, competitor suggestions |
| Qwen Plus | Alibaba | Chinese language tasks (backup) |
| GLM-4-Flash | Zhipu | Free tier for dev/testing |

### Python Services (/services/)
| Service | Purpose |
|---------|---------|
| `competitor_intel/` | Scraping, scoring, narration, alerts, delivery |
| `agent-executor/` | Multi-step agent workflows |
| `cost-engine/` | Model routing, billing, ROI |
| `workflow-engine/` | Process mining (Neo4j) |
| `product-agent/` | Product data processing |

## Authentication Flow

```
User enters invite code (RB-COMPANY-XXXX)
        |
        v
Frontend POST /api/auth/verify-code
        |
        v
Vercel proxy --> ECS backend validates code
        |
        v
JWT generated (30-day expiry)
  payload: { sub: phone/email, name, company, industry }
        |
        v
Stored in localStorage.rebase_token
        |
        v
All CI API calls include:
  x-user-id: <decoded from JWT sub field>
  x-rebase-secret: <from Vercel env>
```

## CI Analysis Pipeline

```
User clicks "Start Analysis" in Settings
        |
        v
POST /api/ci/run-analysis { workspace_id }
        |
        v
Backend creates ci_analysis_jobs row (status: queued)
Spawns: python -m services.competitor_intel.scoring_pipeline
        |
        v
Pipeline stages (updates DB per-brand):
  queued --> scoring (1/N) --> scoring (2/N) --> ... --> narrating --> complete
        |
        v
Dashboard polls GET /api/ci/analysis/status every 3s
Shows progress bar: [==== Scoring (2/3) ====]
        |
        v
On complete: auto-refresh dashboard with real scores
On failure: show error + retry button
```

## Deployment Checklist

### Vercel (auto-deploys on git push to main)
- Set env vars: `ECS_URL`, `API_SECRET`, `ANTHROPIC_API_KEY`

### ECS (manual)
```bash
cd /var/www/rebase-backend
git pull origin will/ci-database
PGPASSWORD=123456789 psql -U rebase_app -d rebase -f migrations/004_analysis_jobs.sql
# Directory was renamed from competitor-intel → competitor_intel (Python requires underscore)
# If old directory exists on server, rename it:
# mv services/competitor-intel services/competitor_intel
pm2 restart all
```

## Key Environment Variables

See `.env.example` for the full list. Critical ones:
- `DATABASE_URL` - PostgreSQL connection
- `API_SECRET` - Vercel <-> ECS auth
- `JWT_SECRET` - Token signing
- `DEEPSEEK_API_KEY` - Primary AI for CI
- `ANTHROPIC_API_KEY` - Chat + narratives
- `ECS_URL` - Backend URL (Vercel needs this)
- `FRONTEND_URL` - CORS origin
