from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crud.portfolio import portfolio as crud_portfolio
from app.dependencies import get_current_active_user, get_db
from app.models.user import User
from app.schemas.report import ReportJobResponse, ReportRequest, ReportStatusResponse

router = APIRouter()
settings = get_settings()


def _check_ownership(p, current_user: User):
    if p.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/generate", response_model=ReportJobResponse)
async def generate_report(
    body: ReportRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a report generation task."""
    p = await crud_portfolio.get(db, body.portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    try:
        from app.tasks.report_generation import generate_report as celery_task
        task = celery_task.delay(
            str(body.portfolio_id),
            body.report_type,
            body.period_start.isoformat() if body.period_start else None,
            body.period_end.isoformat() if body.period_end else None,
            body.format,
            str(current_user.id),
        )
        return ReportJobResponse(
            job_id=task.id,
            status="pending",
            portfolio_id=body.portfolio_id,
            created_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue report: {str(e)}")


@router.get("/{job_id}/status", response_model=ReportStatusResponse)
async def get_report_status(
    job_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll the Celery task status for a report job."""
    try:
        from app.tasks.celery_app import celery_app
        from celery.result import AsyncResult

        result = AsyncResult(job_id, app=celery_app)
        state_map = {
            "PENDING": "pending",
            "STARTED": "running",
            "SUCCESS": "completed",
            "FAILURE": "failed",
        }
        status = state_map.get(result.state, "pending")
        download_url = None
        error = None

        if result.state == "SUCCESS":
            download_url = f"/api/v1/reports/{job_id}/download"
        elif result.state == "FAILURE":
            error = str(result.result)

        return ReportStatusResponse(
            job_id=job_id,
            status=status,
            progress=100 if status == "completed" else 0,
            download_url=download_url,
            error=error,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}/download")
async def download_report(
    job_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Download a completed report file."""
    try:
        from app.tasks.celery_app import celery_app
        from celery.result import AsyncResult

        result = AsyncResult(job_id, app=celery_app)
        if result.state != "SUCCESS":
            raise HTTPException(status_code=404, detail=f"Report not ready (state: {result.state})")

        file_info = result.result
        file_path = file_info.get("file_path", "")
        fmt = file_info.get("format", "pdf")

        if not file_path or not Path(file_path).exists():
            raise HTTPException(status_code=404, detail="Report file not found on disk")

        media_type_map = {
            "pdf": "application/pdf",
            "csv": "text/csv",
            "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        return FileResponse(
            path=file_path,
            media_type=media_type_map.get(fmt, "application/octet-stream"),
            filename=Path(file_path).name,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-metrics")
async def get_risk_metrics(
    fund_name: str = Query(..., description="Name of the fund"),
    from_date: str = Query("2025-12", description="Start date (YYYY-MM)"),
    to_date: str = Query("2026-04", description="End date (YYYY-MM)"),
    bench_name: str = Query("", description="Name of the benchmark fund (optional)"),
    isin: str = Query("", description="ISIN of the fund (optional)"),
    bench_isin: str = Query("", description="ISIN of the benchmark fund (optional)"),
):
    """
    Compute and return risk metrics (Sharpe, Sortino, Beta, Alpha, etc.)
    using the same logic as the Monthly Tracker Excel generator.
    This ensures the dashboard displays exactly the same values as the Excel report.
    """
    try:
        from app.utils.risk_metrics import compute_dashboard_risk_metrics
        result = compute_dashboard_risk_metrics(
            fund_name=fund_name,
            isin=isin,
            from_date=from_date,
            to_date=to_date,
            bench_name=bench_name,
            bench_isin=bench_isin,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute risk metrics: {str(e)}")


@router.get("/monthly-tracker")
async def get_monthly_tracker(
    isin: str = Query(..., description="ISIN of the fund"),
    fund_name: str = Query(..., description="Name of the fund"),
    from_date: str = Query("2025-12", description="Start date (YYYY-MM)"),
    to_date: str = Query("2026-04", description="End date (YYYY-MM)"),
    bench_isin: str = Query("", description="ISIN of the benchmark fund (optional)"),
    bench_name: str = Query("", description="Name of the benchmark fund (optional)"),
):
    """
    Generate and download the Monthly Tracker Excel sheet populated with data
    for the chosen fund.
    """
    settings = get_settings()
    current_dir = Path(__file__).resolve().parent
    base_dir = Path(__file__).resolve().parents[4]
    # Check multiple possible template locations
    possible_paths = [
        current_dir.parent.parent / "templates" / "Monthly Tracker - Flexi cap.xlsx",
        base_dir / "FUNDS PERFORMANCE ANALYSIS" / "Monthly Tracker - Flexi cap.xlsx",
        base_dir / "Monthly Tracker - Flexi cap.xlsx",
    ]
    template_path = None
    for p in possible_paths:
        if p.exists():
            template_path = str(p)
            break
    
    if template_path is None:
        raise HTTPException(status_code=404, detail=f"Template Monthly Tracker Excel file not found. Searched in: {[str(p) for p in possible_paths]}")

    reports_dir = Path(settings.REPORTS_DIR)
    reports_dir.mkdir(parents=True, exist_ok=True)
    
    job_id = f"tracker_{isin}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    output_filename = f"{job_id}.xlsx"
    output_path = str(reports_dir / output_filename)

    try:
        from app.utils.tracker_excel import generate_monthly_tracker_excel
        generate_monthly_tracker_excel(
            isin=isin,
            fund_name=fund_name,
            template_path=template_path,
            output_path=output_path,
            from_date=from_date,
            to_date=to_date,
            bench_isin=bench_isin,
            bench_name=bench_name,
        )
        
        return FileResponse(
            path=output_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"{fund_name.replace(' ', '_')}_Monthly_Tracker.xlsx",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel tracker: {str(e)}")
