from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    currency: str = "INR"
    benchmark_id: Optional[uuid.UUID] = None


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    benchmark_id: Optional[uuid.UUID] = None


class PortfolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    currency: str
    benchmark_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class HoldingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    portfolio_id: uuid.UUID
    fund_id: uuid.UUID
    units: Decimal
    avg_nav: Decimal
    current_nav: Optional[Decimal]
    current_value: Optional[Decimal]
    weight: Optional[Decimal]
    updated_at: datetime


class PortfolioSummary(BaseModel):
    portfolio_id: uuid.UUID
    name: str
    total_value: Decimal
    total_invested: Decimal
    absolute_return: Decimal
    xirr: Optional[float]
    cagr: Optional[float]
    as_of_date: date


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    portfolio_id: uuid.UUID
    snapshot_date: date
    total_value: Decimal
    total_invested: Decimal
    daily_pnl: Optional[Decimal]
