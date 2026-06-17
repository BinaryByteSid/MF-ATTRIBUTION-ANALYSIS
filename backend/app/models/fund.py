from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.fund import FundCategory, Fund
    from app.models.benchmark import Benchmark


class AssetClass(Base):
    __tablename__ = "asset_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    categories: Mapped[list["FundCategory"]] = relationship("FundCategory", back_populates="asset_class")


class FundCategory(Base):
    __tablename__ = "fund_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_class_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("asset_classes.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    asset_class: Mapped["AssetClass"] = relationship("AssetClass", back_populates="categories")
    funds: Mapped[list["Fund"]] = relationship("Fund", back_populates="category")


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    isin: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    amfi_code: Mapped[str | None] = mapped_column(String(10), unique=True, nullable=True)
    scheme_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    amc: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("fund_categories.id"), nullable=True
    )
    benchmark_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("benchmarks.id"), nullable=True
    )
    expense_ratio: Mapped[object | None] = mapped_column(Numeric(5, 4), nullable=True)
    fund_type: Mapped[str] = mapped_column(
        String(10),
        CheckConstraint("fund_type IN ('regular', 'direct')", name="ck_fund_type"),
        nullable=False,
        default="regular",
        server_default="regular",
    )
    launch_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    category: Mapped["FundCategory | None"] = relationship("FundCategory", back_populates="funds")
    benchmark: Mapped["Benchmark | None"] = relationship("Benchmark", back_populates="funds", foreign_keys=[benchmark_id])
    nav_history: Mapped[list["NavHistory"]] = relationship("NavHistory", back_populates="fund", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="fund")
    holdings: Mapped[list["Holding"]] = relationship("Holding", back_populates="fund")


# Avoid circular import
from app.models.nav_history import NavHistory  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.portfolio import Holding  # noqa: E402
