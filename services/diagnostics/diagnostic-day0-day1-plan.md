# Day 0-1 Detailed Build Plan: Fully Automated AI Diagnostic Intake

## Context
Day 0 and Day 1 of the diagnostic engagement are fully automated — zero human interaction. The client interacts with AI tools directly. This is both the intake AND the first deliverable, and it doubles as a proof that AI works for their business.

**What the client experiences:**
- Day 0: Talks to an AI agent, uploads their documents
- Day 1: Receives an auto-generated preliminary findings report with insights they didn't expect

**What we need to build:** A web-based diagnostic tool with 3 connected pieces.

---

## Architecture: 3 Connected Pieces

```
[Client Browser]
       |
       v
+------------------+       +----------------------+       +---------------------+
| 1. AI INTAKE     | ----> | 2. DOCUMENT          | ----> | 3. PRELIMINARY      |
|    AGENT         |       |    ANALYSIS ENGINE    |       |    FINDINGS REPORT  |
|                  |       |                       |       |                     |
| Conversational   |       | Parse uploaded docs   |       | Auto-generated      |
| interview via    |       | Extract structured    |       | HTML/PDF report     |
| chat interface   |       | data, calculate       |       | with charts, stats, |
|                  |       | metrics, detect       |       | waste calc, and     |
| Collects:        |       | patterns              |       | initial insights    |
| - Business info  |       |                       |       |                     |
| - Pain points    |       | Outputs:              |       | Sent to client      |
| - Doc uploads    |       | - Transaction stats   |       | automatically       |
| - Team structure |       | - Timing analysis     |       |                     |
|                  |       | - Error/anomaly flags |       |                     |
| Outputs:         |       | - Pattern summary     |       |                     |
| - Client profile |       |                       |       |                     |
| - Vertical ID    |       |                       |       |                     |
| - Uploaded docs  |       |                       |       |                     |
+------------------+       +----------------------+       +---------------------+
```

---

## Piece 1: AI Intake Agent

### What it is
A web-based chat interface where the client has a 15-20 minute conversation with an AI agent. The agent interviews them about their business, identifies their vertical and pain points, and collects document uploads — all conversationally.

### Deployment options (pick one)
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Dify chatflow embedded in a web page** | Fast to build, handles file uploads, visual builder for prompt flows | Dify's chat UI is basic | **Start here — fastest to MVP** |
| **Custom web app (Next.js/React) + Dify API** | Polished UI, full control over branding | More engineering work | Phase 2 upgrade |
| **DingTalk/Feishu bot** | Native to client's existing tool | Limited to clients on that platform | Add later for China market |

### Conversation flow design

```
PHASE 1: Introduction (2 min)
├── Greet client by name (from the engagement link)
├── Explain: "I'm going to ask you about your business operations.
│   This usually takes 15-20 minutes. You can also upload
│   documents at any point — orders, invoices, reports —
│   and I'll analyze them automatically."
├── Confirm their industry/vertical (or detect from conversation)
└── Set expectations: "After our conversation, you'll receive
    a preliminary analysis within 24 hours."

PHASE 2: Business Profile (5 min)
├── Company basics: headcount, revenue range, years operating
├── Team structure: which departments, how many people per dept
├── Tools currently used: ERP? Which one? WeChat for orders?
│   Email? Spreadsheets? Paper?
├── [Adaptive] If they mention WeChat orders → probe: volume,
│   format (text/voice/photo), who re-types them
└── [Adaptive] If they mention ERP → probe: which one, how
    much is actually used vs. Excel workarounds

PHASE 3: Pain Points (5 min)
├── "What's the most repetitive task your team does every day?"
├── "If you could eliminate one bottleneck, what would it be?"
├── "How long does [identified task] take? How many times per day?"
├── "Has anything fallen through the cracks recently? A missed
│   order, a late payment, a lost document?"
├── [Adaptive] Follow up on specifics: "You mentioned quotations
│   take 45 minutes. Walk me through what happens step by step."
└── Quantify: "Roughly how many hours per week does your team
    spend on [pain point]?"

PHASE 4: Document Collection (3 min)
├── "To give you accurate findings, I need to look at some of
│   your real documents. Can you upload any of these?"
├── Present a checklist based on vertical:
│   - Export: buyer inquiries, quotations, product catalog, price list
│   - Distribution: recent orders, invoices, AR aging report
│   - Construction: tender docs, progress reports, VO records
│   - Industrial: NCR reports, SOPs, AR aging, defect photos
│   - Property: service requests, complaint logs, fee collection records
├── Accept uploads inline in the chat
├── For each upload: "Got it. I can see this is a [type]. I'll
│   include this in the analysis."
└── "Don't worry if you can't find everything now. You can
    upload more later using the same link."

PHASE 5: Summary & Next Steps (2 min)
├── AI generates a summary: "Here's what I understood..."
├── Client confirms or corrects
├── "I'll analyze your documents overnight. You'll receive a
│   preliminary findings report by [time] tomorrow."
└── "If you find more documents to upload, just come back to
    this chat anytime."
```

