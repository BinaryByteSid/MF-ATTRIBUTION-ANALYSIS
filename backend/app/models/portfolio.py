from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger, Integer, Boolean, Date, DateTime, ForeignKey, Index,
    Numeric, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.benchmark import Benchmark
    from app.models.transaction import Transaction
    from app.models.attribution_result import AttributionResult
    from app.models.fund import Fund


class Portfolio(Base, TimestampMixin):
    __tablename__ = "portfolios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    benchmark_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("benchmarks.id"), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="portfolios")
    benchmark: Mapped["Benchmark | None"] = relationship(
        "Benchmark", back_populates="portfolios", foreign_keys=[benchmark_id]
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="portfolio", cascade="all, delete-orphan"
    )
    holdings: Mapped[list["Holding"]] = relationship(
        "Holding", back_populates="portfolio", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["PortfolioSnapshot"]] = relationship(
        "PortfolioSnapshot", back_populates="portfolio", cascade="all, delete-orphan"
    )
    attribution_results: Mapped[list["AttributionResult"]] = relationship(
        "AttributionResult", back_populates="portfolio", cascade="all, delete-orphan"
    )


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "fund_id", name="uq_holding_portfolio_fund"),
        Index("idx_holding_portfolio", "portfolio_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False
    )
    fund_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funds.id"), nullable=False
    )
    units: Mapped[object] = mapped_column(Numeric(14, 4), nullable=False)
    avg_nav: Mapped[object] = mapped_column(Numeric(14, 4), nullable=False)
    current_nav: Mapped[object | None] = mapped_column(Numeric(14, 4), nullable=True)
    current_value: Mapped[object | None] = mapped_column(Numeric(18, 2), nullable=True)
    weight: Mapped[object | None] = mapped_column(Numeric(6, 4), nullable=True)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="holdings")
    fund: Mapped["Fund"] = relationship("Fund", back_populates="holdings")


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "snapshot_date", name="uq_snapshot_portfolio_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date: Mapped[object] = mapped_column(Date, nullable=False)
    total_value: Mapped[object] = mapped_column(Numeric(18, 2), nullable=False)
    total_invested: Mapped[object] = mapped_column(Numeric(18, 2), nullable=False)
    daily_pnl: Mapped[object | None] = mapped_column(Numeric(16, 2), nullable=True)

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="snapshots")
