from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.portfolio import portfolio as crud_portfolio
from app.crud.transaction import transaction as crud_transaction
from app.dependencies import get_current_active_user, get_db
from app.models.user import User
from app.schemas.portfolio import (
    HoldingResponse,
    PortfolioCreate,
    PortfolioResponse,
    PortfolioSummary,
    PortfolioUpdate,
    SnapshotResponse,
)

router = APIRouter()


def _check_ownership(portfolio, current_user: User):
    if portfolio.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorised to access this portfolio")


@router.get("/", response_model=List[PortfolioResponse])
async def list_portfolios(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await crud_portfolio.get_user_portfolios(db, current_user.id, skip=skip, limit=limit)


@router.post("/", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    body: PortfolioCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await crud_portfolio.create(db, obj_in=body, user_id=current_user.id)


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
async def get_portfolio(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    return p


@router.patch("/{portfolio_id}", response_model=PortfolioResponse)
async def update_portfolio(
    portfolio_id: uuid.UUID,
    body: PortfolioUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    return await crud_portfolio.update(db, db_obj=p, obj_in=body)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    await crud_portfolio.delete(db, id=portfolio_id)


@router.get("/{portfolio_id}/summary", response_model=PortfolioSummary)
async def get_portfolio_summary(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute portfolio KPIs: XIRR, current value, P&L."""
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)

    summary = await crud_portfolio.get_summary(db, portfolio_id)
    total_value = summary["total_value"]
    total_invested = summary["total_invested"]

    # XIRR calculation
    xirr_val = None
    cagr_val = None
    try:
        from app.analytics.metrics import compute_xirr, compute_cagr
        cashflows = await crud_transaction.get_cashflows(db, portfolio_id)
        if cashflows and total_value > 0:
            cashflows.append({"date": date.today(), "amount": float(total_value)})
            xirr_val = compute_xirr(cashflows)

        if total_invested > 0 and total_value > 0:

            from app.utils.date_utils import years_between
            from sqlalchemy import select, func
            from app.models.transaction import Transaction
            result = await db.execute(
                select(Transaction.txn_date)
                .where(Transaction.portfolio_id == portfolio_id)
                .order_by(Transaction.txn_date)
                .limit(1)
            )
            first_row = result.scalar_one_or_none()
            if first_row:
                years = years_between(first_row, date.today())
                if years > 0:
                    cagr_val = compute_cagr(float(total_invested), float(total_value), years)
    except Exception:
        pass

    absolute_return = Decimal("0")
    if total_invested > 0:
        absolute_return = (total_value - total_invested) / total_invested * 100

    return PortfolioSummary(
        portfolio_id=portfolio_id,
        name=p.name,
        total_value=total_value,
        total_invested=total_invested,
        absolute_return=absolute_return,
        xirr=xirr_val,
        cagr=cagr_val,
        as_of_date=date.today(),
    )


@router.get("/{portfolio_id}/holdings", response_model=List[HoldingResponse])
async def get_holdings(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    portfolio_with_holdings = await crud_portfolio.get_with_holdings(db, portfolio_id)
    return portfolio_with_holdings.holdings if portfolio_with_holdings else []


@router.get("/{portfolio_id}/snapshots", response_model=List[SnapshotResponse])
async def get_snapshots(
    portfolio_id: uuid.UUID,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    _check_ownership(p, current_user)
    return await crud_portfolio.get_snapshots(db, portfolio_id, from_date=from_date, to_date=to_date)
