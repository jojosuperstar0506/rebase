# Backend Infrastructure — Rebase HK Server

> Last updated: 2026-03-25
> Author: William
> Status: ✅ Live

## Overview

This document covers the full backend infrastructure setup for Rebase's MVP. The backend runs on Alibaba Cloud Hong Kong and powers all AI agent features (chatbot, GTM agent, scheduled agent).

---

## Architecture

```
User (China/HK)
      ↓
Vercel (Frontend) — rebase.vercel.app
      ↓ HTTPS API calls + secret token
ECS Server — Hong Kong Zone B (8.217.242.191)
      ↓
Anthropic API (Claude) — accessible from HK, not blocked
```

---

## Server Details

| Property | Value |
|---|---|
| **Provider** | Alibaba Cloud Hong Kong |
| **Instance** | ecs.t5-lc1m1.small (1 vCPU, 1GB RAM) |
| **OS** | Alibaba Cloud Linux 3 |
| **Public IP** | 8.217.242.191 |
| **Zone** | Hong Kong Zone B |
| **Billing** | 1-month subscription (~$5-8/mo) |
| **Upgrade path** | Can upgrade to c6.large before launch |

---

## Software Stack

| Software | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS | JavaScript runtime |
| PM2 | 6.x | Process manager — keeps app alive 24/7, auto-restarts on crash, auto-starts on reboot |
| Nginx | 1.20.x | Reverse proxy — routes port 80 traffic to Node app on port 3000 |
| Git | 2.43.x | Pulls latest code from GitHub |

---

## Directory Structure

```
/var/www/rebase-backend/          ← git clone of jojosuperstar0506/rebase
└── backend/
    ├── server.js                 ← Express app (main entry point)
    ├── package.json              ← dependencies
    ├── .gitignore                ← excludes .env
    └── .env                     ← secrets (never in GitHub)
```

---

## Environment Variables

File location: `/var/www/rebase-backend/backend/.env`

```env
ANTHROPIC_API_KEY=sk-ant-...     # Claude API key — get from console.anthropic.com
API_SECRET=a9231db3...           # Secret token — must match VITE_API_SECRET in Vercel
PORT=3000                        # Node app port
```

> ⚠️ Never commit `.env` to GitHub. It is in `.gitignore`.

---

## API Endpoints

### Health Check
```
GET http://8.217.242.191/health
```
Response:
```json
{"status":"ok","region":"hongkong","anthropic":"configured"}
```

### Chat (Claude)
```
POST http://8.217.242.191/api/chat
Headers: x-rebase-secret: <API_SECRET>
Body: {"message": "your message here"}
```
Response:
```json
{"reply": "Claude's response"}
```

### GTM Agent
```
POST http://8.217.242.191/api/gtm-agent
Headers: x-rebase-secret: <API_SECRET>
Body: {"companyName": "...", "industry": "...", "targetMarket": "..."}
```

### Scheduled Agent (Overnight)
```
POST http://8.217.242.191/api/scheduled-agent
Headers: x-rebase-secret: <API_SECRET>
Body: {"task": "daily_report", "data": {...}}
```

---

## Security

| Layer | Implementation |
|---|---|
| **API key protection** | Stored in `.env` on server only, never in GitHub |
| **Rate limiting** | 100 requests/15 min per IP (via `express-rate-limit`) |
| **Secret token** | All requests must include `x-rebase-secret` header |
| **Port access** | Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Node) are open |

---

## Vercel Environment Variables

These must be set in **Vercel → Project → Settings → Environment Variables**:

| Key | Value |
|---|---|
| `VITE_BACKEND_URL` | `http://8.217.242.191` |
| `VITE_API_SECRET` | same value as `API_SECRET` in server `.env` |

---

## Deployment Workflow

Every time code is updated:

```bash
# 1. Push code to GitHub (from your laptop)
git push origin main

# 2. SSH into server via Alibaba Cloud Workbench
# Connect to: rebase-backend-hk (8.217.242.191)

# 3. Pull latest code
cd /var/www/rebase-backend
git pull origin main

# 4. Install any new dependencies
cd backend
npm install

# 5. Restart the app
pm2 restart rebase-backend --update-env

# 6. Verify it's running
pm2 status
curl http://localhost:3000/health
```

---

## PM2 Commands (Useful Reference)

```bash
pm2 status                          # see if app is running
pm2 logs rebase-backend             # view live logs
pm2 restart rebase-backend          # restart app
pm2 restart rebase-backend --update-env  # restart + reload .env changes
pm2 stop rebase-backend             # stop app
pm2 monit                           # live CPU/memory monitor
```

---

## Nginx Config

File location: `/etc/nginx/conf.d/rebase.conf`

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

To reload after config changes:
```bash
nginx -t          # test config syntax
systemctl reload nginx
```

---

## Access

### William (Main Account)
- Alibaba Cloud Console: console.aliyun.com
- Workbench: via ECS → Connect

### Joanna (RAM Sub-account)
- Login URL: https://signin.alibabacloud.com/5071674200231983/login.htm
- Username: joannazhang@5071674200231983.onaliyun.com
- Permission: PowerUserAccess (full technical access, no account management)

---

## Why Hong Kong (Not Singapore)

| | Hong Kong | Singapore |
|---|---|---|
| Latency to mainland China | 30-50ms | 80-120ms |
| Chinese AI model nodes | Better | Worse |
| Phase 2 migration (Guangzhou) | Easier | Harder |
| Cost | Similar | Similar |

---

## Future Upgrades

| When | Upgrade |
|---|---|
| Before launch | Upgrade ECS to c6.large (2 vCPU, 4GB) |
| Phase 2 | Add Guangzhou region for mainland ICP compliance |
| Scale | Add RDS PostgreSQL for user data, OSS for file storage |
| Production | Add HTTPS/SSL via Let's Encrypt |
