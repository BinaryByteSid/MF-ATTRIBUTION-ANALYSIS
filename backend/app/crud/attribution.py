from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.attribution_result import AttributionResult
from app.schemas.attribution import AttributionRequest


class CRUDAttribution(CRUDBase[AttributionResult, AttributionRequest, dict]):

    async def get_by_portfolio(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        method: Optional[str] = None,
    ) -> list[AttributionResult]:
        stmt = (
            select(AttributionResult)
            .where(AttributionResult.portfolio_id == portfolio_id)
            .order_by(AttributionResult.computed_at.desc())
        )
        if method:
            stmt = stmt.where(AttributionResult.method == method)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_latest(
        self, db: AsyncSession, portfolio_id: uuid.UUID, method: str = "brinson"
    ) -> Optional[AttributionResult]:
        result = await db.execute(
            select(AttributionResult)
            .where(
                and_(
                    AttributionResult.portfolio_id == portfolio_id,
                    AttributionResult.method == method,
                )
            )
            .order_by(AttributionResult.computed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def upsert_result(
        self,
        db: AsyncSession,
        *,
        portfolio_id: uuid.UUID,
        benchmark_id: Optional[uuid.UUID],
        period_start: date,
        period_end: date,
        method: str,
        computed_data: dict,
    ) -> AttributionResult:
        result = await db.execute(
            select(AttributionResult).where(
                and_(
                    AttributionResult.portfolio_id == portfolio_id,
                    AttributionResult.period_start == period_start,
                    AttributionResult.period_end == period_end,
                    AttributionResult.method == method,
                )
            )
        )
        ar = result.scalar_one_or_none()

        summary = computed_data.get("summary", {})
        if ar:
            ar.benchmark_id = benchmark_id
            ar.total_return = summary.get("total_return")
            ar.benchmark_return = summary.get("benchmark_return")
            ar.active_return = summary.get("active_return")
            ar.allocation_effect = summary.get("allocation_effect")
            ar.selection_effect = summary.get("selection_effect")
            ar.interaction_effect = summary.get("interaction_effect")
            ar.result_json = computed_data
        else:
            ar = AttributionResult(
                portfolio_id=portfolio_id,
                benchmark_id=benchmark_id,
                period_start=period_start,
                period_end=period_end,
                method=method,
                total_return=summary.get("total_return"),
                benchmark_return=summary.get("benchmark_return"),
                active_return=summary.get("active_return"),
                allocation_effect=summary.get("allocation_effect"),
                selection_effect=summary.get("selection_effect"),
                interaction_effect=summary.get("interaction_effect"),
                result_json=computed_data,
            )
            db.add(ar)

        await db.commit()
        await db.refresh(ar)
        return ar


attribution = CRUDAttribution(AttributionResult)