### Technical build spec

**Dify chatflow nodes:**
1. **Welcome node** — system prompt with personality, vertical detection logic, conversation structure
2. **Profile collection node** — extracts structured data (headcount, tools, departments) from conversation
3. **Pain point exploration node** — adaptive questioning with follow-up logic
4. **Document upload handler** — accepts files, classifies type, confirms receipt
5. **Summary generator node** — produces structured JSON profile + natural language summary
6. **Closing node** — sets expectations, provides upload link for additional docs

**System prompt core (for the agent):**
```
You are a business operations analyst conducting an intake interview
for an AI workflow diagnostic. Your goal is to understand:
1. How the business operates day-to-day
2. Where time is wasted on repetitive manual tasks
3. What tools and systems they currently use
4. What their biggest operational pain points are

Rules:
- Ask ONE question at a time. Never overwhelm with multiple questions.
- Use plain business language. Never say "AI", "machine learning",
  "algorithm", or technical jargon.
- When the client mentions a pain point, probe deeper: how often,
  how long, what's the impact, who's affected.
- Quantify everything: hours, transactions, people, money.
- Be warm and professional. You're a consultant, not a chatbot.
- If the client uploads a document, acknowledge it specifically
  and tell them what you see.
- At the end, generate a structured summary in JSON format for
  the analysis pipeline.
```

**Output schema (JSON):**
```json
{
  "company": {
    "name": "",
    "industry": "",
    "vertical": "export|construction|distribution|industrial|property",
    "headcount": 0,
    "revenue_range": "",
    "years_operating": 0
  },
  "departments": [
    {"name": "", "headcount": 0, "tools_used": []}
  ],
  "pain_points": [
    {
      "description": "",
      "department": "",
      "frequency": "daily|weekly|monthly",
      "estimated_hours_per_week": 0,
      "estimated_people_involved": 0,
      "impact": ""
    }
  ],
  "current_tools": [],
  "documents_uploaded": [
    {"filename": "", "type": "", "description": ""}
  ],
  "key_quotes": [],
  "recommended_focus_areas": []
}
```

**Build time: 5-7 days**
- Day 1-2: Design conversation flow + write system prompts
- Day 3-4: Build Dify chatflow with all nodes + test
- Day 5: Build web page to embed Dify chat widget (branded)
- Day 6-7: Test with 3-5 mock clients, refine prompts

---

## Piece 2: Document Analysis Engine

### What it is
An automated pipeline that takes uploaded documents, parses them, extracts structured data, calculates metrics, and detects patterns — all without human involvement.

### Pipeline architecture

