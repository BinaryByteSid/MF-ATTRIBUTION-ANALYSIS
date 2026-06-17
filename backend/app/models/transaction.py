from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index,
    Numeric, String, func, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.portfolio import Portfolio
    from app.models.fund import Fund


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("idx_txn_portfolio", "portfolio_id"),
        Index("idx_txn_fund_date", "fund_id", "txn_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False
    )
    fund_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funds.id"), nullable=False
    )
    txn_type: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "txn_type IN ('purchase', 'redemption', 'sip', 'switch_in', 'switch_out', 'dividend')",
            name="ck_txn_type",
        ),
        nullable=False,
    )
    txn_date: Mapped[object] = mapped_column(Date, nullable=False, index=True)
    units: Mapped[object] = mapped_column(Numeric(14, 4), nullable=False)
    nav_at_txn: Mapped[object] = mapped_column(Numeric(14, 4), nullable=False)
    amount: Mapped[object] = mapped_column(Numeric(16, 2), nullable=False)
    folio_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stamp_duty: Mapped[object] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    exit_load: Mapped[object] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    stcg_tax: Mapped[object] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    ltcg_tax: Mapped[object] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="transactions")
    fund: Mapped["Fund"] = relationship("Fund", back_populates="transactions")
