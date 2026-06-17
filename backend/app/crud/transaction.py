from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionUpdate


class CRUDTransaction(CRUDBase[Transaction, TransactionCreate, TransactionUpdate]):

    async def create(self, db: AsyncSession, *, obj_in: TransactionCreate) -> Transaction:
        db_obj = Transaction(**obj_in.model_dump())
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_portfolio_transactions(
        self,
        db: AsyncSession,
        portfolio_id: uuid.UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        fund_id: Optional[uuid.UUID] = None,
        txn_type: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> list[Transaction]:
        stmt = select(Transaction).where(Transaction.portfolio_id == portfolio_id)
        if fund_id:
            stmt = stmt.where(Transaction.fund_id == fund_id)
        if txn_type:
            stmt = stmt.where(Transaction.txn_type == txn_type)
        if from_date:
            stmt = stmt.where(Transaction.txn_date >= from_date)
        if to_date:
            stmt = stmt.where(Transaction.txn_date <= to_date)
        stmt = stmt.order_by(Transaction.txn_date.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def bulk_create(
        self, db: AsyncSession, transactions: list[TransactionCreate]
    ) -> list[Transaction]:
        db_objs = [Transaction(**t.model_dump()) for t in transactions]
        db.add_all(db_objs)
        await db.commit()
        for obj in db_objs:
            await db.refresh(obj)
        return db_objs

    async def get_cashflows(self, db: AsyncSession, portfolio_id: uuid.UUID) -> list[dict]:
        """
        Returns cashflows formatted for XIRR:
        - Purchases/SIP: negative amount (outflows)
        - Redemptions: positive amount (inflows)
        - Current portfolio value added by caller as positive
        """
        result = await db.execute(
            select(Transaction)
            .where(Transaction.portfolio_id == portfolio_id)
            .order_by(Transaction.txn_date)
        )
        txns = result.scalars().all()
        cashflows = []
        for t in txns:
            amount = float(t.amount)
            if t.txn_type in ("purchase", "sip", "switch_in"):
                cashflows.append({"date": t.txn_date, "amount": -amount})
            elif t.txn_type in ("redemption", "switch_out", "dividend"):
                cashflows.append({"date": t.txn_date, "amount": +amount})
        return cashflows

    async def count_by_portfolio(self, db: AsyncSession, portfolio_id: uuid.UUID) -> int:
        from sqlalchemy import func
        result = await db.execute(
            select(func.count()).select_from(Transaction).where(
                Transaction.portfolio_id == portfolio_id
            )
        )
        return result.scalar_one()


transaction = CRUDTransaction(Transaction)
