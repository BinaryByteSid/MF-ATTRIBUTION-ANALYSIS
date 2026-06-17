from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base."""
    pass


class TimestampMixin:
    """Adds created_at / updated_at to any model."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# Import all models here so Alembic autogenerate detects them
from app.models.user import User, RefreshToken, AuditLog  # noqa: F401, E402
from app.models.fund import AssetClass, FundCategory, Fund  # noqa: F401, E402
from app.models.benchmark import Benchmark, BenchmarkReturn  # noqa: F401, E402
from app.models.portfolio import Portfolio, Holding, PortfolioSnapshot  # noqa: F401, E402
from app.models.transaction import Transaction  # noqa: F401, E402
from app.models.nav_history import NavHistory  # noqa: F401, E402
from app.models.attribution_result import AttributionResult  # noqa: F401, E402
