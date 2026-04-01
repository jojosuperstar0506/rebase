# Changelog — Rebase Platform

---

## [Platform v1.0] — 2026-04-01 — Full Client-Facing Platform Live on Vercel

**Author:** William
**Commit:** `c5f8e8d`
**URL:** [rebase-lac.vercel.app](https://rebase-lac.vercel.app)

### What Shipped

#### 1. User Access Gate (Invite Code → JWT)

Users can no longer access agent pages without an invite. Flow:
1. User visits `/login`, enters invite code
2. Code validated against `ACCESS_CODE` Vercel env var (case-insensitive)
3. Server issues HS256 JWT (30-day expiry) stored in `localStorage`
4. `ProtectedRoute` wraps all agent/workflow/cost pages — redirects to `/login` if no valid token

**Files:** `frontend/src/pages/Login.tsx`, `frontend/api/auth/verify-code.js`, `frontend/src/components/ProtectedRoute.tsx`

---

#### 2. User Onboarding Form (`/onboarding`)

Prospects fill in their details to request early access:
- **Fields:** Full name, phone, company, industry, competitors to track, goal
- **Pre-fill:** Calculator saves `rebase_prefill` to `localStorage`; Onboarding reads it on mount and pre-populates the form automatically
- **Submission:** `POST /api/onboarding` → ECS backend (if configured) → Resend email notification → WeChat webhook fallback

**Files:** `frontend/src/pages/Onboarding.tsx`, `frontend/api/onboarding.js`

---

#### 3. Admin Panel (`/admin`)

Password-protected management interface for Will/Joanna:
- Lists all applicants with name, company, industry, phone, email, goal, applied date
- Filter by All / Pending / Approved
- One-click "Approve & Generate Code" — calls `POST /api/admin/approve`, returns invite code
- Copy-to-clipboard button on each invite code
- Auth persisted in `localStorage` — navigating away and back doesn't require re-login
- Sends Resend email to admin confirming approval with the invite code

**Files:** `frontend/src/pages/Admin.tsx`, `frontend/api/admin/applicants.js`, `frontend/api/admin/approve.js`

---

#### 4. Full Bilingual Support (ZH/EN) Across All Pages

Global language toggle (controlled by `AppContext`) now drives every page:

| Page | Bilingual |
|------|-----------|
| Diagnostic Calculator | ✅ (ZH/EN toggle button top-right) |
| Onboarding Form | ✅ |
| Login | ✅ |
| Agent Monitor | ✅ (agent names, descriptions, capabilities, status labels) |
| XHS War Room | ✅ (UI chrome — buttons, headers, placeholders) |
| Market Intelligence | ✅ (all headings, step descriptions, CTA) |
| Workflow Scout | ✅ |
| Cost Dashboard | ✅ |
| Navigation | ✅ |

---

#### 5. Global Dark/Light Theme — All Pages Fixed

All pages now use `useApp()` and `C.*` tokens from `AppContext`. No more hardcoded dark colors.

- **XhsWarroom.tsx** — Was using 9 hardcoded dark constants (`BG="#0c0c14"` etc.). All sub-components (`Md`, `FileTextArea`, `Field`, `RunBtn`, `Lbl`, `ResultBox`, `Tab4`, main layout) now call `useApp()`.
- **MarketIntelligence.tsx** — Same fix. All dark constants replaced with `C.*`.
- **CostDashboard.tsx** — Replaced 7-line placeholder stub with a full themed coming-soon page.

---

#### 6. Navigation Fixes

- Admin link: visible when logged out (anyone can find it), hidden for regular logged-in users, visible for admin-authed users
- Nav tabs update instantly on login/logout (dispatches `rebase_auth_change` event)
- Auth state re-checked on every route change (`location.pathname` useEffect)
- Logout button replaces Login button when user is authenticated

---

#### 7. Calculator Early Access CTA

Results page now has an "Early Access" card that:
1. Saves calculator inputs (`name`, `phone`, `company`, `industry`) to `localStorage` as `rebase_prefill`
2. Navigates user to `/onboarding`
3. Onboarding form auto-populates with their calculator data (cleared from localStorage after use)

Also added "← Back to Home" link on results page.

---

### Bug Fixes in This Release

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Login returned 404 | `api/auth/verify-code.js` didn't exist | Created the file |
| Onboarding submission returned 404 | `api/onboarding.js` didn't exist | Created the file |
| Admin panel showed error immediately | `api/admin/applicants.js` didn't exist | Created the file |
| Approve button returned 500 | `api/admin/approve.js` didn't exist | Created the file |
| Admin auth lost on navigation | `useState(false)` — component unmounts | `useState(() => !!localStorage.getItem("admin_authed"))` |
| XHS War Room broken in light mode | 9 hardcoded dark color constants | `useApp()` + `C.*` tokens throughout |
| Market Intelligence broken in light mode | Same hardcoded dark constants | Same fix |
| Nav tabs didn't update after login | Login never dispatched `rebase_auth_change` | Added `window.dispatchEvent(new CustomEvent("rebase_auth_change"))` |
| Onboarding inputs lost focus every keystroke | `Field` component defined inside parent function → remount on every render | Moved `Field` to module scope |
| Goal preset deselected when typing | Single `form.goal` field for both button and textarea | Split into `goalPreset` + `goalCustom` state |
| Gradient text showed as colored block after theme toggle | React applies inline styles property-by-property (flicker) | Injected CSS class via `<style>` tag — applied atomically |

---

### Environment Variables Required

Set these in **Vercel → Settings → Environment Variables** then redeploy:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ACCESS_CODE` | 🔴 Yes | Invite code users enter to log in |
| `ANTHROPIC_API_KEY` | 🔴 Yes | XHS War Room AI calls |
| `VITE_ADMIN_PASSWORD` | 🔴 Yes | Admin panel password |
| `JWT_SECRET` | 🟡 Recommended | Signs JWT tokens (defaults to ACCESS_CODE if unset) |
| `RESEND_API_KEY` | 🟡 Recommended | Email notifications for onboarding + approvals |
| `NOTIFICATION_EMAIL` | 🟡 Recommended | Where to send notifications |
| `ECS_BACKEND_URL` | 🟢 Optional | `http://8.217.242.191` — links admin panel to ECS storage |
| `ECS_API_SECRET` | 🟢 Optional | Authenticates Vercel → ECS requests |

---

## [Calculator v0.4.0] — 2026-04-01 — Bilingual + Early Access CTA

**Author:** William

- Added `LANG` translations object (ZH/EN) with ~30 string keys each
- Added language state and toggle button (top-right, alongside dark/light toggle)
- All UI chrome wired to `L.*` translation keys
- Early Access card on results page: saves to `rebase_prefill` localStorage → redirects to `/onboarding`
- "← Back to Home" link added to results page
- Fixed disabled button invisible in light mode (explicit colors for disabled state)

---

# Changelog — AI Workforce Diagnostics Calculator (Legacy entries below)

---

---

## [v0.3.0] — 2026-03-15 — 5-Tier AI Maturity System + Professional UI

**Branch:** `will/calculator-research-update`
**PR:** [#2](https://github.com/jojosuperstar0506/rebase/pull/2)
**Files changed:** `ai-workforce-calculator.jsx`, `test-calculator.html`

### What Changed and Why

#### 1. New 5-Tier AI Maturity Model (replaces raw percentage)

**Problem:** The old calculator showed a raw percentage like "你：25% / 行业：78%" which is meaningless to a Chinese SMB owner. It mixed "which tools have you deployed?" with "what problems remain?" into one confusing number.

**Solution:** Replaced with a 5-level named tier system that SMB owners immediately understand:

| Tier | Name | Score Range | What It Means |
|------|------|-------------|---------------|
| L1 | 没有起步 | 0 - 15% | No AI tools deployed at all |
| L2 | 买了没用 | 16 - 35% | Boss bought tools, employees barely use them |
| L3 | 局部试点 | 36 - 55% | Some teams actively using AI on specific tasks |
| L4 | 流程嵌入 | 56 - 80% | AI built into daily workflows, measured ROI |
| L5 | 数据驱动 | 81 - 100% | AI decisions backed by data loops, continuous optimization |

**Why L2 matters:** "买了没用" (Bought, Not Used) is the key tier. Most Chinese SMBs land here. Naming their exact problem creates immediate trust and urgency: "these consultants actually understand our real situation."

---

#### 2. Usage-Reality Questions (replaces binary checkboxes)

**Problem:** Old questions were binary checkboxes mixing "have you deployed X?" with "what pain points do you have?" — producing a confusing combined score.

**Solution:** Every department now has specific questions with a graduated 5-option answer scale:

| Option | Label | Score | What It Captures |
|--------|-------|-------|------------------|
| A | 完全没有 | 0 | Haven't even considered this |
| B | 买了没用 | 0.5 | Tool purchased but gathering dust |
| C | 少数人在用 | 1 | A few people using it sometimes |
| D | 多数人日常使用 | 2 | Most of the team uses it regularly |
| E | 已嵌入流程 | 3 | Built into workflow with metrics |

**Questions by department (examples):**

- **内容/媒体:** AI写文案? AI辅助视频剪辑? AI生成设计? AI数据分析? (4 questions)
- **客服:** AI客服机器人? AI工单分类? AI质检? (3 questions)
- **销售:** AI获客? AI跟进辅助? CRM AI分析? (3 questions)
- **财务:** AI记账? 发票自动化? AI报表? (3 questions)
- **人力:** AI简历筛选? 薪资自动化? AI员工服务? (3 questions)
- **行政:** AI办公工具? 采购系统化? AI文档管理? (3 questions)
- **法务:** AI合同审查? AI法规检索? (2 questions)
- **IT:** AI编程助手? AI代码审查? AI运维? (3 questions)

---

#### 3. Per-Department Upgrade Recommendations (NEXT_STEPS)

**Problem:** Old calculator had no actionable advice — just a percentage.

**Solution:** Added a `NEXT_STEPS` data structure that maps tier level x department to specific, actionable recommendations.

**Generic (all departments):**
| Tier | Action | Detail |
|------|--------|--------|
| L1 | 先选一个部门试点 | 不要全面铺开，找一个痛点最明显的部门，先跑通一个AI工具 |
| L2 | 解决'买了没用'问题 | 指定使用负责人，设定周度使用目标，追踪工具登录率 |
| L3 | 从试点到标准化 | 将成功的AI用法写成SOP，在部门内推广为默认流程 |
| L4 | 建立数据反馈闭环 | 用AI产出的数据优化AI输入，形成持续改进循环 |
| L5 | 持续优化 | 对标行业最佳实践，探索AI+业务创新的新场景 |

**Department-specific examples:**
- **Sales at L2:** "要求SDR每天用AI筛选线索并记录，周会复盘效果"
- **Finance at L2:** "从发票识别开始，每月对比人工vs AI准确率"
- **IT at L2:** "要求开发者每天至少用Copilot写30%代码"

---

#### 4. Research-Backed Salary & Productivity Data

**Added salary table** with 17 roles across 3 city tiers:

| City Tier | Examples | Salary Range (monthly) |
|-----------|----------|----------------------|
| 一线城市 | 北京/上海/广州/深圳 | 7,000 - 22,000 RMB |
| 新一线城市 | 成都/杭州/武汉/南京 | 5,500 - 16,000 RMB |
| 二线城市 | 昆明/福州/中山/珠海 | 4,500 - 12,000 RMB |

All salaries use 14-month annual calculation (standard in China). Sources: Boss直聘, 猎聘, 51Job.

**Productivity gains by department (with sources):**
| Department | With AI (%) | Full AI (%) | Source |
|-----------|------------|------------|--------|
| 内容/媒体 | 40% | 65% | MIT/Stanford |
| 客服 | 14% | 25% | Stanford/MIT |
| 销售 | 20% | 35% | HBR/Salesforce |
| 财务 | 25% | 45% | Deloitte |
| 人力 | 18% | 30% | LinkedIn/SHRM |
| 行政 | 20% | 35% | 综合研究 |
| 法务 | 30% | 50% | LegalTech |
| IT | 55% | 80% | Microsoft/GitHub |

---

#### 5. Professional UI/UX Overhaul

**Problem:** Old design used neon colors, glow effects, emoji icons, and gradient text — looked like a gaming app, not a B2B consulting tool.

**Changes made:**
- **Color palette:** Neon teal/purple replaced with corporate blue (#2563EB) and slate tones
- **Typography:** Added Inter font (standard in enterprise SaaS), tightened headings
- **Icons:** Removed all department emoji (📱💼💰). Using clean text labels
- **Shadows:** Replaced all glow effects with subtle drop shadows
- **Cards:** Clean white cards with 1px borders instead of translucent glass effect
- **Buttons:** Solid corporate blue, no glow animation, consistent 8px border radius
- **Inputs:** White background with clean border, blue focus ring
- **Progress bars:** Thin 6px bars, solid fill, no glow animation

#### 6. Light/Dark Mode Toggle

- Default is light theme (matches Chinese B2B tools like 钉钉, 飞书, 用友)
- Toggle button in top-right corner of the page
- Full `getTheme(dark)` function generates complete color palette for either mode
- All styles reference theme object — no hardcoded colors

---

#### 7. Results Page Redesign

**Old results:** Small pill showing "你：25% / 行业：78%" with a simple bar.

**New results page includes:**
1. **Overall company tier header** — Large badge showing e.g. "L2 买了没用" with description
2. **Key insight** — e.g. "X个部门处于'买了没用'阶段，需要重点推动使用落地"
3. **Per-department cards** — Each shows:
   - Tier badge (colored by tier)
   - Segmented 5-tier progress bar with current tier highlighted
   - Score detail (e.g. "28/100")
   - Specific next-step recommendation
   - Industry comparison ("行业可达: L3")
4. **3-scenario cost comparison** — Current vs With AI vs Full AI headcount and cost

---

### How to Test

1. Open `test-calculator.html` in any browser (no Node.js needed)
2. Walk through all 5 steps:
   - Step 1: Select departments
   - Step 2: Enter headcount per role
   - Step 3: Answer usage-reality questions for each department
   - Step 4: Select city tier
   - Step 5: View results with tier badges, recommendations, and cost savings

**Test scenarios:**
- Answer all questions as "完全没有" → should show L1 没有起步
- Answer all as "买了没用" → should show L2 with specific recommendations
- Mix answers across departments → per-department tiers should differ
- Answer all as "已嵌入流程" → should show L4/L5
- Toggle the light/dark mode switch in the top-right corner

---

## [v0.2.0] — 2026-03-15 — Research-Backed Data & City Tier System

**Commit:** `fe380f9`

- Added SALARY_TABLE with 17 roles and 3 city tiers
- Added PRODUCTIVITY_GAINS with academic/industry sources for all 8 departments
- Added CITY_TIERS (一线/新一线/二线) selection step
- Updated all department aiLevel benchmarks based on industry data
- Updated headcount reduction ratios per role with research-backed estimates

---

## [v0.1.0] — 2026-03-14 — Initial Calculator

**Commit:** `c5a8106`

- First version of AI Workforce Diagnostics Calculator
- 5-step wizard flow: department selection, headcount, assessment, city, results
- 8 departments with role-level headcount input
- Basic AI maturity assessment (binary questions)
- Cost savings calculation: Current vs With AI vs Full AI scenarios
- Per-department insight cards with AI tool recommendations
