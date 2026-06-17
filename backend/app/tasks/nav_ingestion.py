from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

import requests
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.db.session import sync_engine
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_sync_session() -> Session:
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)
    return SessionLocal()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=4, max=60))
def _download_amfi_nav_file() -> str:
    """Download the AMFI NAV flat file with retry."""
    response = requests.get(settings.AMFI_NAV_URL, timeout=30)
    response.raise_for_status()
    return response.text


def _parse_amfi_nav(raw_text: str) -> list[dict]:
    """
    Parse AMFI's pipe-delimited flat file.
    Format:
        Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;
        Net Asset Value;Repurchase Price;Sale Price;Date
    """
    records = []
    lines = raw_text.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line or ";" not in line:
            continue

        parts = line.split(";")
        if len(parts) < 5:
            continue

        scheme_code = parts[0].strip()

        # Skip header lines and AMC/category lines (no numeric scheme code)
        if not scheme_code.isdigit():
            continue

        isin_growth = parts[1].strip() if len(parts) > 1 else ""
        isin_div_reinvest = parts[2].strip() if len(parts) > 2 else ""
        scheme_name = parts[3].strip() if len(parts) > 3 else ""
        nav_str = parts[4].strip() if len(parts) > 4 else ""
        date_str = parts[-1].strip() if parts else ""

        # Skip invalid NAV values
        if nav_str in ("N.A.", "", "-"):
            continue

        try:
            nav_value = Decimal(nav_str)
        except (InvalidOperation, ValueError):
            continue

        # Parse date (DD-Mon-YYYY format)
        nav_date = None
        try:
            nav_date = datetime.strptime(date_str, "%d-%b-%Y").date()
        except (ValueError, TypeError):
            try:
                nav_date = datetime.strptime(date_str, "%d-%B-%Y").date()
            except (ValueError, TypeError):
                continue

        if nav_date is None:
            continue

        records.append({
            "amfi_code": scheme_code,
            "isin_growth": isin_growth,
            "isin_div_reinvest": isin_div_reinvest,
            "scheme_name": scheme_name,
            "nav": nav_value,
            "nav_date": nav_date,
        })

    return records


@celery_app.task(bind=True, name="app.tasks.nav_ingestion.sync_amfi_nav", max_retries=3, default_retry_delay=60)
def sync_amfi_nav(self) -> dict:
    """
    Downloads NAV data from AMFI India and upserts into nav_history.
    Matches funds by amfi_code or ISIN.
    """
    logger.info("Starting AMFI NAV sync ...")
    stats = {"processed": 0, "updated": 0, "skipped": 0, "errors": 0}

    try:
        raw = _download_amfi_nav_file()
    except Exception as exc:
        logger.error(f"Failed to download AMFI NAV: {exc}")
        self.retry(exc=exc)
        return stats

    records = _parse_amfi_nav(raw)
    stats["processed"] = len(records)
    logger.info(f"Parsed {len(records)} NAV records from AMFI")

    db = _get_sync_session()
    try:
        # Build a lookup: amfi_code -> fund_id, isin -> fund_id
        fund_map_code = {}
        fund_map_isin = {}
        rows = db.execute(text("SELECT id, amfi_code, isin FROM funds WHERE is_active = true"))
        for row in rows:
            fund_id = row[0]
            if row[1]:
                fund_map_code[row[1]] = fund_id
            if row[2]:
                fund_map_isin[row[2]] = fund_id

        # Batch upsert
        nav_batch = []
        for rec in records:
            fund_id = fund_map_code.get(rec["amfi_code"])
            if not fund_id:
                fund_id = fund_map_isin.get(rec["isin_growth"])
            if not fund_id:
                fund_id = fund_map_isin.get(rec["isin_div_reinvest"])

            if not fund_id:
                stats["skipped"] += 1
                continue

            nav_batch.append({
                "fund_id": str(fund_id),
                "nav_date": rec["nav_date"],
                "nav": str(rec["nav"]),
            })

        if nav_batch:
            # Chunk into batches of 5000
            BATCH_SIZE = 5000
            for i in range(0, len(nav_batch), BATCH_SIZE):
                chunk = nav_batch[i:i + BATCH_SIZE]
                db.execute(
                    text("""
                        INSERT INTO nav_history (fund_id, nav_date, nav)
                        VALUES (:fund_id, :nav_date, :nav)
                        ON CONFLICT (fund_id, nav_date)
                        DO UPDATE SET nav = EXCLUDED.nav
                    """),
                    chunk,
                )
            db.commit()
            stats["updated"] = len(nav_batch)

        logger.info(f"NAV sync complete: {stats}")
    except Exception as exc:
        db.rollback()
        logger.error(f"Error during NAV upsert: {exc}")
        stats["errors"] += 1
    finally:
        db.close()

    return stats


@celery_app.task(bind=True, name="app.tasks.nav_ingestion.sync_fund_nav")
def sync_fund_nav(self, fund_id: str) -> dict:
    """Sync NAV for a single fund. Uses the full AMFI file and filters."""
    stats = {"fund_id": fund_id, "updated": 0, "error": None}

    db = _get_sync_session()
    try:
        row = db.execute(
            text("SELECT amfi_code, isin FROM funds WHERE id = :id"),
            {"id": fund_id},
        ).fetchone()

        if not row:
            stats["error"] = "Fund not found"
            return stats

        amfi_code = row[0]
        isin = row[1]

        raw = _download_amfi_nav_file()
        records = _parse_amfi_nav(raw)

        # Filter for this fund
        matching = [
            r for r in records
            if r["amfi_code"] == amfi_code
            or r["isin_growth"] == isin
            or r["isin_div_reinvest"] == isin
        ]

        nav_batch = [
            {"fund_id": fund_id, "nav_date": r["nav_date"], "nav": str(r["nav"])}
            for r in matching
        ]

        if nav_batch:
            db.execute(
                text("""
                    INSERT INTO nav_history (fund_id, nav_date, nav)
                    VALUES (:fund_id, :nav_date, :nav)
                    ON CONFLICT (fund_id, nav_date)
                    DO UPDATE SET nav = EXCLUDED.nav
                """),
                nav_batch,
            )
            db.commit()
            stats["updated"] = len(nav_batch)

    except Exception as exc:
        db.rollback()
        stats["error"] = str(exc)
    finally:
        db.close()

    return stats
