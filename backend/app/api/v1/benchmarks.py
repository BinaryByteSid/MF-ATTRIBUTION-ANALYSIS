from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.benchmark import benchmark_crud
from app.dependencies import get_current_active_user, get_db, require_role
from app.models.user import User
from app.schemas.benchmark import BenchmarkCreate, BenchmarkResponse, BenchmarkReturnResponse, BenchmarkUpdate

router = APIRouter()
admin_only = require_role("admin")


@router.get("/", response_model=List[BenchmarkResponse])
async def list_benchmarks(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    return await benchmark_crud.get_all(db)


@router.post("/", response_model=BenchmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_benchmark(
    body: BenchmarkCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    existing = await benchmark_crud.get_by_name(db, body.name)
    if existing:
        raise HTTPException(status_code=409, detail=f"Benchmark '{body.name}' already exists")
    return await benchmark_crud.create(db, obj_in=body)


@router.get("/{benchmark_id}", response_model=BenchmarkResponse)
async def get_benchmark(
    benchmark_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    bm = await benchmark_crud.get(db, benchmark_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return bm


@router.patch("/{benchmark_id}", response_model=BenchmarkResponse)
async def update_benchmark(
    benchmark_id: uuid.UUID,
    body: BenchmarkUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    bm = await benchmark_crud.get(db, benchmark_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return await benchmark_crud.update(db, db_obj=bm, obj_in=body)


@router.get("/{benchmark_id}/returns", response_model=List[BenchmarkReturnResponse])
async def get_benchmark_returns(
    benchmark_id: uuid.UUID,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    bm = await benchmark_crud.get(db, benchmark_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return await benchmark_crud.get_returns(db, benchmark_id, from_date=from_date, to_date=to_date)


@router.post("/{benchmark_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def sync_benchmark(
    benchmark_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    bm = await benchmark_crud.get(db, benchmark_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return {"message": f"Benchmark sync for '{bm.name}' queued", "benchmark_id": str(benchmark_id)}
