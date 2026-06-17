from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import text
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


def _ensure_reports_dir() -> Path:
    d = Path(settings.REPORTS_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


@celery_app.task(
    bind=True,
    name="app.tasks.report_generation.generate_report",
    max_retries=2,
    default_retry_delay=30,
)
def generate_report(
    self,
    portfolio_id: str,
    report_type: str,
    period_start: str | None,
    period_end: str | None,
    format: str = "pdf",
    user_id: str | None = None,
) -> dict:
    """
    Generates a report file and returns the file path.
    Supported types: attribution, portfolio_summary, tax_summary, holdings
    Supported formats: pdf, csv, excel
    """
    logger.info(f"Generating {report_type} report ({format}) for portfolio {portfolio_id}")
    reports_dir = _ensure_reports_dir()
    job_id = self.request.id or str(uuid.uuid4())

    ext_map = {"pdf": "pdf", "csv": "csv", "excel": "xlsx"}
    ext = ext_map.get(format, "pdf")
    output_path = str(reports_dir / f"{job_id}.{ext}")

    db = _get_sync_session()
    try:
        # Fetch portfolio info
        row = db.execute(
            text("SELECT name FROM portfolios WHERE id = :id"),
            {"id": portfolio_id},
        ).fetchone()
        portfolio_name = row[0] if row else "Unknown Portfolio"

        p_start = date.fromisoformat(period_start) if period_start else None
        p_end = date.fromisoformat(period_end) if period_end else date.today()

        if report_type == "portfolio_summary":
            _generate_portfolio_summary(db, portfolio_id, portfolio_name, format, output_path)
        elif report_type == "holdings":
            _generate_holdings_report(db, portfolio_id, portfolio_name, format, output_path)
        elif report_type == "attribution":
            _generate_attribution_report(db, portfolio_id, portfolio_name, format, output_path)
        elif report_type == "tax_summary":
            _generate_tax_report(db, portfolio_id, portfolio_name, format, output_path)
        else:
            return {"error": f"Unknown report type: {report_type}"}

        logger.info(f"Report generated: {output_path}")
        return {"file_path": output_path, "format": format}

    except Exception as exc:
        logger.error(f"Report generation failed: {exc}")
        return {"error": str(exc)}
    finally:
        db.close()


def _generate_portfolio_summary(db: Session, portfolio_id: str, name: str, fmt: str, output_path: str):
    """Generate portfolio summary in the specified format."""
    # Fetch holdings
    rows = db.execute(
        text("""
            SELECT f.scheme_name, h.units, h.avg_nav, h.current_nav,
                   h.current_value, h.weight
            FROM holdings h
            JOIN funds f ON f.id = h.fund_id
            WHERE h.portfolio_id = :pid
            ORDER BY h.current_value DESC NULLS LAST
        """),
        {"pid": portfolio_id},
    ).fetchall()

    holdings = [
        {
            "fund_name": r[0],
            "units": float(r[1] or 0),
            "avg_nav": float(r[2] or 0),
            "current_nav": float(r[3] or 0),
            "current_value": float(r[4] or 0),
            "weight": float(r[5] or 0) * 100,
            "return_pct": ((float(r[3] or 0) / float(r[2] or 1)) - 1) * 100 if r[2] else 0,
        }
        for r in rows
    ]

    total_value = sum(h["current_value"] for h in holdings)
    total_invested = sum(h["units"] * h["avg_nav"] for h in holdings)
    summary = {
        "total_value": total_value,
        "total_invested": total_invested,
        "absolute_return": ((total_value / total_invested) - 1) * 100 if total_invested else 0,
        "xirr": None,
        "cagr": None,
    }

    if fmt == "pdf":
        from app.utils.pdf_export import generate_portfolio_summary_pdf
        generate_portfolio_summary_pdf(name, summary, holdings, date.today(), output_path)
    elif fmt == "csv":
        from app.utils.csv_export import holdings_to_csv
        data = holdings_to_csv(holdings)
        with open(output_path, "wb") as f:
            f.write(data)
    elif fmt == "excel":
        import pandas as pd
        df = pd.DataFrame(holdings)
        df.to_excel(output_path, index=False, sheet_name="Portfolio Summary")


def _generate_holdings_report(db: Session, portfolio_id: str, name: str, fmt: str, output_path: str):
    rows = db.execute(
        text("""
            SELECT f.scheme_name, f.isin, h.units, h.avg_nav, h.current_nav,
                   h.current_value, h.weight
            FROM holdings h
            JOIN funds f ON f.id = h.fund_id
            WHERE h.portfolio_id = :pid
        """),
        {"pid": portfolio_id},
    ).fetchall()

    holdings = [
        {
            "fund_name": r[0], "isin": r[1], "units": float(r[2] or 0),
            "avg_nav": float(r[3] or 0), "current_nav": float(r[4] or 0),
            "current_value": float(r[5] or 0), "weight_pct": float(r[6] or 0) * 100,
        }
        for r in rows
    ]

    if fmt == "csv":
        from app.utils.csv_export import holdings_to_csv
        with open(output_path, "wb") as f:
            f.write(holdings_to_csv(holdings))
    elif fmt == "excel":
        import pandas as pd
        pd.DataFrame(holdings).to_excel(output_path, index=False)
    else:
        from app.utils.pdf_export import generate_portfolio_summary_pdf
        summary = {"total_value": sum(h["current_value"] for h in holdings), "total_invested": 0, "absolute_return": 0}
        generate_portfolio_summary_pdf(name, summary, holdings, date.today(), output_path)


def _generate_attribution_report(db: Session, portfolio_id: str, name: str, fmt: str, output_path: str):
    row = db.execute(
        text("""
            SELECT result_json, total_return, benchmark_return, active_return,
                   allocation_effect, selection_effect, interaction_effect,
                   period_start, period_end, method
            FROM attribution_results
            WHERE portfolio_id = :pid
            ORDER BY computed_at DESC LIMIT 1
        """),
        {"pid": portfolio_id},
    ).fetchone()

    if not row:
        # Write empty report
        with open(output_path, "w") as f:
            f.write("No attribution data available.")
        return

    attr_data = {
        "result_json": row[0] or {},
        "total_return": float(row[1] or 0),
        "benchmark_return": float(row[2] or 0),
        "active_return": float(row[3] or 0),
        "allocation_effect": float(row[4] or 0),
        "selection_effect": float(row[5] or 0),
        "interaction_effect": float(row[6] or 0),
        "period_start": row[7],
        "period_end": row[8],
        "method": row[9],
    }

    if fmt == "pdf":
        from app.utils.pdf_export import generate_attribution_pdf
        generate_attribution_pdf(name, attr_data, output_path)
    elif fmt == "csv":
        from app.utils.csv_export import attribution_to_csv
        with open(output_path, "wb") as f:
            f.write(attribution_to_csv(attr_data))


def _generate_tax_report(db: Session, portfolio_id: str, name: str, fmt: str, output_path: str):
    rows = db.execute(
        text("""
            SELECT f.scheme_name, t.txn_type, t.txn_date, t.units, t.amount,
                   t.stcg_tax, t.ltcg_tax
            FROM transactions t
            JOIN funds f ON f.id = t.fund_id
            WHERE t.portfolio_id = :pid AND t.txn_type IN ('redemption', 'switch_out')
            ORDER BY t.txn_date
        """),
        {"pid": portfolio_id},
    ).fetchall()

    txns = [
        {
            "fund_name": r[0], "txn_type": r[1], "date": str(r[2]),
            "units": float(r[3] or 0), "amount": float(r[4] or 0),
            "stcg_tax": float(r[5] or 0), "ltcg_tax": float(r[6] or 0),
        }
        for r in rows
    ]
    stcg_total = sum(t["stcg_tax"] for t in txns)
    ltcg_total = sum(t["ltcg_tax"] for t in txns)

    if fmt == "pdf":
        from app.utils.pdf_export import generate_tax_summary_pdf
        generate_tax_summary_pdf(name, txns, stcg_total, ltcg_total, output_path)
    elif fmt == "csv":
        import pandas as pd
        df = pd.DataFrame(txns)
        df.to_csv(output_path, index=False)
