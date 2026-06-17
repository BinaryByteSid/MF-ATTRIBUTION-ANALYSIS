from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.attribution import attribution as crud_attribution
from app.crud.portfolio import portfolio as crud_portfolio
from app.dependencies import get_current_active_user, get_db, require_role
from app.models.user import User
from app.schemas.attribution import (
    AttributionRequest,
    AttributionResponse,
    AttributionSummary,
    BrinsonSegment,
    RiskMetrics,
)

router = APIRouter()
analyst_plus = require_role("admin", "analyst")


def _check_ownership(p, current_user: User):
    if p.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/compute")
async def compute_attribution(
    body: AttributionRequest,
    current_user: User = Depends(analyst_plus),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an attribution analysis task."""
    p = await crud_portfolio.get(db, body.portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    try:
        from app.tasks.attribution_compute import run_attribution
        task = run_attribution.delay(
            str(body.portfolio_id),
            str(body.benchmark_id) if body.benchmark_id else None,
            body.period_start.isoformat(),
            body.period_end.isoformat(),
            body.method,
        )
        return {
            "job_id": task.id,
            "status": "queued",
            "portfolio_id": str(body.portfolio_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue task: {str(e)}")


@router.get("/{portfolio_id}", response_model=AttributionResponse)
async def get_latest_attribution(
    portfolio_id: uuid.UUID,
    method: str = Query("brinson"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest cached attribution result."""
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    ar = await crud_attribution.get_latest(db, portfolio_id, method)
    if not ar:
        raise HTTPException(status_code=404, detail="No attribution results found. Run /compute first.")

    return _build_response(ar)


@router.get("/{portfolio_id}/history", response_model=List[AttributionResponse])
async def get_attribution_history(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    results = await crud_attribution.get_by_portfolio(db, portfolio_id)
    return [_build_response(r) for r in results]


@router.get("/{portfolio_id}/brinson", response_model=AttributionResponse)
async def get_brinson_attribution(
    portfolio_id: uuid.UUID,
    period_start: date = Query(...),
    period_end: date = Query(...),
    benchmark_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(analyst_plus),
    db: AsyncSession = Depends(get_db),
):
    """Run Brinson attribution synchronously and return result."""
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    bm_id = benchmark_id or p.benchmark_id
    try:
        from app.analytics.attribution import run_full_attribution
        result = await run_full_attribution(
            db=db,
            portfolio_id=portfolio_id,
            benchmark_id=bm_id,
            period_start=period_start,
            period_end=period_end,
            method="brinson",
        )
        ar = await crud_attribution.get_latest(db, portfolio_id, "brinson")
        if ar:
            return _build_response(ar)
        raise HTTPException(status_code=500, detail="Attribution computation failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{portfolio_id}/risk", response_model=RiskMetrics)
async def get_risk_metrics(
    portfolio_id: uuid.UUID,
    period_start: date = Query(...),
    period_end: date = Query(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute Sharpe, Sortino, Max Drawdown, Beta, Alpha synchronously."""
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    try:
        from app.analytics.attribution import compute_portfolio_daily_returns
        from app.crud.benchmark import benchmark_crud
        from app.analytics.metrics import compute_all_risk_metrics
        import pandas as pd

        port_returns = await compute_portfolio_daily_returns(db, portfolio_id, period_start, period_end)

        bench_returns = pd.Series(dtype=float)
        if p.benchmark_id:
            bm_returns = await benchmark_crud.get_returns(db, p.benchmark_id, period_start, period_end)
            if bm_returns:
                bench_returns = pd.Series(
                    {r.return_date: float(r.daily_return) for r in bm_returns}
                )

        nav_series = (1 + port_returns).cumprod()
        metrics = compute_all_risk_metrics(port_returns, bench_returns, nav_series)
    except Exception:
        metrics = {}

    return RiskMetrics(
        portfolio_id=portfolio_id,
        period_start=period_start,
        period_end=period_end,
        sharpe_ratio=metrics.get("sharpe_ratio"),
        sortino_ratio=metrics.get("sortino_ratio"),
        max_drawdown=metrics.get("max_drawdown"),
        beta=metrics.get("beta"),
        alpha=metrics.get("alpha"),
        information_ratio=metrics.get("information_ratio"),
        var_95=metrics.get("var_95"),
        calmar_ratio=metrics.get("calmar_ratio"),
        up_capture=metrics.get("up_capture"),
        down_capture=metrics.get("down_capture"),
    )


def _build_response(ar) -> AttributionResponse:
    result_json = ar.result_json or {}
    segments = [BrinsonSegment(**s) for s in result_json.get("segments", [])]
    summary = AttributionSummary(
        total_return=float(ar.total_return or 0),
        benchmark_return=float(ar.benchmark_return or 0),
        active_return=float(ar.active_return or 0),
        allocation_effect=float(ar.allocation_effect or 0),
        selection_effect=float(ar.selection_effect or 0),
        interaction_effect=float(ar.interaction_effect or 0),
    )
    return AttributionResponse(
        id=ar.id,
        portfolio_id=ar.portfolio_id,
        benchmark_id=ar.benchmark_id,
        period_start=ar.period_start,
        period_end=ar.period_end,
        method=ar.method,
        summary=summary,
        segments=segments,
        computed_at=ar.computed_at,
    )
