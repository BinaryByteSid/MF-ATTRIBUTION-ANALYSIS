from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index,
    JSON, Numeric, String, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.portfolio import Portfolio
    from app.models.benchmark import Benchmark


class AttributionResult(Base):
    __tablename__ = "attribution_results"
    __table_args__ = (
        UniqueConstraint(
            "portfolio_id", "period_start", "period_end", "method",
            name="uq_attribution_portfolio_period_method",
        ),
        Index("idx_attr_portfolio", "portfolio_id", "period_end"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False
    )
    benchmark_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("benchmarks.id"), nullable=True
    )
    period_start: Mapped[object] = mapped_column(Date, nullable=False)
    period_end: Mapped[object] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "method IN ('brinson', 'factor', 'carino', 'geometric')",
            name="ck_attribution_method",
        ),
        nullable=False,
    )
    total_return: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    benchmark_return: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    active_return: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    allocation_effect: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    selection_effect: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    interaction_effect: Mapped[object | None] = mapped_column(Numeric(10, 6), nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    computed_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="attribution_results")
    benchmark: Mapped["Benchmark | None"] = relationship("Benchmark", back_populates="attribution_results")
