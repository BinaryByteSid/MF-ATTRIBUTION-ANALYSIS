from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.portfolio import Holding, Portfolio, PortfolioSnapshot
from app.schemas.portfolio import PortfolioCreate, PortfolioUpdate


class CRUDPortfolio(CRUDBase[Portfolio, PortfolioCreate, PortfolioUpdate]):

    async def create(self, db: AsyncSession, *, obj_in: PortfolioCreate, user_id: uuid.UUID) -> Portfolio:
        db_obj = Portfolio(
            user_id=user_id,
            name=obj_in.name,
            description=obj_in.description,
            currency=obj_in.currency,
            benchmark_id=obj_in.benchmark_id,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_user_portfolios(
        self, db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> list[Portfolio]:
        result = await db.execute(
            select(Portfolio)
            .where(Portfolio.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .order_by(Portfolio.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_with_holdings(self, db: AsyncSession, portfolio_id: uuid.UUID) -> Optional[Portfolio]:
        result = await db.execute(
            select(Portfolio)
            .options(selectinload(Portfolio.holdings))
            .where(Portfolio.id == portfolio_id)
        )
        return result.scalar_one_or_none()

    async def get_summary(self, db: AsyncSession, portfolio_id: uuid.UUID) -> dict:
        result = await db.execute(
            select(Holding).where(Holding.portfolio_id == portfolio_id)
        )
        holdings = result.scalars().all()
        total_value = sum(float(h.current_value or 0) for h in holdings)
        total_invested = sum(float(h.units) * float(h.avg_nav) for h in holdings)
        return {
            "total_value": Decimal(str(total_value)),
            "total_invested": Decimal(str(total_invested)),
        }

    async def upsert_holding(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        fund_id: uuid.UUID,
        units_delta: Decimal,
        nav: Decimal,
        txn_type: str,
    ) -> Holding:
        result = await db.execute(
            select(Holding).where(
                and_(Holding.portfolio_id == portfolio_id, Holding.fund_id == fund_id)
            )
        )
        holding = result.scalar_one_or_none()

        if holding is None:
            holding = Holding(
                portfolio_id=portfolio_id,
                fund_id=fund_id,
                units=units_delta,
                avg_nav=nav,
                current_nav=nav,
                current_value=units_delta * nav,
            )
            db.add(holding)
        else:
            old_units = Decimal(str(holding.units))
            old_avg_nav = Decimal(str(holding.avg_nav))

            if txn_type in ("purchase", "sip", "switch_in"):
                # Weighted average NAV
                new_units = old_units + units_delta
                if new_units > 0:
                    holding.avg_nav = (old_units * old_avg_nav + units_delta * nav) / new_units
                holding.units = new_units
            elif txn_type in ("redemption", "switch_out"):
                holding.units = max(Decimal("0"), old_units - units_delta)

            holding.current_nav = nav
            holding.current_value = holding.units * nav
            db.add(holding)

        await db.commit()
        await db.refresh(holding)
        return holding

    async def update_holding_current_value(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        fund_id: uuid.UUID,
        current_nav: Decimal,
    ) -> Optional[Holding]:
        result = await db.execute(
            select(Holding).where(
                and_(Holding.portfolio_id == portfolio_id, Holding.fund_id == fund_id)
            )
        )
        holding = result.scalar_one_or_none()
        if holding:
            holding.current_nav = current_nav
            holding.current_value = Decimal(str(holding.units)) * current_nav
            db.add(holding)
            await db.commit()
            await db.refresh(holding)
        return holding

    async def get_snapshots(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> list[PortfolioSnapshot]:
        query = select(PortfolioSnapshot).where(PortfolioSnapshot.portfolio_id == portfolio_id)
        if from_date:
            query = query.where(PortfolioSnapshot.snapshot_date >= from_date)
        if to_date:
            query = query.where(PortfolioSnapshot.snapshot_date <= to_date)
        query = query.order_by(PortfolioSnapshot.snapshot_date)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def save_snapshot(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        snapshot_date: date,
        total_value: Decimal,
        total_invested: Decimal,
    ) -> PortfolioSnapshot:
        result = await db.execute(
            select(PortfolioSnapshot).where(
                and_(
                    PortfolioSnapshot.portfolio_id == portfolio_id,
                    PortfolioSnapshot.snapshot_date == snapshot_date,
                )
            )
        )
        snap = result.scalar_one_or_none()
        if snap:
            snap.total_value = total_value
            snap.total_invested = total_invested
        else:
            snap = PortfolioSnapshot(
                portfolio_id=portfolio_id,
                snapshot_date=snapshot_date,
                total_value=total_value,
                total_invested=total_invested,
            )
            db.add(snap)
        await db.commit()
        await db.refresh(snap)
        return snap


portfolio = CRUDPortfolio(Portfolio)
