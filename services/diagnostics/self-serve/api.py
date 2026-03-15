"""
Self-Serve Diagnostics API — FastAPI router for the instant dashboard.

After a customer completes the Dify intake chatbot, these endpoints power
the self-serve dashboard with instant readiness scores, waste estimates,
and department health cards.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File

router = APIRouter(prefix="/api/diagnostics/self-serve", tags=["self-serve"])


@router.post("/sessions")
async def create_session(intake_data: dict):
    """Create a self-serve session from completed intake JSON.

    Accepts the output of the Dify chatbot (intake_output.json schema),
    computes instant scores, and returns a session ID for dashboard access.
    """
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/sessions/{session_id}/dashboard")
async def get_dashboard(session_id: str):
    """Get instant health-check dashboard data for a session.

    Returns AI readiness score, waste estimates, department health cards,
    and ROI preview — all computed from intake answers alone.
    """
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/sessions/{session_id}/documents")
async def upload_documents(session_id: str, files: list[UploadFile] = File(...)):
    """Upload documents for deeper analysis beyond the instant dashboard.

    Triggers the analysis-engine pipeline (classifier -> extractor ->
    metrics -> insight generator) for a full diagnostic report.
    """
    raise HTTPException(status_code=501, detail="Not implemented")
