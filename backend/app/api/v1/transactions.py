from __future__ import annotations

import csv
import io
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.fund import fund as crud_fund
from app.crud.portfolio import portfolio as crud_portfolio
from app.crud.transaction import transaction as crud_transaction
from app.dependencies import get_current_active_user, get_db
from app.models.user import User
from app.schemas.transaction import (
    BulkTransactionCreate,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)

router = APIRouter()


async def _check_portfolio_ownership(portfolio_id: uuid.UUID, current_user: User, db):
    p = await crud_portfolio.get(db, portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if p.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return p


@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    portfolio_id: uuid.UUID = Query(...),
    skip: int = 0,
    limit: int = 100,
    fund_id: Optional[uuid.UUID] = Query(None),
    txn_type: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_portfolio_ownership(portfolio_id, current_user, db)
    return await crud_transaction.get_portfolio_transactions(
        db,
        portfolio_id,
        skip=skip,
        limit=limit,
        fund_id=fund_id,
        txn_type=txn_type,
        from_date=from_date,
        to_date=to_date,
    )


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_portfolio_ownership(body.portfolio_id, current_user, db)

    txn = await crud_transaction.create(db, obj_in=body)
    # Update holdings
    await crud_portfolio.upsert_holding(
        db,
        portfolio_id=body.portfolio_id,
        fund_id=body.fund_id,
        units_delta=body.units,
        nav=body.nav_at_txn,
        txn_type=body.txn_type,
    )
    return txn


@router.post("/bulk", response_model=List[TransactionResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_transactions(
    body: BulkTransactionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.transactions:
        return []
    portfolio_id = body.transactions[0].portfolio_id
    # Verify all belong to same portfolio
    if not all(t.portfolio_id == portfolio_id for t in body.transactions):
        raise HTTPException(status_code=400, detail="All transactions must belong to the same portfolio")

    await _check_portfolio_ownership(portfolio_id, current_user, db)
    txns = await crud_transaction.bulk_create(db, body.transactions)

    # Update holdings for each transaction
    for t in body.transactions:
        await crud_portfolio.upsert_holding(
            db,
            portfolio_id=t.portfolio_id,
            fund_id=t.fund_id,
            units_delta=t.units,
            nav=t.nav_at_txn,
            txn_type=t.txn_type,
        )
    return txns


@router.get("/{txn_id}", response_model=TransactionResponse)
async def get_transaction(
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    txn = await crud_transaction.get(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await _check_portfolio_ownership(txn.portfolio_id, current_user, db)
    return txn


@router.patch("/{txn_id}", response_model=TransactionResponse)
async def update_transaction(
    txn_id: uuid.UUID,
    body: TransactionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    txn = await crud_transaction.get(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await _check_portfolio_ownership(txn.portfolio_id, current_user, db)
    return await crud_transaction.update(db, db_obj=txn, obj_in=body)


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    txn_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    txn = await crud_transaction.get(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await _check_portfolio_ownership(txn.portfolio_id, current_user, db)
    await crud_transaction.delete(db, id=txn_id)


@router.post("/import")
async def import_transactions(
    portfolio_id: uuid.UUID = Query(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Import transactions from a CSV file."""
    await _check_portfolio_ownership(portfolio_id, current_user, db)

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    transactions = []
    errors = []

    for i, row in enumerate(reader, start=2):
        try:
            isin = row.get("fund_isin", "").strip()
            fund = await crud_fund.get_by_isin(db, isin)
            if not fund:
                errors.append({"row": i, "error": f"Fund with ISIN {isin} not found"})
                continue

            txn = TransactionCreate(
                portfolio_id=portfolio_id,
                fund_id=fund.id,
                txn_type=row["txn_type"].strip().lower(),
                txn_date=date.fromisoformat(row["txn_date"].strip()),
                units=Decimal(row["units"].strip()),
                nav_at_txn=Decimal(row["nav_at_txn"].strip()),
                amount=Decimal(row["amount"].strip()),
                folio_number=row.get("folio_number", "").strip() or None,
            )
            transactions.append(txn)
        except (KeyError, ValueError, InvalidOperation) as e:
            errors.append({"row": i, "error": str(e)})

    imported = 0
    if transactions:
        await crud_transaction.bulk_create(db, transactions)
        for t in transactions:
            await crud_portfolio.upsert_holding(
                db, portfolio_id=portfolio_id, fund_id=t.fund_id,
                units_delta=t.units, nav=t.nav_at_txn, txn_type=t.txn_type,
            )
        imported = len(transactions)

    return {"imported": imported, "errors": errors}
