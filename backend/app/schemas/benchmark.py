from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BenchmarkCreate(BaseModel):
    name: str
    ticker: Optional[str] = None
    description: Optional[str] = None


class BenchmarkUpdate(BaseModel):
    name: Optional[str] = None
    ticker: Optional[str] = None
    description: Optional[str] = None


class BenchmarkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    ticker: Optional[str]
    description: Optional[str]


class BenchmarkReturnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    benchmark_id: uuid.UUID
    return_date: date
    daily_return: float
