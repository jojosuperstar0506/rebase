# Rebase

> make a billion dollars by helping SMBs decision makers change the world

Operations consulting for small and mid-size businesses — powered by AI diagnostics, delivered by humans who understand the work.

---

## Repo Structure

```
.
├── pitch-pages/                        # Client-facing pitch materials
│   ├── 00-merged-roadmap.html          # Master business roadmap (internal)
│   ├── 01-export-manufacturers.html    # Pitch: OEM/ODM export manufacturers
│   ├── 02-construction-contractors.html# Pitch: construction contractors
│   ├── 03-regional-distributors.html   # Pitch: regional distributors
│   ├── 04-industrial-manufacturers.html# Pitch: industrial manufacturers
│   └── 05-property-management.html     # Pitch: property management companies
│
├── diagnostic/                         # Diagnostic product (Day 0-1 automated intake)
│   └── intake-agent/                   # AI Intake Agent — conversational diagnostic
│       ├── prompts/
│       │   ├── master-system-prompt.md         # Core agent personality + conversation flow
│       │   ├── output-schema.json              # Structured JSON output definition
│       │   ├── vertical-export-manufacturing.md# Vertical module: export
│       │   ├── vertical-construction.md        # Vertical module: construction
│       │   ├── vertical-distribution.md        # Vertical module: distribution
│       │   ├── vertical-industrial-manufacturing.md # Vertical module: industrial
│       │   └── vertical-property-management.md # Vertical module: property
│       ├── web-embed/
│       │   └── index.html              # Branded landing page for Dify chat widget
│       ├── test-conversations/
│       │   └── mock-export-manufacturer.md     # Mock conversation + expected JSON output
│       └── dify-chatflow-guide.md      # Step-by-step Dify setup instructions
│
├── diagnostic-product-plan.md          # Full diagnostic product plan (all phases)
├── diagnostic-day0-day1-plan.md        # Detailed Day 0-1 build plan
└── README.md
```

---

## Current Status

### Built
- [x] Client pitch pages for all 5 verticals (styled, responsive, bilingual-ready)
- [x] Master business roadmap (3-phase model)
- [x] AI Intake Agent — system prompts, vertical modules, output schema, web embed, Dify guide
- [x] Mock test conversation with expected JSON output
- [x] Diagnostic product plan (full engagement lifecycle)
- [x] Day 0-1 detailed build plan

### In Progress
- [ ] **Dify chatflow build** — set up the intake agent in Dify using the prompts and guide
- [ ] **Test with mock clients** — run 3-5 test conversations across verticals

### Next Up
- [ ] Document Analysis Engine (Piece 2) — automated parsing, extraction, metrics
- [ ] Report Generator (Piece 3) — auto-generated HTML findings report
- [ ] End-to-end test: fake client through full Day 0 → Day 1 flow

---

## Key Decisions

| Decision | What We Chose | Why |
|----------|---------------|-----|
| **First product** | Automated diagnostic intake (Day 0-1) | Zero human interaction required. Doubles as proof that AI works for the client's business. |
| **5 verticals** | Export manufacturing, construction, distribution, industrial manufacturing, property management | These are where Chinese SMBs have the most painful manual workflows and the least tech adoption. |
| **Diagnostic model** | "Workflow Audit & Live Proof-of-Concept" | Not just shadowing — we arrive with a working prototype. Risk reversal: fee credited toward pilot. |
| **AI platform** | Dify (chatflow + API) | Fastest to MVP. Handles file uploads, conversational flows, and embeds. Swap later if needed. |
| **LLMs** | DeepSeek V3.2 (production), GLM-4.7-Flash (free testing) | Cost-effective for SMB pricing. DeepSeek handles Chinese + English well. |
| **No connector framework** | Build point-to-point integrations per client | Framework is premature. Build individual integrations (MCP servers where they exist, n8n/Dify for glue). Framework emerges after 5-10 clients. |
| **Engagement pricing** | Diagnostic ~15-25K RMB, Pilot ~80-150K RMB, Retainer ~15-30K/month | SMB-friendly. Diagnostic fee credited toward pilot to reduce perceived risk. |

---

## How We Work Together

**Will** — Business strategy, client relationships, system prompts, conversation flows, report design, pitch materials

**Joanna** — Technical build, Dify chatflows, document analysis pipeline, integrations, backend

### Branch Strategy
- `main` — stable, reviewed work only
- `will/*` — Will's working branches (e.g., `will/pitch-page-updates`)
- `joanna/*` — Joanna's working branches (e.g., `joanna/dify-intake-agent`)
- Create a branch for any non-trivial change. Merge to `main` via pull request.

### Communication
- Tag each other in PR descriptions when something needs review
- Use commit messages that explain *why*, not just *what*
- If you change a prompt, test it before committing — include test results in the PR

---

## Quick Start for Joanna

You're building the Dify chatflow for the AI Intake Agent. Here's where to start:

1. **Read the build guide:** `diagnostic/intake-agent/dify-chatflow-guide.md` — step-by-step Dify setup
2. **Core system prompt:** `diagnostic/intake-agent/prompts/master-system-prompt.md` — paste this into the Dify LLM node
3. **Pick a vertical to test first:** `diagnostic/intake-agent/prompts/vertical-export-manufacturing.md` — append this to the system prompt
4. **Expected output format:** `diagnostic/intake-agent/prompts/output-schema.json` — this is what the agent should produce at conversation end
5. **Test against this:** `diagnostic/intake-agent/test-conversations/mock-export-manufacturer.md` — full mock conversation showing ideal behavior
6. **Web embed page:** `diagnostic/intake-agent/web-embed/index.html` — update `CONFIG.DIFY_EMBED_URL` with your Dify app URL

### Build order:
```
Week 1-2:  Intake Agent in Dify (you're here)
Week 2-3:  Document Analysis Engine (parsing + metrics)
Week 3-4:  Report Generator (auto-generated HTML)
Week 4-5:  End-to-end testing
```

---

## Business Context

### The 3-Phase Model

**Phase 1: Consulting (now)**
We sell diagnostic engagements to SMBs. The diagnostic itself is AI-powered (automated intake + document analysis + report generation). On-site audit follows with a working prototype. Revenue: per-engagement fees.

**Phase 2: Productized Agents (after 5-10 clients)**
Patterns from consulting engagements become reusable agent templates. Vertical-specific (e.g., "Export Order Processing Agent"). Revenue: pilot + retainer fees.

**Phase 3: Platform (after 20+ clients)**
Self-serve platform where SMBs can deploy pre-built workflow agents. Marketplace model. Revenue: subscriptions + usage.

### What the Client Experiences
```
Day 0:  Talks to AI intake agent, uploads documents         ← WE'RE BUILDING THIS
Day 1:  Receives auto-generated preliminary findings report  ← NEXT
Day 2-4: Remote prep — we build a working prototype on their real data
Day 5-6: On-site audit — shadow morning, demo prototype afternoon
Day 7:  Deliverable: full diagnostic report + working prototype + ROI analysis
```

The diagnostic is the product. It's also the demo. The client's first interaction with us *is* an AI tool working on their business — that's the proof.
