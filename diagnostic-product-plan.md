# Diagnostic Phase Product — AI-First Build Plan

## Context
Will and Joanna need a diagnostic product that IS the AI demo. The client's first experience should feel like magic — not a manual form. If the diagnostic itself runs on AI, it proves the value before you even present the findings. "We used AI to analyze YOUR business in 3 days" is the most powerful sales pitch for the pilot.

---

## Core Principle: The Diagnostic Product IS the Demo

The client should never feel like they're doing homework. Instead:
- They **talk** to an AI agent that interviews them
- They **upload** docs and watch AI extract insights automatically
- They **receive** an auto-generated report with findings they didn't expect
- The experience itself proves AI works for their business

---

## Product Architecture: 4 AI-Powered Components

### Component 1: AI Intake Agent (Conversational)
**What the client sees:** A chat-based AI agent (deployed in DingTalk/Feishu/WeChat or a web link) that conducts the intake interview conversationally.

| Capability | How it works | Build with |
|-----------|-------------|------------|
| Conversational intake | Agent asks about their business, team size, tools, pain points — adapts questions based on answers. Feels like talking to a consultant, not filling a form | Dify chatflow + DeepSeek V3.2 |
| Smart follow-ups | Client says "orders come from WeChat mostly" → agent probes: "How many orders per day? Do customers send text, voice, or photos? Who re-types them into your system?" | Prompt engineering with branching logic |
| Document upload during chat | "Can you share a few recent orders? Just drag them in here" → agent accepts and immediately starts extracting | Dify file upload node + vision model |
| Auto-summary generation | After 15-20 min conversation, agent generates a structured intake summary and confirms key facts with the client | LLM summarization + structured output |
| Vertical detection | Agent identifies which vertical template to use based on conversation (export, construction, distribution, manufacturing, property) | Classification prompt |

**What you get:** Structured JSON of client profile, pain points, tools, volume estimates, team structure — auto-extracted from the conversation, no manual data entry.

**Human involvement:** Review the auto-summary for accuracy (~15 min). May need a short follow-up call if client is not comfortable chatting with AI (~30 min max).

**Build time: 1-1.5 weeks** (Dify chatflow + prompt design + testing)

---

### Component 2: AI Document Analyzer
**What the client sees:** They upload a batch of documents (orders, invoices, emails, WeChat exports, spreadsheets) and receive an automated analysis within hours.

| Capability | How it works | Build with |
|-----------|-------------|------------|
| Multi-format ingestion | Accepts PDF, Excel, images (photographed orders), WeChat chat exports, email .eml files | Dify RAG pipeline + vision models for images |
| Auto-classification | AI sorts uploaded docs by type: order, invoice, complaint, quotation, internal communication, etc. | Classification prompt + DeepSeek V3.2 |
| Data extraction | Pulls structured fields from each doc: dates, amounts, products, parties, quantities, statuses | Extraction prompts per doc type |
| Volume & timing analysis | Calculates: transactions/day, avg processing time (from timestamps), peak hours, busiest days, seasonal patterns | Python script on extracted data |
| Error/anomaly detection | Flags: pricing inconsistencies, duplicate orders, missing fields, late responses, unresolved items | Rule-based + LLM anomaly scoring |
| Pattern recognition | Identifies: "72% of your orders come via WeChat, 15% email, 13% phone" or "Your avg response time is 6.2 hours, but orders after 3 PM average 11.4 hours" | Statistical analysis + LLM narrative |
| Auto-generated insights report | Produces a preliminary findings document: "Based on 47 documents analyzed, here's what we found..." | LLM report generation |

**What you get:** A structured dataset of all client transactions + an auto-generated preliminary findings report with charts and key stats.

**Human involvement:** Review the extraction quality on 5-10 docs (~30 min). Fix any systematic parsing errors (~30 min). The rest is automated.

**Build time: 2-2.5 weeks** (parsing pipeline + analysis scripts + report template)

---

### Component 3: AI Prototype Engine (Per-Vertical)
**What the client sees during on-site:** You feed their morning's real work into the system and it processes it live. This is the "magic moment."

| Capability | How it works | Build with |
|-----------|-------------|------------|
| Pre-configured vertical templates | Dify workflow templates per vertical: inquiry triage, order parsing, NCR drafting, tender extraction, tenant request classification | Dify workflows (5 templates) |
| Client data auto-loading | The data from Component 2 is already loaded. Client's products, pricing, customer names, terminology — all pre-configured from the intake + doc analysis | Dify knowledge base + variables |
| Live processing | Feed in real transaction → AI processes in real-time → output compared to what the team did manually | Dify API call + comparison logic |
| Batch comparison runner | Run 30-50 historical transactions through prototype, auto-log: AI output vs. human output, time taken, accuracy score | Python script + Dify API |
| Before/after dashboard | Live display showing: manual time vs. AI time, accuracy rate, projected monthly savings if scaled | Simple HTML dashboard pulling from batch results |

