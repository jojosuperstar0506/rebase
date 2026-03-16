"""FastAPI endpoints for Product Structure Agent.

Platform integration API — allows the Rebase gateway and frontend
to trigger analyses and retrieve results programmatically.
"""

from __future__ import annotations

import uuid
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse

from .core.column_mapper import detect_file_type
from .core.data_merger import read_and_classify_files, merge_datasets
from .core.analyzer import run_full_analysis
from .core.excel_writer import write_analysis_excel
from .models.schemas import AnalysisResult, FileType

router = APIRouter(prefix="/product-agent", tags=["Product Structure Agent"])

# In-memory storage for analysis results (replace with DB in production)
_analyses: dict[str, dict] = {}


@router.post("/upload")
async def upload_and_analyze(
    files: list[UploadFile] = File(...),
    cost_ratio: float = 0.40,
    months_in_period: int = 12,
) -> dict:
    """Upload Excel files and run product structure analysis.

    Accepts 1-3 Excel files from 聚水潭 exports. Auto-detects file types.
    At minimum, a sales data file is required.

    Returns:
        analysis_id and summary KPIs.
    """
    if not files:
        raise HTTPException(status_code=400, detail="至少需要上传一个Excel文件")

    # Read files into buffers
    file_buffers = []
    for f in files:
        content = await f.read()
        file_buffers.append((f.filename, BytesIO(content)))

    try:
        classified = read_and_classify_files(file_buffers=file_buffers)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件读取失败: {str(e)}")

    if FileType.SALES not in classified:
        detected = [ft.value for ft in classified.keys()]
        raise HTTPException(
            status_code=400,
            detail=f"未检测到销售数据文件。已识别: {detected}。"
                   f"请确保上传包含"净销售额""退货数量"等字段的文件。"
        )

    try:
        merged_df = merge_datasets(
            classified, cost_ratio=cost_ratio, months_in_period=months_in_period
        )
        result = run_full_analysis(merged_df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    # Generate Excel
    excel_buffer = write_analysis_excel(merged_df, result)

    # Store result
    _analyses[result.analysis_id] = {
        "result": result,
        "merged_df": merged_df,
        "excel_buffer": excel_buffer,
    }

    return {
        "analysis_id": result.analysis_id,
        "status": "completed",
        "summary": result.summary.model_dump(),
        "insights": result.key_insights,
        "files_detected": {ft.value: len(df) for ft, df in classified.items()},
    }


@router.get("/{analysis_id}/status")
async def get_analysis_status(analysis_id: str) -> dict:
    """Check analysis progress."""
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail=f"分析 {analysis_id} 不存在")
    return {"analysis_id": analysis_id, "status": "completed"}


@router.get("/{analysis_id}/result")
async def get_analysis_result(analysis_id: str) -> dict:
    """Get structured JSON analysis results."""
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail=f"分析 {analysis_id} 不存在")

    result: AnalysisResult = _analyses[analysis_id]["result"]
    return result.model_dump()


@router.get("/{analysis_id}/excel")
async def download_analysis_excel(analysis_id: str) -> StreamingResponse:
    """Download the formatted Excel report."""
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail=f"分析 {analysis_id} 不存在")

    excel_buffer: BytesIO = _analyses[analysis_id]["excel_buffer"]
    excel_buffer.seek(0)

    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=product_analysis_{analysis_id}.xlsx"
        },
    )


@router.get("/health")
async def health() -> dict:
    """Health check."""
    return {
        "service": "product-agent",
        "status": "healthy",
        "analyses_in_memory": len(_analyses),
    }
