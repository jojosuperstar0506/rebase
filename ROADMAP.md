# Rebase — Product Roadmap

> Single source of truth for product progress. Pull this up every session.

**Last updated:** 2026-03-15

---

## Team

| | **Joanna** | **William** |
|---|---|---|
| **Role** | Vision, strategy, product direction | Technical execution, builder |
| **Strengths** | Structured thinking, industry insight, product sense | Grinding through builds, prompt eng, backend |
| **Current focus** | FRD + cloud/deployment setup | Diagnostics product build |
| **Owns** | What to build & why — features, functions, priorities | How to build it — implementation, iteration |

---

## Where We Are Now (as of 2026-03-15)

| Stream | Owner | Status | Notes |
|--------|-------|--------|-------|
| Diagnostics product build | William | In progress | Grinding through intake agent + analysis pipeline |
| FRD (functional requirements) | Joanna | In progress | Defining overall product features & functions |
| Cloud infrastructure & deployment | Joanna | In progress | Setting up so diagnostics tool can be deployed |
| Internal agents ("virtual employees") | Joanna | In progress | Product structure, marketing, image gen |
| Overall product roadmap | Both | Just created | This document |

---

## Phase 1: Diagnostics (Current Phase)

The diagnostic product is the first thing clients experience. Fully automated Day 0-1.

### 1A. AI Intake Agent
> Client talks to AI for 15-20 min, uploads docs, gets structured profile extracted

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Master system prompt (5-phase conversation) | William | Done | In `services/diagnostics/intake-agent/prompts/` |
| 5 vertical-specific modules | William | Done | Export, construction, distribution, industrial, property |
| JSON output schema | William | Done | `intake_output.json` |
| Branded web embed page (EN/CN) | William | Done | |
| Dify chatflow config guide | William | Done | |
| Mock test conversation | William | Done | Export manufacturer scenario |
| Dify chatflow build & deploy | William | TODO | Build the actual chatflow in Dify |
| Test with 3-5 mock clients | William | TODO | Refine prompts based on results |
| Cloud deployment for intake agent | Joanna | TODO | Part of overall cloud setup |

### 1B. Document Analysis Engine
> Auto-pipeline: classify docs → extract fields → calculate metrics → generate insights

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Document classification pipeline | William | TODO | LLM classifier for doc types |
| Field extraction prompts (per doc type) | William | TODO | Orders, invoices, quotations, complaints |
| Validation rules (rule-based checks) | William | TODO | |
| Metric calculation scripts (Python) | William | TODO | Volume, timing, error, pattern metrics |
| Narrative insight generator | William | TODO | LLM-generated findings from metrics |
| Integration testing (end-to-end mock data) | William | TODO | |

### 1C. Report Generator
> Auto-generated HTML findings report — client receives within 24 hrs

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| HTML/CSS report template | William | TODO | Match pitch page design language |
| Data injection layer | William | TODO | Analysis output → populates template |
| Chart generation (inline SVG) | William | TODO | Bar charts, histograms |
| Waste + ROI calculator | William | Partial | `ai-workforce-calculator.jsx` exists |
| Test with mock data + polish | Both | TODO | |

### 1D. Cloud & Deployment
> Get the diagnostics tool live and accessible to clients

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Cloud provider selection | Joanna | TODO | |
| Infrastructure setup | Joanna | TODO | |
| Deployment pipeline | Joanna | TODO | |
| Domain / access setup | Joanna | TODO | |

### 1E. Product Definition & FRD
> Defining what the overall product is and what it does

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| FRD — diagnostics scope | Joanna | In progress | |
| FRD — workflow discovery scope | Joanna | TODO | |
| FRD — agent execution scope | Joanna | TODO | |
| Feature prioritization (what matters for Client #1) | Joanna | TODO | |
| Industry research — feature/function gaps | Joanna | Ongoing | |

---

## Internal Agents — "Virtual Employees" (Parallel Track)

> Accumulating helpful AI agents for Rebase's own internal operations. Each agent is a one-button tool that encodes our business assumptions so anyone on the team can run it.

### Agent 1: Product Structure Agent
> Inventory tracking, reorder decisions, product catalog management

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Define product catalog schema | Joanna | TODO | What fields do we track per product? |
| Inventory tracking logic | Joanna | TODO | Current stock, burn rate, thresholds |
| Reorder decision engine | Joanna | TODO | When to place orders, how much, from whom |
| Supplier/pricing data integration | Joanna | TODO | Connect to existing order data |
| One-button "should I reorder?" report | Joanna | TODO | Output: reorder recommendations with reasoning |

### Agent 2: Marketing Agent (Xiaohongshu)
> One-button content creator for Xiaohongshu, pre-loaded with our brand voice and business assumptions

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Define brand voice & tone guidelines | Joanna | TODO | What does Rebase sound like on XHS? |
| Content templates per post type | Joanna | TODO | Educational, case study, behind-the-scenes, etc. |
| Pre-built business assumptions | Joanna | TODO | Target audience, value props, key messages |
| Image + copy generation pipeline | Joanna | TODO | One button → ready-to-post XHS content |
| Post scheduling / batch generation | Joanna | TODO | Generate a week's content at once |

### Agent 3: World-Class Image Generator
> High-quality image generation for marketing, pitch materials, and client deliverables

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Define use cases & style guide | Joanna | TODO | What kinds of images, what aesthetic |
| Model selection & API setup | Joanna | TODO | Which image gen model(s) to use |
| Prompt templates per use case | Joanna | TODO | Marketing visuals, report graphics, social media |
| One-button generation workflow | Joanna | TODO | Input context → output polished image |

---

## Phase 2: Workflow Discovery + Agent Execution (Future)

> AI discovers client workflows, decomposes goals into tasks, executes autonomously

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Workflow graph definitions | TBD | Stub | Phase 1 diagnostics live |
| Autonomous task execution | TBD | Stub | Workflow engine |
| Cost tracking + ROI engine | TBD | Stub | |

---

## Phase 3: Multi-Agent Orchestration (Future)

> Multiple agents collaborate on complex tasks

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Multi-agent runtime | TBD | Stub | Phase 2 agent executor |
| Agent coordination protocol | TBD | Stub | |

---

## Key Decisions Log

| Date | Decision | Who | Context |
|------|----------|-----|---------|
| 2026-03-15 | Created this roadmap as single source of truth | Both | Need one place to track everything |
| 2026-03-15 | Clarified roles: Joanna = vision/product, William = technical/build | Both | Previous docs had it reversed |
| 2026-03-15 | Added internal agents track — accumulate "virtual employees" alongside client product | Joanna | Product structure, XHS marketing, image gen |

---

## How to Use This Document

1. **Every session:** Pull this up first. Check where we left off.
2. **When completing a task:** Update status to `Done` and add date.
3. **When priorities shift:** Move tasks, add notes, log the decision.
4. **When adding new work:** Add it under the right phase/section.

Status values: `TODO` → `In progress` → `Done` | `Blocked` | `Ongoing` (recurring)
