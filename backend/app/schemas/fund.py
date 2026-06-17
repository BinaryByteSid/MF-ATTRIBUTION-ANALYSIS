from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AssetClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class FundCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_class_id: int
    name: str


class FundCreate(BaseModel):
    isin: str
    amfi_code: Optional[str] = None
    scheme_name: str
    amc: Optional[str] = None
    category_id: Optional[int] = None
    benchmark_id: Optional[uuid.UUID] = None
    expense_ratio: Optional[Decimal] = None
    fund_type: str = "regular"
    launch_date: Optional[date] = None


class FundUpdate(BaseModel):
    scheme_name: Optional[str] = None
    amc: Optional[str] = None
    category_id: Optional[int] = None
    benchmark_id: Optional[uuid.UUID] = None
    expense_ratio: Optional[Decimal] = None
    is_active: Optional[bool] = None


class FundResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    isin: str
    amfi_code: Optional[str]
    scheme_name: str
    amc: Optional[str]
    category_id: Optional[int]
    benchmark_id: Optional[uuid.UUID]
    expense_ratio: Optional[Decimal]
    fund_type: str
    launch_date: Optional[date]
    is_active: bool


class FundDetail(FundResponse):
    category: Optional[FundCategoryResponse] = None
    benchmark_name: Optional[str] = None


class NavHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fund_id: uuid.UUID
    nav_date: date
    nav: Decimal