**What you get:** A proven prototype running on client data + batch test results showing measurable improvement.

**Human involvement:** This is the on-site portion. Humans are needed for:
- Shadowing the team to observe real workflow (4 hrs) — **irreducible, this is core consulting value**
- Running the live demo and narrating results (1-2 hrs)
- Facilitating staff testing and collecting feedback (2-3 hrs)
- Interviewing the boss about priorities (1-1.5 hrs)
- Tuning prompts/rules if prototype output isn't good enough (~1-2 hrs)

**Build time: 1.5-2 weeks per vertical** (Dify templates + batch runner + dashboard)

---

### Component 4: AI Report Generator
**What the client sees:** A professional diagnostic report that looks like it came from a top consulting firm — but was assembled in hours, not weeks.

| Capability | How it works | Build with |
|-----------|-------------|------------|
| Auto-populated process map | Generates visual workflow from Component 2 data + on-site observations (entered via structured form) | HTML/SVG generator from structured data |
| Auto waste calculation | Pulls numbers from intake (headcount, salaries) + doc analysis (volume, timing) → calculates waste per workflow step | Calculation engine (JS or Python) |
| Auto before/after comparison | Pulls from Component 3 batch test results → generates comparison tables and charts | Template + data injection |
| Auto ROI projection | Input = waste data + prototype improvement rates. Output = projected monthly/annual savings, payback period, 3 scenarios (conservative/moderate/aggressive) | Calculation engine |
| Auto benchmark comparison | Compares client metrics to your benchmark library → "Your response time is 3x slower than the top quartile in your industry" | Lookup from benchmark DB |
| AI-written narrative sections | LLM generates: executive summary, key findings, risk factors, recommendation rationale — from all collected data | DeepSeek V3.2 with report-writing prompts |
| Automation priority matrix | Auto-generated from use case scoring (impact × feasibility) | Chart generator from scoring data |
| Branded report assembly | All components pulled into a polished HTML report (matching your pitch page design language) that can be printed to PDF | HTML template + data injection |

**What you get:** A near-complete diagnostic report. Human adds qualitative judgment and final polish.

**Human involvement:**
- Enter on-site observations into structured form (~30 min)
- Score use cases on impact/feasibility (~15 min)
- Review AI-generated narrative, edit for tone and accuracy (~1-2 hrs)
- Add qualitative insights AI can't capture (team dynamics, politics, enthusiasm level) (~30 min)
- Final QA (~30 min)

**Build time: 2 weeks** (report engine + templates + narrative prompts)

---

## Time Commitment Per Engagement (After Product is Built)

### AI does this automatically (~14-20 hrs of work replaced)
| Step | AI Time | Human Equivalent |
|------|---------|-----------------|
| Intake interview (conversational agent) | 15-20 min client conversation | 1-2 hr manual interview + notes |
| Document parsing + classification (50 docs) | 30-60 min compute | 4-6 hrs manual review |
| Volume/timing/pattern analysis | 5-10 min compute | 3-4 hrs spreadsheet work |
| Preliminary findings report | 10-15 min generation | 3-4 hrs writing |
| Batch prototype testing (50 transactions) | 20-30 min compute | 4-5 hrs manual testing |
| Before/after comparison + charts | 5 min generation | 2-3 hrs manual |
| ROI model + waste calculation | 2 min computation | 1-2 hrs spreadsheet |
| Report narrative draft | 10-15 min generation | 3-4 hrs writing |
| Report assembly | 5 min | 2-3 hrs formatting |

### Humans do this (irreducible ~12-16 hrs)
| Step | Time | Why it can't be automated |
|------|------|--------------------------|
| Client relationship + scheduling | 1-2 hrs | Trust, rapport, logistics |
| Review AI intake summary | 15-30 min | Quality check |
| Review AI document analysis | 30-60 min | Validate extraction accuracy |
| Customize prototype prompts/rules | 1-2 hrs | Domain judgment, quality tuning |
| **On-site shadowing** | **4 hrs** | **Core consulting value — observe real workflow, see what data can't show** |
| **Live demo facilitation** | **1-2 hrs** | **Presentation, handling objections, reading the room** |
| **Staff testing facilitation** | **2-3 hrs** | **Observe adoption barriers, collect qualitative feedback** |
| **Boss interview** | **1-1.5 hrs** | **Understand priorities, politics, budget, decision criteria** |
| Enter on-site observations + score use cases | 45 min | Structured data entry from human observation |
| Review/edit AI-generated report | 1.5-2 hrs | Add judgment, tone, qualitative insights |
| Final QA | 30 min | Human eyes on final deliverable |

