from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import sync_engine
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_sync_session() -> Session:
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)
    return SessionLocal()


@celery_app.task(
    bind=True,
    name="app.tasks.attribution_compute.run_attribution",
    max_retries=2,
    default_retry_delay=30,
)
def run_attribution(
    self,
    portfolio_id: str,
    benchmark_id: str | None,
    period_start: str,
    period_end: str,
    method: str = "brinson",
) -> dict:
    """
    Runs the full attribution pipeline using an async bridge.
    Called by Celery (sync) but uses async DB calls internally.
    """
    logger.info(
        f"Running attribution: portfolio={portfolio_id}, method={method}, "
        f"period={period_start}→{period_end}"
    )

    try:
        from app.analytics.attribution import run_full_attribution
        from app.db.session import AsyncSessionLocal

        async def _run():
            async with AsyncSessionLocal() as db:
                result = await run_full_attribution(
                    db=db,
                    portfolio_id=uuid.UUID(portfolio_id),
                    benchmark_id=uuid.UUID(benchmark_id) if benchmark_id else None,
                    period_start=date.fromisoformat(period_start),
                    period_end=date.fromisoformat(period_end),
                    method=method,
                )
                return result

        # Run async code in a new event loop
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(_run())
        finally:
            loop.close()

        logger.info(f"Attribution complete for portfolio {portfolio_id}")
        return _serialise_result(result)

    except Exception as exc:
        logger.error(f"Attribution failed for {portfolio_id}: {exc}")
        self.retry(exc=exc)
        return {"error": str(exc)}


@celery_app.task(
    bind=True,
    name="app.tasks.attribution_compute.refresh_all_holdings",
)
def refresh_all_holdings(self) -> dict:
    """Refresh holdings for all active portfolios by replaying transactions."""
    logger.info("Starting nightly holdings refresh …")
    stats = {"refreshed": 0, "errors": 0}

    db = _get_sync_session()
    try:
        rows = db.execute(text("SELECT id FROM portfolios")).fetchall()
        portfolio_ids = [row[0] for row in rows]
    except Exception as exc:
        logger.error(f"Failed to fetch portfolios: {exc}")
        return {"error": str(exc)}
    finally:
        db.close()

    from app.analytics.attribution import refresh_holdings
    from app.db.session import AsyncSessionLocal

    async def _refresh_all():
        async with AsyncSessionLocal() as async_db:
            for pid in portfolio_ids:
                try:
                    await refresh_holdings(async_db, pid)
                    stats["refreshed"] += 1
                except Exception as exc:
                    logger.error(f"Failed to refresh {pid}: {exc}")
                    stats["errors"] += 1

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_refresh_all())
    finally:
        loop.close()

    logger.info(f"Holdings refresh complete: {stats}")
    return stats


def _serialise_result(result: dict) -> dict:
    """Make the result JSON-serialisable (convert Decimals, dates, etc.)."""
    import json
    from decimal import Decimal
    from datetime import date, datetime

    class Encoder(json.JSONEncoder):
        def default(self, o):
            if isinstance(o, Decimal):
                return float(o)
            if isinstance(o, (date, datetime)):
                return o.isoformat()
            if isinstance(o, uuid.UUID):
                return str(o)
            return super().default(o)

    serialised = json.loads(json.dumps(result, cls=Encoder))
    return serialised
