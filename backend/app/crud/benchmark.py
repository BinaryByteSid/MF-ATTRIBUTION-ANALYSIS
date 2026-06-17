from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.benchmark import Benchmark, BenchmarkReturn
from app.schemas.benchmark import BenchmarkCreate, BenchmarkUpdate


class CRUDBenchmark(CRUDBase[Benchmark, BenchmarkCreate, BenchmarkUpdate]):

    async def get_by_name(self, db: AsyncSession, name: str) -> Optional[Benchmark]:
        result = await db.execute(select(Benchmark).where(Benchmark.name == name))
        return result.scalar_one_or_none()

    async def get_all(self, db: AsyncSession) -> list[Benchmark]:
        result = await db.execute(select(Benchmark).order_by(Benchmark.name))
        return list(result.scalars().all())

    async def get_returns(
        self,
        db: AsyncSession,
        benchmark_id: uuid.UUID,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> list[BenchmarkReturn]:
        stmt = select(BenchmarkReturn).where(BenchmarkReturn.benchmark_id == benchmark_id)
        if from_date:
            stmt = stmt.where(BenchmarkReturn.return_date >= from_date)
        if to_date:
            stmt = stmt.where(BenchmarkReturn.return_date <= to_date)
        stmt = stmt.order_by(BenchmarkReturn.return_date)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def bulk_upsert_returns(
        self, db: AsyncSession, benchmark_id: uuid.UUID, records: list[dict]
    ) -> int:
        if not records:
            return 0
        for r in records:
            r["benchmark_id"] = str(benchmark_id)
        stmt = text(
            """
            INSERT INTO benchmark_returns (benchmark_id, return_date, daily_return)
            VALUES (:benchmark_id, :return_date, :daily_return)
            ON CONFLICT (benchmark_id, return_date)
            DO UPDATE SET daily_return = EXCLUDED.daily_return
            """
        )
        await db.execute(stmt, records)
        await db.commit()
        return len(records)

    async def create(self, db: AsyncSession, *, obj_in: BenchmarkCreate) -> Benchmark:
        db_obj = Benchmark(**obj_in.model_dump())
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


benchmark_crud = CRUDBenchmark(Benchmark)
