"""
Unified attribution module.
Combines Brinson-Hood-Beebower attribution + orchestration pipeline.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.metrics import compute_all_risk_metrics

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# BRINSON ATTRIBUTION
# ══════════════════════════════════════════════════════════════════════════════

def brinson_bhb(
    pw: dict[str, float],     # portfolio weights by asset class
    bw: dict[str, float],     # benchmark weights
    pr: dict[str, float],     # portfolio returns
    br: dict[str, float],     # benchmark returns
    geometric: bool = False,
) -> dict:
    """
    Single-period Brinson-Hood-Beebower attribution.
    If geometric=True, uses compounding-consistent (Bacon) approach.
    """
    keys = sorted(set(pw) | set(bw) | set(pr) | set(br))
    wp = pd.Series({k: pw.get(k, 0) for k in keys})
    wb = pd.Series({k: bw.get(k, 0) for k in keys})
    rp = pd.Series({k: pr.get(k, 0) for k in keys})
    rb = pd.Series({k: br.get(k, 0) for k in keys})

    R_p = float((wp * rp).sum())
    R_b = float((wb * rb).sum())

    if geometric:
        R_semi = float((wb * rp).sum())
        alloc_total = (1 + R_semi) / (1 + R_b) - 1
        sel_total = (1 + R_p) / (1 + R_semi) - 1
        segments = [
            _seg(k, wp[k], wb[k], rp[k], rb[k],
                 (wp[k] - wb[k]) * (rb[k] - R_b) / (1 + R_b),
                 wb[k] * (rp[k] - rb[k]) / (1 + R_b), 0.0)
            for k in keys
        ]
        active = (1 + R_p) / (1 + R_b) - 1
        return _result(R_p, R_b, active, alloc_total, sel_total, 0.0, segments)

    # Arithmetic BHB
    alloc = (wp - wb) * (rb - R_b)
    sel = wb * (rp - rb)
    inter = (wp - wb) * (rp - rb)
    segments = [
        _seg(k, wp[k], wb[k], rp[k], rb[k], alloc[k], sel[k], inter[k])
        for k in keys
    ]
    return _result(R_p, R_b, float((alloc + sel + inter).sum()),
                   float(alloc.sum()), float(sel.sum()), float(inter.sum()), segments)


def _seg(ac, pw, bw, pr, br, a, s, i):
    return {"asset_class": ac, "portfolio_weight": float(pw), "benchmark_weight": float(bw),
            "portfolio_return": float(pr), "benchmark_return": float(br),
            "allocation_effect": float(a), "selection_effect": float(s), "interaction_effect": float(i)}


def _result(rp, rb, active, alloc, sel, inter, segs):
    return {
        "summary": {"total_return": rp, "benchmark_return": rb, "active_return": active,
                     "allocation_effect": alloc, "selection_effect": sel, "interaction_effect": inter},
        "segments": segs,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE (ORCHESTRATION)
# ══════════════════════════════════════════════════════════════════════════════

async def run_full_attribution(
    db: AsyncSession,
    portfolio_id: uuid.UUID,
    benchmark_id: Optional[uuid.UUID],
    period_start: date,
    period_end: date,
    method: str = "brinson",
) -> dict:
    """
    Full pipeline: load holdings → compute weights/returns → Brinson → risk → persist.
    """
    from app.crud.attribution import attribution as crud_attr
    from app.crud.benchmark import benchmark_crud
    from app.models.portfolio import Holding
    from app.models.fund import Fund, FundCategory, AssetClass
    from app.models.nav_history import NavHistory

    # ── 1. Load holdings & compute per-asset-class weights/returns ────────
    holdings = (await db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id))).scalars().all()
    if not holdings:
        return {"error": "No holdings"}

    total_val = sum(float(h.current_value or 0) for h in holdings)
    if total_val == 0:
        return {"error": "Portfolio has zero value"}

    pw, pr = {}, {}  # portfolio weights & returns keyed by asset class

    for h in holdings:
        fund = (await db.execute(select(Fund).where(Fund.id == h.fund_id))).scalar_one_or_none()
        if not fund:
            continue

        # Resolve asset class name
        ac_name = "other"
        if fund.category_id:
            cat = (await db.execute(select(FundCategory).where(FundCategory.id == fund.category_id))).scalar_one_or_none()
            if cat:
                ac = (await db.execute(select(AssetClass).where(AssetClass.id == cat.asset_class_id))).scalar_one_or_none()
                if ac:
                    ac_name = ac.name

        weight = float(h.current_value or 0) / total_val

        # Fund-level return over period
        nav_s = (await db.execute(
            select(NavHistory).where(NavHistory.fund_id == h.fund_id, NavHistory.nav_date >= period_start)
            .order_by(NavHistory.nav_date).limit(1)
        )).scalar_one_or_none()
        nav_e = (await db.execute(
            select(NavHistory).where(NavHistory.fund_id == h.fund_id, NavHistory.nav_date <= period_end)
            .order_by(NavHistory.nav_date.desc()).limit(1)
        )).scalar_one_or_none()
        fund_ret = (float(nav_e.nav) / float(nav_s.nav) - 1) if nav_s and nav_e and float(nav_s.nav) > 0 else 0.0

        # Accumulate weighted returns per asset class
        old_w = pw.get(ac_name, 0)
        old_r = pr.get(ac_name, 0)
        pw[ac_name] = old_w + weight
        pr[ac_name] = (old_r * old_w + fund_ret * weight) / pw[ac_name] if pw[ac_name] else 0

    # ── 2. Benchmark weights & returns ────────────────────────────────────
    bw, br_dict = {}, {}
    if benchmark_id:
        bm_rows = await benchmark_crud.get_returns(db, benchmark_id, period_start, period_end)
        if bm_rows:
            bm_ret = float((1 + pd.Series({r.return_date: float(r.daily_return) for r in bm_rows})).prod() - 1)
            bw = {k: v for k, v in pw.items()}          # mirror portfolio structure
            br_dict = {k: bm_ret for k in pw}
    if not bw:
        bw, br_dict = {k: v for k, v in pw.items()}, {k: 0.0 for k in pw}

    # ── 3. Attribution ────────────────────────────────────────────────────
    attr = brinson_bhb(pw, bw, pr, br_dict, geometric=(method == "geometric"))

    # ── 4. Risk metrics (from daily returns) ──────────────────────────────
    port_daily = await compute_portfolio_daily_returns(db, portfolio_id, period_start, period_end)
    bench_daily = pd.Series(dtype=float)
    if benchmark_id:
        bm_rows = await benchmark_crud.get_returns(db, benchmark_id, period_start, period_end)
        bench_daily = pd.Series({r.return_date: float(r.daily_return) for r in bm_rows}) if bm_rows else bench_daily
    nav = (1 + port_daily).cumprod() if not port_daily.empty else pd.Series(dtype=float)
    attr["risk_metrics"] = compute_all_risk_metrics(port_daily, bench_daily, nav)

    # ── 5. Persist ────────────────────────────────────────────────────────
    await crud_attr.upsert_result(
        db, portfolio_id=portfolio_id, benchmark_id=benchmark_id,
        period_start=period_start, period_end=period_end,
        method=method, computed_data=attr,
    )
    return attr


async def compute_portfolio_daily_returns(
    db: AsyncSession, portfolio_id: uuid.UUID, from_date: date, to_date: date,
) -> pd.Series:
    """Reconstructs weighted daily returns from holdings' NAV history."""
    from app.models.portfolio import Holding
    from app.models.nav_history import NavHistory

    holdings = (await db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id))).scalars().all()
    total_val = sum(float(h.current_value or 0) for h in holdings)
    if not holdings or total_val == 0:
        return pd.Series(dtype=float)

    frames = []
    for h in holdings:
        w = float(h.current_value or 0) / total_val
        rows = (await db.execute(
            select(NavHistory).where(NavHistory.fund_id == h.fund_id,
                                     NavHistory.nav_date >= from_date, NavHistory.nav_date <= to_date)
            .order_by(NavHistory.nav_date)
        )).scalars().all()
        if rows:
            s = pd.Series({r.nav_date: float(r.nav) for r in rows})
            frames.append(s.pct_change().dropna() * w)

    return pd.concat(frames, axis=1).fillna(0).sum(axis=1) if frames else pd.Series(dtype=float)


