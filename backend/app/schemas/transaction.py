from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class TransactionCreate(BaseModel):
    portfolio_id: uuid.UUID
    fund_id: uuid.UUID
    txn_type: Literal["purchase", "redemption", "sip", "switch_in", "switch_out", "dividend"]
    txn_date: date
    units: Decimal
    nav_at_txn: Decimal
    amount: Decimal
    folio_number: Optional[str] = None
    stamp_duty: Decimal = Decimal("0")
    exit_load: Decimal = Decimal("0")
    stcg_tax: Decimal = Decimal("0")
    ltcg_tax: Decimal = Decimal("0")

    @field_validator("units", "nav_at_txn")
    @classmethod
    def must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Must be positive")
        return v


class TransactionUpdate(BaseModel):
    txn_type: Optional[Literal["purchase", "redemption", "sip", "switch_in", "switch_out", "dividend"]] = None
    txn_date: Optional[date] = None
    units: Optional[Decimal] = None
    nav_at_txn: Optional[Decimal] = None
    amount: Optional[Decimal] = None
    folio_number: Optional[str] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    portfolio_id: uuid.UUID
    fund_id: uuid.UUID
    txn_type: str
    txn_date: date
    units: Decimal
    nav_at_txn: Decimal
    amount: Decimal
    folio_number: Optional[str]
    stamp_duty: Decimal
    exit_load: Decimal
    stcg_tax: Decimal
    ltcg_tax: Decimal
    created_at: datetime


class BulkTransactionCreate(BaseModel):
    transactions: List[TransactionCreate]

    @field_validator("transactions")
    @classmethod
    def check_max_size(cls, v: list) -> list:
        if len(v) > 500:
            raise ValueError("Maximum 500 transactions per bulk import")
        return v


class TransactionImportRow(BaseModel):
    fund_isin: str
    txn_type: str
    txn_date: str
    units: str
    nav_at_txn: str
    amount: str
    folio_number: Optional[str] = None
