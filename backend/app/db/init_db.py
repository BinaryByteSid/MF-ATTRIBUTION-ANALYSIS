from __future__ import annotations

import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
settings = get_settings()


async def init_db() -> None:
    """
    Bootstraps the database:
    1. Creates tables (dev only — production uses Alembic).
    2. Seeds asset classes, fund categories, and benchmarks.
    3. Creates the first superuser if it doesn't exist.
    """
    from app.db.base import Base
    from app.db.session import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        await _seed_asset_classes(db)
        await _seed_benchmarks(db)
        await _create_superuser(db)
        await db.commit()

    logger.info("Database initialised successfully.")


# ── Seed helpers ──────────────────────────────────────────────────────────────

async def _seed_asset_classes(db: AsyncSession) -> None:
    from app.models.fund import AssetClass, FundCategory

    asset_class_categories = {
        "equity": [
            "Large Cap", "Mid Cap", "Small Cap", "Large & Mid Cap",
            "Multi Cap", "Flexi Cap", "ELSS", "Sectoral/Thematic",
            "Dividend Yield", "Value/Contra",
        ],
        "debt": [
            "Liquid", "Overnight", "Ultra Short Duration", "Low Duration",
            "Short Duration", "Medium Duration", "Long Duration",
            "Dynamic Bond", "Corporate Bond", "Credit Risk",
            "Banking & PSU", "Gilt", "Floater",
        ],
        "hybrid": [
            "Aggressive Hybrid", "Conservative Hybrid", "Balanced Hybrid",
            "Dynamic Asset Allocation", "Multi Asset Allocation",
            "Equity Savings", "Arbitrage",
        ],
        "commodity": ["Gold ETF/FoF", "Silver ETF/FoF", "Other Commodities"],
        "international": ["International/Global", "FoF Domestic", "FoF Overseas"],
        "solution_oriented": ["Retirement Fund", "Children's Fund"],
    }

    for ac_name, categories in asset_class_categories.items():
        result = await db.execute(
            select(AssetClass).where(AssetClass.name == ac_name)
        )
        ac = result.scalar_one_or_none()
        if not ac:
            ac = AssetClass(name=ac_name)
            db.add(ac)
            await db.flush()
            logger.info(f"Seeded asset class: {ac_name}")

        for cat_name in categories:
            result = await db.execute(
                select(FundCategory).where(FundCategory.name == cat_name)
            )
            if not result.scalar_one_or_none():
                db.add(FundCategory(asset_class_id=ac.id, name=cat_name))


async def _seed_benchmarks(db: AsyncSession) -> None:
    from app.models.benchmark import Benchmark

    benchmarks = [
        {
            "name": "NIFTY 50 TRI",
            "ticker": "NIFTY50TRI",
            "description": "NIFTY 50 Total Return Index — large-cap equity benchmark",
        },
        {
            "name": "NIFTY NEXT 50 TRI",
            "ticker": "NIFTYNXT50TRI",
            "description": "NIFTY Next 50 Total Return Index — large-mid cap benchmark",
        },
        {
            "name": "NIFTY MIDCAP 150 TRI",
            "ticker": "NIFTYMID150TRI",
            "description": "NIFTY Midcap 150 Total Return Index",
        },
        {
            "name": "NIFTY SMALLCAP 250 TRI",
            "ticker": "NIFTYSC250TRI",
            "description": "NIFTY Smallcap 250 Total Return Index",
        },
        {
            "name": "CRISIL Short Term Bond Fund Index",
            "ticker": "CRISILSTBFI",
            "description": "CRISIL debt benchmark for short duration funds",
        },
        {
            "name": "CRISIL Hybrid 35+65 Aggressive Index",
            "ticker": "CRISILHYBRID3565",
            "description": "CRISIL benchmark for aggressive hybrid funds (65% equity + 35% debt)",
        },
        {
            "name": "NIFTY 500 TRI",
            "ticker": "NIFTY500TRI",
            "description": "Broad market Indian equity benchmark",
        },
    ]

    for bm in benchmarks:
        result = await db.execute(
            select(Benchmark).where(Benchmark.name == bm["name"])
        )
        if not result.scalar_one_or_none():
            db.add(Benchmark(**bm))
            logger.info(f"Seeded benchmark: {bm['name']}")


async def _create_superuser(db: AsyncSession) -> None:
    from app.models.user import User
    from app.core.security import get_password_hash

    result = await db.execute(
        select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL)
    )
    if not result.scalar_one_or_none():
        superuser = User(
            email=settings.FIRST_SUPERUSER_EMAIL,
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            full_name="System Administrator",
            role="admin",
            is_active=True,
        )
        db.add(superuser)
        logger.info(f"Superuser created: {settings.FIRST_SUPERUSER_EMAIL}")