```
[Uploaded Documents]
       |
       v
+------------------+
| STEP 1: CLASSIFY |  What type of document is this?
| (LLM classifier) |  → order, invoice, quotation, complaint,
+------------------+    report, correspondence, etc.
       |
       v
+------------------+
| STEP 2: EXTRACT  |  Pull structured fields per doc type
| (LLM extraction) |  → dates, amounts, products, parties,
+------------------+    quantities, statuses, timestamps
       |
       v
+------------------+
| STEP 3: VALIDATE |  Check extraction quality
| (rule-based)     |  → missing fields? impossible values?
+------------------+    confidence score per extraction
       |
       v
+------------------+
| STEP 4: ANALYZE  |  Calculate metrics across all docs
| (Python scripts) |  → volume, timing, errors, patterns
+------------------+
       |
       v
+------------------+
| STEP 5: INSIGHT  |  Generate narrative insights
| (LLM narrative)  |  → "72% of orders arrive via WeChat..."
+------------------+
       |
       v
[Structured Analysis Results → feeds into Report Generator]
```

### Step-by-step detail

**Step 1: Document Classification**
- Input: raw uploaded file (PDF, image, Excel, text)
- LLM prompt: "Classify this document. Categories: [order, invoice, quotation, complaint, report, internal_communication, product_catalog, pricing_sheet, other]. Also identify the language and approximate date."
- Output: `{type, language, date, confidence}`
- Model: GLM-4.7-Flash (free, fast, good enough for classification)

**Step 2: Field Extraction (per document type)**
- Different extraction prompts per doc type:
  - **Order:** order_id, customer, products[], quantities[], prices[], total, date, channel (WeChat/email/phone), special_instructions
  - **Invoice:** invoice_id, vendor/customer, line_items[], amounts, dates, payment_terms, status
  - **Quotation:** inquiry_source, products[], specs, MOQs, prices, valid_until, language, response_time
  - **Complaint/Request:** requester, category, description, urgency, date_submitted, status, resolution_date
- For images/photos: use vision model (Qwen-VL or GPT-4V) to read handwritten/photographed docs
- Model: DeepSeek V3.2 for text docs, vision model for images

