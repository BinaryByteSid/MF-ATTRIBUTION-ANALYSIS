from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import and_, insert, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.fund import AssetClass, Fund, FundCategory
from app.models.nav_history import NavHistory
from app.schemas.fund import FundCreate, FundUpdate


class CRUDFund(CRUDBase[Fund, FundCreate, FundUpdate]):

    async def get_by_isin(self, db: AsyncSession, isin: str) -> Optional[Fund]:
        result = await db.execute(select(Fund).where(Fund.isin == isin))
        return result.scalar_one_or_none()

    async def get_by_amfi_code(self, db: AsyncSession, amfi_code: str) -> Optional[Fund]:
        result = await db.execute(select(Fund).where(Fund.amfi_code == amfi_code))
        return result.scalar_one_or_none()

    async def search(
        self,
        db: AsyncSession,
        *,
        query: Optional[str] = None,
        category_id: Optional[int] = None,
        fund_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Fund]:
        stmt = select(Fund).where(Fund.is_active == True)
        if query:
            stmt = stmt.where(
                or_(
                    Fund.scheme_name.ilike(f"%{query}%"),
                    Fund.isin.ilike(f"%{query}%"),
                    Fund.amc.ilike(f"%{query}%"),
                )
            )
        if category_id is not None:
            stmt = stmt.where(Fund.category_id == category_id)
        if fund_type:
            stmt = stmt.where(Fund.fund_type == fund_type)
        stmt = stmt.offset(skip).limit(limit).order_by(Fund.scheme_name)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, *, obj_in: FundCreate) -> Fund:
        db_obj = Fund(**obj_in.model_dump())
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_nav_history(
        self,
        db: AsyncSession,
        fund_id: uuid.UUID,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> list[NavHistory]:
        stmt = select(NavHistory).where(NavHistory.fund_id == fund_id)
        if from_date:
            stmt = stmt.where(NavHistory.nav_date >= from_date)
        if to_date:
            stmt = stmt.where(NavHistory.nav_date <= to_date)
        stmt = stmt.order_by(NavHistory.nav_date)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def bulk_upsert_nav(self, db: AsyncSession, records: list[dict]) -> int:
        """
        Upserts NAV records efficiently.
        Each record: {fund_id: UUID, nav_date: date, nav: Decimal}
        """
        if not records:
            return 0
        stmt = text(
            """
            INSERT INTO nav_history (fund_id, nav_date, nav)
            VALUES (:fund_id, :nav_date, :nav)
            ON CONFLICT (fund_id, nav_date)
            DO UPDATE SET nav = EXCLUDED.nav
            """
        )
        await db.execute(stmt, records)
        await db.commit()
        return len(records)

    async def get_latest_nav(self, db: AsyncSession, fund_id: uuid.UUID) -> Optional[NavHistory]:
        result = await db.execute(
            select(NavHistory)
            .where(NavHistory.fund_id == fund_id)
            .order_by(NavHistory.nav_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_all_categories(self, db: AsyncSession) -> list[FundCategory]:
        result = await db.execute(select(FundCategory).order_by(FundCategory.name))
        return list(result.scalars().all())

    async def get_asset_classes(self, db: AsyncSession) -> list[AssetClass]:
        result = await db.execute(select(AssetClass).order_by(AssetClass.name))
        return list(result.scalars().all())


fund = CRUDFund(Fund)
