# Self-Serve Diagnostics Tool

Owner: William

## Overview

After a customer completes the AI intake conversation (Dify chatbot), they land on an instant self-serve dashboard showing:

1. **AI Readiness Score** — computed from intake answers + calculator logic
2. **Preliminary Waste Estimates** — hours/week wasted per pain point, total cost in RMB
3. **Department Health Cards** — per-department tool adoption, manual process load, automation potential
4. **"Go Deeper" CTA** — upload documents for full analysis via the analysis-engine
5. **Instant ROI Preview** — projected savings from automation

## Data Flow

```
Dify Chatbot
  → intake JSON (output-schema.json)
  → POST /api/diagnostics/self-serve/sessions
  → Dashboard renders instantly
  → Optional: upload docs
  → analysis-engine pipeline
  → Full diagnostic report
```

## API Endpoints

### POST /api/diagnostics/self-serve/sessions

Create a new self-serve session from completed intake data.

**Request body:**
```json
{
  "intake_data": {
    "company_name": "string",
    "industry": "string",
    "employee_count": "number",
    "departments": [...],
    "pain_points": [...],
    "current_tools": [...],
    "budget_range": "string"
  }
}
```
Schema follows `shared/schemas/intake_output.json`.

**Response (201):**
```json
{
  "session_id": "uuid",
  "readiness_score": 0.0,
  "created_at": "ISO-8601"
}
```

### GET /api/diagnostics/self-serve/sessions/{session_id}/dashboard

Retrieve the full instant dashboard payload for rendering.

**Response (200):**
```json
{
  "session_id": "uuid",
  "readiness_score": {
    "overall": 0.0,
    "breakdown": {
      "tech_infrastructure": 0.0,
      "process_maturity": 0.0,
      "data_readiness": 0.0,
      "team_capability": 0.0
    }
  },
  "waste_estimates": {
    "total_hours_per_week": 0,
    "total_cost_rmb_per_month": 0,
    "by_pain_point": [
      {
        "pain_point": "string",
        "hours_per_week": 0,
        "cost_rmb_per_month": 0
      }
    ]
  },
  "department_health_cards": [
    {
      "department": "string",
      "tool_adoption_score": 0.0,
      "manual_process_load": 0.0,
      "automation_potential": 0.0,
      "top_opportunities": ["string"]
    }
  ],
  "roi_preview": {
    "projected_savings_rmb_per_year": 0,
    "payback_period_months": 0,
    "efficiency_gain_percent": 0.0
  }
}
```

### POST /api/diagnostics/self-serve/sessions/{session_id}/documents

Upload documents for deeper analysis beyond the instant dashboard.

**Request:** multipart/form-data with file uploads

**Response (202):**
```json
{
  "session_id": "uuid",
  "analysis_status": "queued",
  "document_count": 0
}
```

## Dashboard Layout

The frontend renders five sections (in `frontend/src/pages/DiagnosticDashboard.tsx`):

### 1. AI Readiness Score (Hero Section)
- Large circular gauge showing overall score (0-100)
- Four sub-scores: tech infrastructure, process maturity, data readiness, team capability
- Data source: `readiness_score` from dashboard endpoint
- Mapped from intake fields: `current_tools`, `departments[].processes`, `pain_points`

### 2. Preliminary Waste Estimates
- Bar chart of hours wasted per pain point per week
- Summary card with total monthly cost in RMB
- Data source: `waste_estimates` from dashboard endpoint
- Mapped from intake fields: `pain_points`, `employee_count`, `departments[].headcount`

### 3. Department Health Cards
- Grid of cards, one per department reported in intake
- Each card shows: tool adoption score, manual process load gauge, automation potential meter, top 3 opportunities
- Data source: `department_health_cards` from dashboard endpoint
- Mapped from intake fields: `departments[]` with `tools`, `processes`, `pain_points`

### 4. "Go Deeper" CTA
- Prominent call-to-action to upload operational documents
- File upload zone accepting PDF, Excel, CSV, Word documents
- Triggers POST /sessions/{session_id}/documents
- Shows progress indicator while analysis-engine processes files

### 5. Instant ROI Preview
- Three key metrics: projected annual savings (RMB), payback period (months), efficiency gain (%)
- Data source: `roi_preview` from dashboard endpoint
- Mapped from intake fields: uses waste estimates + industry benchmarks from calculator logic

## Scoring Algorithm

The readiness score computation references the logic in `services/diagnostics/calculator/ai-workforce-calculator.jsx`:

### Overall Readiness Score (0-100)
Weighted average of four dimensions:

1. **Tech Infrastructure (25%)** — based on `current_tools` diversity and modernity
   - 0-3 tools: low (20-40)
   - 4-7 tools: medium (40-70)
   - 8+ tools with integrations: high (70-100)

2. **Process Maturity (30%)** — based on how structured/documented processes are
   - Mostly manual, undocumented: low (20-40)
   - Partially documented: medium (40-70)
   - Well-documented with some automation: high (70-100)

3. **Data Readiness (25%)** — based on data centralization and accessibility
   - Siloed across departments: low (20-40)
   - Partially centralized: medium (40-70)
   - Centralized with APIs: high (70-100)

4. **Team Capability (20%)** — based on technical skills and openness to AI
   - No technical staff: low (20-40)
   - Some technical capability: medium (40-70)
   - Dedicated technical team: high (70-100)

### Waste Estimation
- Each pain point is assigned an estimated hours/week based on severity and department size
- Cost = hours x average hourly rate (derived from industry and employee count)
- Uses multipliers from the calculator logic for industry-specific benchmarks

### ROI Preview
- Projected savings = total waste cost x automation capture rate (industry-specific, typically 30-60%)
- Payback period = estimated implementation cost / monthly savings
- Efficiency gain = automated hours / total current hours

## Integration Points

- **Input:** `shared/schemas/intake_output.json` — the canonical intake data schema
- **Output:** Dashboard data rendered in `frontend/src/pages/DiagnosticDashboard.tsx`
- **Optional:** Feeds into `services/diagnostics/analysis-engine/` for deeper document-based analysis
- **Calculator logic:** References `services/diagnostics/calculator/ai-workforce-calculator.jsx` for scoring weights and industry benchmarks
