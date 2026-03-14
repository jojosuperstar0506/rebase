# Rebase

> make a billion dollars by helping SMBs decision makers change the world

---

## What We're Building

An automated diagnostic product that gives SMB owners an honest look at their operations — without requiring any human consultant time for the first interaction.

**The client experience:**
```
Day 0:  Client talks to an AI analyst, uploads their business documents
Day 1:  Client receives an auto-generated findings report with insights they didn't expect
```

No forms. No waiting. No human in the loop for Day 0-1.

---

## Repo Structure

```
.
├── diagnostic/                              # THE PRODUCT
│   ├── diagnostic-product-plan.md           # Full product plan (all engagement phases)
│   ├── diagnostic-day0-day1-plan.md         # Detailed Day 0-1 build plan
│   │
│   └── intake-agent/                        # PIECE 1: AI Intake Agent
│       ├── prompts/
│       │   ├── master-system-prompt.md              # Core agent — personality, flow, rules
│       │   ├── output-schema.json                   # Structured JSON output definition
│       │   ├── vertical-export-manufacturing.md     # Module: export/OEM
│       │   ├── vertical-construction.md             # Module: construction
│       │   ├── vertical-distribution.md             # Module: distribution
│       │   ├── vertical-industrial-manufacturing.md # Module: industrial
│       │   └── vertical-property-management.md      # Module: property management
│       ├── web-embed/
│       │   └── index.html                   # Branded landing page (EN/CN, Dify embed)
│       ├── test-conversations/
│       │   └── mock-export-manufacturer.md  # Full mock conversation + expected output
│       └── dify-chatflow-guide.md           # Step-by-step Dify setup guide
│
├── archive/                                 # Earlier materials (pitch pages, roadmap)
│   └── pitch-pages/
│       ├── 00-merged-roadmap.html
│       ├── 01-export-manufacturers.html
│       ├── 02-construction-contractors.html
│       ├── 03-regional-distributors.html
│       ├── 04-industrial-manufacturers.html
│       └── 05-property-management.html
│
└── README.md
```

---

## Diagnostic Product — 3 Pieces

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **AI Intake Agent** | Ready for Dify build | Conversational agent that interviews the client, collects business profile + pain points, accepts document uploads, outputs structured JSON |
| 2 | **Document Analysis Engine** | Not started | Automated pipeline: classify docs → extract fields → calculate metrics → generate narrative insights |
| 3 | **Report Generator** | Not started | Auto-generated HTML findings report with charts, waste calculations, and ROI projections |

### Piece 1: AI Intake Agent (current focus)

A 15-20 minute conversation where an AI analyst interviews the client about their business. No forms, no questionnaires — just a natural conversation that collects:
- Company profile (headcount, revenue, departments, tools)
- Operational pain points (with specific numbers: hours, frequency, cost)
- Document uploads (orders, invoices, quotations, reports)

**What's built:**
- Master system prompt with 5-phase conversation structure and 10 behavioral rules
- 5 vertical-specific modules (export, construction, distribution, industrial, property)
- JSON output schema for the analysis pipeline
- Branded web embed page with EN/CN support
- Dify chatflow configuration guide
- Mock test conversation with expected JSON output

**To build next:**
1. Set up Dify chatflow using `diagnostic/intake-agent/dify-chatflow-guide.md`
2. Paste master prompt + vertical module into LLM node
3. Test against `mock-export-manufacturer.md`
4. Deploy web embed with Dify URL

---

## Tech Stack

| Tool | Role | Why |
|------|------|-----|
| **Dify** | Chatflow platform | Fast to MVP, handles file uploads, visual builder |
| **DeepSeek V3.2** | Primary LLM (production) | $0.25/M input, handles CN+EN well |
| **GLM-4.7-Flash** | LLM (free testing) | Zero cost for development iteration |
| **Static HTML** | Web embed, reports | No framework overhead, prints to PDF |

---

## How We Work

**Will** — Strategy, prompts, conversation flows, client materials, report design

**Joanna** — Dify builds, analysis pipeline, integrations, backend

### Branches
- `main` — stable, reviewed
- `will/*` — Will's working branches
- `joanna/*` — Joanna's working branches

### Quick Start for Joanna
1. Read `diagnostic/intake-agent/dify-chatflow-guide.md`
2. System prompt: `diagnostic/intake-agent/prompts/master-system-prompt.md`
3. Test with: `diagnostic/intake-agent/test-conversations/mock-export-manufacturer.md`
4. Output format: `diagnostic/intake-agent/prompts/output-schema.json`

---

## Archive

The `archive/` folder contains earlier work — client pitch pages and the business roadmap. These are still valid but not the current priority. We'll revisit them once the diagnostic product is live.
