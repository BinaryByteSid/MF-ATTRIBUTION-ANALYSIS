from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel


class ReportRequest(BaseModel):
    portfolio_id: uuid.UUID
    report_type: Literal["attribution", "portfolio_summary", "tax_summary", "holdings"]
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    format: Literal["pdf", "csv", "excel"] = "pdf"


class ReportJobResponse(BaseModel):
    job_id: str
    status: str
    portfolio_id: uuid.UUID
    created_at: datetime


class ReportStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "failed"]
    progress: int = 0
    download_url: Optional[str] = None
    error: Optional[str] = None
