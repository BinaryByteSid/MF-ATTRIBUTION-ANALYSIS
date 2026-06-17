from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.fund import fund as crud_fund
from app.dependencies import get_current_active_user, get_db, require_role
from app.models.user import User
from app.schemas.fund import (
    AssetClassResponse,
    FundCategoryResponse,
    FundCreate,
    FundDetail,
    FundResponse,
    FundUpdate,
    NavHistoryResponse,
)

router = APIRouter()
admin_only = require_role("admin")


# NOTE: Static paths must be declared BEFORE /{fund_id} to avoid shadowing
@router.get("/categories", response_model=List[FundCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    return await crud_fund.get_all_categories(db)


@router.get("/asset-classes", response_model=List[AssetClassResponse])
async def list_asset_classes(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    return await crud_fund.get_asset_classes(db)


@router.post("/nav/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_nav_sync(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    """Trigger async AMFI NAV sync via Celery."""
    try:
        from app.tasks.nav_ingestion import sync_amfi_nav
        task = sync_amfi_nav.delay()
        return {"job_id": task.id, "status": "queued", "message": "AMFI NAV sync started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue task: {str(e)}")


@router.get("/", response_model=List[FundResponse])
async def search_funds(
    q: Optional[str] = Query(None, description="Search by name, ISIN, or AMC"),
    category_id: Optional[int] = Query(None),
    fund_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    return await crud_fund.search(db, query=q, category_id=category_id, fund_type=fund_type, skip=skip, limit=limit)


@router.post("/", response_model=FundResponse, status_code=status.HTTP_201_CREATED)
async def create_fund(
    body: FundCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    existing = await crud_fund.get_by_isin(db, body.isin)
    if existing:
        raise HTTPException(status_code=409, detail=f"Fund with ISIN {body.isin} already exists")
    return await crud_fund.create(db, obj_in=body)


@router.get("/{fund_id}", response_model=FundDetail)
async def get_fund(
    fund_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    f = await crud_fund.get(db, fund_id)
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    detail = FundDetail.model_validate(f)
    if f.category:
        detail.category = FundCategoryResponse.model_validate(f.category)
    if f.benchmark:
        detail.benchmark_name = f.benchmark.name
    return detail


@router.patch("/{fund_id}", response_model=FundResponse)
async def update_fund(
    fund_id: uuid.UUID,
    body: FundUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    f = await crud_fund.get(db, fund_id)
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    return await crud_fund.update(db, db_obj=f, obj_in=body)


@router.get("/{fund_id}/nav", response_model=List[NavHistoryResponse])
async def get_fund_nav(
    fund_id: uuid.UUID,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    f = await crud_fund.get(db, fund_id)
    if not f:
        raise HTTPException(status_code=404, detail="Fund not found")
    return await crud_fund.get_nav_history(db, fund_id, from_date=from_date, to_date=to_date)
