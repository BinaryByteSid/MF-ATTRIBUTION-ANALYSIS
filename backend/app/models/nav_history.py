from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger, Integer, Date, ForeignKey, Index, Numeric, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.fund import Fund


class NavHistory(Base):
    __tablename__ = "nav_history"
    __table_args__ = (
        UniqueConstraint("fund_id", "nav_date", name="uq_nav_fund_date"),
        Index("idx_nav_fund_date", "fund_id", "nav_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    fund_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funds.id", ondelete="CASCADE"), nullable=False
    )
    nav_date: Mapped[object] = mapped_column(Date, nullable=False)
    nav: Mapped[object] = mapped_column(Numeric(14, 4), nullable=False)

    fund: Mapped["Fund"] = relationship("Fund", back_populates="nav_history")