### Timeline per engagement
```
Day 0     Client talks to AI intake agent (15-20 min of their time)
          Client uploads documents
          AI processes overnight
Day 1     AI delivers preliminary findings → you review (1 hr)
          You customize prototype with client data (1-2 hrs)
          AI runs batch test overnight
Day 2     Batch results ready → you review (30 min)
Day 3-4   On-site: shadow + demo + staff test + boss interview (8-10 hrs human)
Day 5     AI generates full report draft → you review and polish (2-3 hrs)
          Deliver final report to client
```
**Total elapsed: 5 days | Total human effort: ~12-16 hrs (~2 days)**

---

## Build Priority (What to Build First)

### Sprint 1 — Minimum viable diagnostic for Client #1 (Weeks 1-2)
**Goal:** Have enough to run 1 real diagnostic with AI assistance

1. **AI Intake Agent** — Dify chatflow for lead vertical. Conversational intake + doc upload + auto-summary. (5-7 days)
2. **Waste + ROI Calculator** — Takes intake data → outputs waste report + ROI projection. Start as a spreadsheet with formulas, migrate to code later. (2 days)
3. **Report template** — Branded HTML template with placeholder sections. Manually fill in for Client #1, automate later. (2-3 days)

### Sprint 2 — Document analysis + prototype (Weeks 3-4)
**Goal:** AI handles the data analysis, you focus on the on-site

4. **Document parsing pipeline** — Dify workflow: upload docs → extract structured data → classify → calculate metrics. (5-7 days)
5. **Dify prototype template** — For lead vertical. Pre-configured workflow that processes client's transactions. (3-5 days)
6. **Batch test runner** — Script that feeds N transactions through prototype and logs results. (1-2 days)

### Sprint 3 — Report automation (Weeks 5-6)
**Goal:** AI generates 80% of the report, you write 20%

7. **Before/after comparison generator** — Auto from batch test output. (1-2 days)
8. **Process map visualizer** — Auto from workflow data. (2-3 days)
9. **AI report narrative generator** — LLM writes exec summary, findings, recommendations from all collected data. (3-5 days)
10. **Report assembler** — Pulls all components into final branded HTML/PDF. (2-3 days)

### Sprint 4 — Scale (Weeks 7-8)
11. **On-site toolkit** — Observation template, time-study logger, feedback forms, interview guide. (3-5 days)
12. **Second vertical templates** — Duplicate Sprint 1-3 for vertical #2. Much faster since architecture exists. (1 week)
13. **Benchmark library** — Empty structure, populates with each engagement. (1-2 days setup)

---

## Tech Stack

| Component | Tool | Why |
|-----------|------|-----|
| AI Intake Agent | Dify chatflow + DeepSeek V3.2 | Conversational, handles file uploads, generates structured output |
| Document Parsing | Dify RAG pipeline + vision models (for images/photos) | Multi-format, handles Chinese docs well |
| Prototype Templates | Dify workflows (per vertical) | Visual builder, model-agnostic, client can see it working |
| Calculations | Python scripts or Google Sheets (V1) | Fast to build, easy to share with Joanna |
| Report Generation | HTML templates + DeepSeek for narrative | Matches existing pitch page design language, prints to PDF |
| Batch Testing | Python script calling Dify API | Simple, reliable, logs results for comparison |
| Benchmark Library | Google Sheets → Airtable (later) | Shared access, both co-founders update |
| On-site Tools | Google Forms or simple web forms | Works on tablet, no app install needed |

---

## Verification
1. **Dry run on mock client:** Create a fake 50-person export manufacturer dataset. Run the full pipeline: AI intake → doc analysis → prototype → report generation. Time each step
2. **Test with Joanna:** Have Joanna play the "client" — talk to the intake agent, upload sample docs, review the auto-generated report. Is it credible?
3. **Quality check on 3 verticals:** Ensure the document parser handles the dominant doc types per vertical (PDF orders, WeChat screenshots, Excel spreadsheets, photographed invoices)
4. **Report review:** Generate a complete diagnostic report from mock data. Print to PDF. Would a factory boss take this seriously?
