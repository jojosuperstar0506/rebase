# Diagnostics Service

**Owner**: William

## Overview

The diagnostics service handles the first customer touchpoint: understanding their business through an AI-powered intake conversation, analyzing their documents, and generating an automated findings report.

This is a Phase 1 service and the current development focus for the Rebase platform.

## Components

| Component | Directory | Description | Status |
|-----------|-----------|-------------|--------|
| **Intake Agent** | `intake-agent/` | AI conversational agent (Dify chatbot) that interviews SMB clients, collects business profile and pain points, accepts document uploads | Ready for Dify build |
| **Self-Serve Dashboard** | `self-serve/` | Instant health-check dashboard with AI readiness scores, waste estimates, and department health cards | Stub (API defined) |
| **Analysis Engine** | `analysis-engine/` | Automated pipeline: classify docs, extract fields, calculate metrics, generate narrative insights | Stub (modules defined) |
| **Report Generator** | `report-generator/` | Auto-generated HTML findings report with charts, waste calculations, and ROI projections | Stub (generator + templates) |
| **Calculator** | `calculator/` | AI workforce calculator (React component) for ROI and cost projections | JSX component |

## Quick Start

- **Intake Agent**: Runs on Dify. See `intake-agent/dify-chatflow-guide.md` for setup instructions. System prompt is in `intake-agent/prompts/master-system-prompt.md`.
- **Self-Serve Dashboard**: React page at `frontend/src/pages/DiagnosticDashboard.tsx` (not yet created). API routes defined in `self-serve/api.py`.
- **Analysis Engine**: Python stubs in `analysis-engine/` (classifier, extractor, metrics, insight_generator). Not yet implemented.
- **Report Generator**: Python stubs in `report-generator/` with templates directory. Not yet implemented.

## API Surface

### Core Diagnostics API (`api.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostics/intake` | Accept intake JSON from Dify chatbot |
| GET | `/api/diagnostics/intake/{engagement_id}` | Retrieve stored intake data |
| POST | `/api/diagnostics/analysis/{engagement_id}/run` | Trigger document analysis |
| GET | `/api/diagnostics/analysis/{engagement_id}` | Get analysis results |
| GET | `/api/diagnostics/report/{engagement_id}` | Get generated diagnostic report |

### Self-Serve API (`self-serve/api.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnostics/self-serve/sessions` | Create session from completed intake |
| GET | `/api/diagnostics/self-serve/sessions/{session_id}/dashboard` | Get instant dashboard data |
| POST | `/api/diagnostics/self-serve/sessions/{session_id}/documents` | Upload documents for deeper analysis |

## Data Contracts

- **Input**: `shared/schemas/intake_output.json` — structured JSON output from the Dify intake chatbot
- **Output**: `shared/schemas/analysis_result.py` — Pydantic model consumed by the report-generator