**Step 3: Validation**
- Rule-based checks: date in valid range? amounts > 0? required fields present?
- Flag low-confidence extractions for human review (but don't block pipeline)
- Output: confidence score per document (high/medium/low)

**Step 4: Metric Calculation (Python/JS)**
```
Volume Metrics:
- transactions_per_day (by type)
- transactions_by_channel (WeChat vs email vs phone)
- peak_hours, peak_days
- unique_customers, repeat_rate

Timing Metrics:
- avg_response_time (from inquiry received to quote sent)
- avg_processing_time (from order received to confirmed)
- avg_collection_cycle (from invoice to payment)
- time_distribution (histogram: how many take <1hr, 1-4hr, 4-8hr, >8hr)

Error/Quality Metrics:
- pricing_inconsistencies (same product, different prices)
- duplicate_entries
- missing_fields_rate
- late_response_rate (% over SLA threshold)

Pattern Metrics:
- channel_distribution
- product_concentration (top 10 products = what % of volume)
- customer_concentration (top 10 customers = what % of revenue)
- seasonal_patterns (if enough data)
```

**Step 5: Narrative Insight Generation**
- Feed all metrics into LLM with prompt:
```
You are a business operations analyst. Based on the following
data analysis of [company name]'s operations, write 5-8 key
findings that would surprise or concern the business owner.

Focus on:
- Where time is being wasted (with specific numbers)
- Where money is being lost (with specific numbers)
- Patterns they probably don't know about
- Comparisons to industry benchmarks (where available)
- The single biggest improvement opportunity

Write in plain business language. No jargon. Each finding
should be 2-3 sentences with a specific number attached.
```

**Build time: 8-10 days**
- Day 1-2: Build document classification pipeline in Dify
- Day 3-5: Build extraction prompts per doc type + test on sample docs
- Day 6-7: Build metric calculation scripts (Python)
- Day 8-9: Build narrative insight generator
- Day 10: Integration testing, end-to-end with mock data

---

## Piece 3: Preliminary Findings Report (Auto-Generated)

### What it is
An auto-generated HTML report (matching your pitch page design language) that the client receives within 24 hours of completing their intake. No human touches it.

### Report structure

```
1. COVER
   - Client company name
   - "Preliminary Operations Diagnostic"
   - Date
   - "Based on [N] documents analyzed and intake conversation"

2. YOUR BUSINESS AT A GLANCE (from intake agent)
   - Company profile summary
   - Team structure
   - Tools currently in use
   - Key pain points identified (in their own words)

3. WHAT YOUR DOCUMENTS TELL US (from analysis engine)
   - Documents analyzed: N docs across M categories
   - Volume snapshot: X transactions/day, Y via WeChat, Z via email
   - Timing snapshot: avg response time, processing time, collection cycle
   - Visual: bar chart of channel distribution
   - Visual: histogram of response time distribution

4. WHERE THE HOURS ARE HIDING (waste calculation)
   - Table: task | time per task | frequency | total hours/month | cost/month
   - Big number: "Your team spends [X] hours per month on tasks
     that can be handled in minutes"
   - Big number: "That's approximately ¥[Y] per month in labor cost"

5. PATTERNS WE FOUND (AI-generated insights)
   - 5-8 key findings with numbers
   - Each with a "Why this matters" explanation
   - Flagged anomalies or risks

6. WHAT THIS MEANS FOR YOU (preliminary ROI)
   - Conservative/moderate/aggressive savings scenarios
   - Visual: simple ROI comparison chart
   - "Based on what we've seen, automation could recover
     [X] hours and ¥[Y] per month"

7. NEXT STEP
   - "These findings are based on document analysis alone.
     The full diagnostic includes an on-site audit where we
     observe your team in action and demonstrate a working
     prototype on your real data."
   - "If these numbers resonate, let's schedule the on-site."
   - CTA button/link
```

### Design
- Use the same visual design language as the client pitch pages (modern, clean, accent colored per vertical)
- Charts rendered as inline SVG or CSS (no external JS libraries needed)
- Prints cleanly to PDF via browser print
- Mobile-responsive for viewing on phone

**Build time: 5-7 days**
- Day 1-2: HTML/CSS report template with placeholder sections
- Day 3-4: Data injection layer (takes analysis output → populates template)
- Day 5: Chart generation (bar charts, histograms as inline SVG)
- Day 6-7: Testing with mock data, polish layout

---

## Total Build Timeline

| Sprint | What | Duration | Who |
|--------|------|----------|-----|
| Sprint 1 | AI Intake Agent (Dify chatflow + web embed) | 5-7 days | Joanna (technical) |
| Sprint 2 | Document Analysis Engine (parsing + metrics + insights) | 8-10 days | Joanna (technical) |
| Sprint 3 | Report Generator (HTML template + data injection + charts) | 5-7 days | Both (Joanna: logic, Will: design/content) |
| Testing | End-to-end dry run with mock client data | 2-3 days | Both |
| **Total** | **Fully automated Day 0-1 diagnostic product** | **~4-5 weeks** | |

### Parallel work while Joanna builds
Will can work on simultaneously:
- Writing system prompts and conversation flows for all 5 verticals
- Creating mock client datasets for testing (fake orders, invoices, etc.)
- Designing the report template HTML/CSS
- Building the benchmark library structure
- Doing discovery interviews with potential clients
- Refining the client pitch pages

---

## Files to Create
All under: `pitch-pages/diagnostic-tool/` (or new top-level `diagnostic/` directory)

1. `diagnostic/intake-agent/` — Dify chatflow export + system prompts + web embed page
2. `diagnostic/analysis-engine/` — Document parsing workflows + metric calculation scripts
3. `diagnostic/report-generator/` — HTML report template + data injection logic + chart components
4. `diagnostic/test-data/` — Mock client datasets for each vertical
5. `diagnostic/prompts/` — All LLM prompts organized by function (classification, extraction, narrative, etc.)

---

## Verification
1. **End-to-end test:** Create a fake 50-person export manufacturer. Run the full Day 0-1 flow: intake conversation → doc upload → analysis → report. Time it
2. **Report credibility check:** Show the auto-generated report to someone unfamiliar with the project. Do they find it credible and actionable?
3. **Document parser accuracy:** Test on 50 real-ish documents across 3 formats (PDF, image, Excel). Target >90% extraction accuracy
4. **Intake agent quality:** Have 3 people play "client" with different communication styles. Does the agent adapt? Does it get useful data?
