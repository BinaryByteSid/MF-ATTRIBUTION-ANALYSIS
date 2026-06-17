from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class AttributionRequest(BaseModel):
    portfolio_id: uuid.UUID
    benchmark_id: Optional[uuid.UUID] = None
    period_start: date
    period_end: date
    method: Literal["brinson", "factor", "carino", "geometric"] = "brinson"


class BrinsonSegment(BaseModel):
    asset_class: str
    portfolio_weight: float
    benchmark_weight: float
    portfolio_return: float
    benchmark_return: float
    allocation_effect: float
    selection_effect: float
    interaction_effect: float


class AttributionSummary(BaseModel):
    total_return: float
    benchmark_return: float
    active_return: float
    allocation_effect: float
    selection_effect: float
    interaction_effect: float


class AttributionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    portfolio_id: uuid.UUID
    benchmark_id: Optional[uuid.UUID]
    period_start: date
    period_end: date
    method: str
    summary: AttributionSummary
    segments: List[BrinsonSegment] = []
    computed_at: datetime


class RiskMetrics(BaseModel):
    portfolio_id: uuid.UUID
    period_start: date
    period_end: date
    sharpe_ratio: Optional[float]
    sortino_ratio: Optional[float]
    max_drawdown: Optional[float]
    beta: Optional[float]
    alpha: Optional[float]
    information_ratio: Optional[float]
    var_95: Optional[float]
    calmar_ratio: Optional[float]
    up_capture: Optional[float]
    down_capture: Optional[float]