async def refresh_holdings(db: AsyncSession, portfolio_id: uuid.UUID) -> None:
    """Replay all transactions to rebuild holdings + update current NAV."""
    from app.models.transaction import Transaction
    from app.models.portfolio import Holding
    from app.models.nav_history import NavHistory
    from app.crud.portfolio import portfolio as crud_portfolio

    for h in (await db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id))).scalars().all():
        await db.delete(h)
    await db.flush()

    for txn in (await db.execute(
        select(Transaction).where(Transaction.portfolio_id == portfolio_id).order_by(Transaction.txn_date)
    )).scalars().all():
        await crud_portfolio.upsert_holding(
            db, portfolio_id=portfolio_id, fund_id=txn.fund_id,
            units_delta=Decimal(str(txn.units)), nav=Decimal(str(txn.nav_at_txn)), txn_type=txn.txn_type,
        )

    for h in (await db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id))).scalars().all():
        latest = (await db.execute(
            select(NavHistory).where(NavHistory.fund_id == h.fund_id).order_by(NavHistory.nav_date.desc()).limit(1)
        )).scalar_one_or_none()
        if latest:
            h.current_nav, h.current_value = latest.nav, Decimal(str(h.units)) * Decimal(str(latest.nav))
            db.add(h)
    await db.commit()
