from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger, Integer, Date, DateTime, ForeignKey, Index,
    Numeric, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.fund import Fund
    from app.models.portfolio import Portfolio


class Benchmark(Base):
    __tablename__ = "benchmarks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    ticker: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    benchmark_returns: Mapped[list["BenchmarkReturn"]] = relationship(
        "BenchmarkReturn", back_populates="benchmark", cascade="all, delete-orphan"
    )
    portfolios: Mapped[list["Portfolio"]] = relationship(
        "Portfolio", back_populates="benchmark", foreign_keys="Portfolio.benchmark_id"
    )
    funds: Mapped[list["Fund"]] = relationship(
        "Fund", back_populates="benchmark", foreign_keys="Fund.benchmark_id"
    )
    attribution_results: Mapped[list["AttributionResult"]] = relationship(
        "AttributionResult", back_populates="benchmark"
    )


class BenchmarkReturn(Base):
    __tablename__ = "benchmark_returns"
    __table_args__ = (
        UniqueConstraint("benchmark_id", "return_date", name="uq_benchmark_return_date"),
        Index("idx_benchmark_date", "benchmark_id", "return_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    benchmark_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("benchmarks.id", ondelete="CASCADE"), nullable=False
    )
    return_date: Mapped[object] = mapped_column(Date, nullable=False)
    daily_return: Mapped[object] = mapped_column(Numeric(10, 6), nullable=False)

    benchmark: Mapped["Benchmark"] = relationship("Benchmark", back_populates="benchmark_returns")


# Avoid circular import
from app.models.attribution_result import AttributionResult  # noqa: E402
