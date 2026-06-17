from __future__ import annotations

import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

database_url = settings.DATABASE_URL
sync_database_url = settings.SYNC_DATABASE_URL

# Check if PostgreSQL connection fails, and fall back to SQLite
if "postgresql" in database_url:
    try:
        # Quick test with a short timeout to see if PG is available
        test_engine = create_engine(
            sync_database_url,
            connect_args={"connect_timeout": 2}
        )
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        test_engine.dispose()
    except Exception as e:
        logger.warning(f"PostgreSQL connection failed ({e}). Falling back to SQLite database.")
        database_url = "sqlite+aiosqlite:///./db.sqlite3"
        sync_database_url = "sqlite:///./db.sqlite3"

is_sqlite = database_url.startswith("sqlite")

# ── Async engine (FastAPI/asyncio) ────────────────────────────────────────────
if is_sqlite:
    engine = create_async_engine(
        database_url,
        echo=settings.ENVIRONMENT == "development",
    )
else:
    engine = create_async_engine(
        database_url,
        echo=settings.ENVIRONMENT == "development",
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ── Sync engine (Alembic / Celery workers) ────────────────────────────────────
if is_sqlite:
    sync_engine = create_engine(
        sync_database_url,
    )
else:
    sync_engine = create_engine(
        sync_database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

