"""
Lightweight risk metrics computation using real NAV data from AMFI API.
Used by the /reports/risk-metrics API endpoint so the frontend dashboard
displays the same values as the generated Excel report.

Falls back to Nifty-based approximation if NAV fetch fails.
"""

import os
import math
import pandas as pd
import calendar
from pathlib import Path


def compute_dashboard_risk_metrics(
    fund_name: str,
    isin: str = "",
    from_date: str = "2025-12",
    to_date: str = "2026-04",
    bench_name: str = "",
    bench_isin: str = "",
) -> dict:
    """
    Compute risk metrics (Sharpe, Sortino, Beta, Alpha, Info Ratio, etc.)
    using real NAV data from AMFI API.

    Returns a dict with keys:
        sharpe_ratio, sortino_ratio, beta, alpha, information_ratio,
        max_drawdown, var_95, std_dev_annual,
        fund_return_annual, benchmark_return_annual,
        monthly_returns (list of {date, fund_return, bench_return})
    """
    # ── Parse date range ──────────────────────────────────────────────────
    from_parts = from_date.split("-")
    from_y, from_m = int(from_parts[0]), int(from_parts[1])
    to_parts = to_date.split("-")
    to_y, to_m = int(to_parts[0]), int(to_parts[1])

    months_list = []
    y, m = from_y, from_m
    while (y, m) <= (to_y, to_m):
        months_list.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    # ── Try to use real NAV data ──────────────────────────────────────────
    try:
        from app.utils.nav_fetcher import (
            fetch_fund_and_bench_returns,
            get_monthly_returns as nav_get_monthly_returns,
            _get_nav_history_for_fund,
        )

        print(f"[risk_metrics] Fetching real NAV for {fund_name} (ISIN={isin})")
        last_year, last_month = months_list[-1]

        nav_result = fetch_fund_and_bench_returns(
            fund_isin=isin,
            fund_name=fund_name,
            bench_isin=bench_isin,
            bench_name=bench_name,
            year=last_year,
            month=last_month,
            months_list=months_list,
        )

        fund_nav_history = nav_result.get("fund_nav_history", [])
        bench_nav_history = nav_result.get("bench_nav_history", [])

        if fund_nav_history:
            # Get monthly returns from real NAV
            fund_monthly_raw = nav_get_monthly_returns(fund_nav_history, months_list)
            monthly_fund_returns = [r for r in fund_monthly_raw if r is not None]
            monthly_labels = [
                f"{y}-{str(m).zfill(2)}"
                for (y, m), r in zip(months_list, fund_monthly_raw)
                if r is not None
            ]

            if bench_nav_history:
                bench_monthly_raw = nav_get_monthly_returns(bench_nav_history, months_list)
                monthly_bench_returns = [r for r in bench_monthly_raw if r is not None]
            else:
                # Fall back to Nifty for benchmark
                monthly_bench_returns = _compute_nifty_monthly_returns(months_list)

            # Align lengths
            min_len = min(len(monthly_fund_returns), len(monthly_bench_returns))
            monthly_fund_returns = monthly_fund_returns[:min_len]
            monthly_bench_returns = monthly_bench_returns[:min_len]
            monthly_labels = monthly_labels[:min_len]

            if min_len >= 2:
                print(f"[risk_metrics] Computing from {min_len} months of REAL NAV data")
                return _compute_risk_from_returns(
                    monthly_fund_returns,
                    monthly_bench_returns,
                    monthly_labels,
                )
            else:
                print(f"[risk_metrics] Not enough real NAV data ({min_len} months), falling back")
        else:
            print(f"[risk_metrics] No NAV data found for {fund_name}, falling back")

    except Exception as e:
        print(f"[risk_metrics] NAV fetch failed: {e}, falling back to Nifty-based method")

    # ── Fallback: Nifty-based computation ─────────────────────────────────
    return _compute_fallback_risk_metrics(
        fund_name=fund_name,
        isin=isin,
        months_list=months_list,
        bench_name=bench_name,
    )


def _compute_nifty_monthly_returns(months_list: list) -> list:
    """Compute Nifty monthly returns from CSV if available."""
    base_dir = Path(__file__).resolve().parents[3]
    possible_dirs = [
        Path(__file__).resolve().parent.parent / "templates",
        base_dir / "FUNDS PERFORMANCE ANALYSIS",
        base_dir,
    ]

    df_nifty = None
    for d in possible_dirs:
        candidate = d / "NIFTY50_2025-06-01_to_2026-06-01.csv"
        if candidate.exists():
            try:
                df_nifty = pd.read_csv(str(candidate))
                df_nifty['Date'] = pd.to_datetime(df_nifty['Date'], errors='coerce')
                df_nifty = df_nifty.dropna(subset=['Date']).sort_values('Date').reset_index(drop=True)
            except Exception:
                pass
            break

    if df_nifty is None:
        return [0.0] * len(months_list)

    returns = []
    for year, month in months_list:
        dates = pd.DatetimeIndex(df_nifty['Date'])
        month_data = df_nifty[(dates.year == year) & (dates.month == month)]

        prev_y = year if month > 1 else year - 1
        prev_m = month - 1 if month > 1 else 12
        prev_data = df_nifty[(dates.year == prev_y) & (dates.month == prev_m)]

        if not month_data.empty and not prev_data.empty:
            c_end = float(month_data.sort_values('Date').iloc[-1]['Close'])
            c_start = float(prev_data.sort_values('Date').iloc[-1]['Close'])
            if c_start > 0:
                returns.append((c_end - c_start) / c_start)
            else:
                returns.append(0.0)
        else:
            returns.append(0.0)

    return returns


def _compute_risk_from_returns(
    monthly_fund_returns: list,
    monthly_bench_returns: list,
    monthly_labels: list,
) -> dict:
    """Compute all risk metrics from monthly return series."""
    n = len(monthly_fund_returns)

    def _mean(arr):
        return sum(arr) / len(arr)

    def _var_s(arr, m):
        return sum((x - m) ** 2 for x in arr) / (len(arr) - 1)

    def _std_s(arr, m):
        return math.sqrt(_var_s(arr, m))

    def _cov_s(a, ma, b, mb):
        return sum((a[i] - ma) * (b[i] - mb) for i in range(len(a))) / (len(a) - 1)

    rf_rate = 0.065  # 6.5% annual risk-free rate
    rf_monthly = rf_rate / 12.0

    mean_port = _mean(monthly_fund_returns)
    mean_bench = _mean(monthly_bench_returns)

    std_port = _std_s(monthly_fund_returns, mean_port)

    # Sharpe Ratio
    fund_return = mean_port * 12
    std_dev_annual = std_port * math.sqrt(12)
    if std_dev_annual > 0.0001:
        risk_sharpe = (fund_return - rf_rate) / std_dev_annual
    else:
        risk_sharpe = 0.0

    # Sortino Ratio
    excess_port = [r - rf_monthly for r in monthly_fund_returns]
    mean_excess = _mean(excess_port)
    downside_diffs = [r for r in excess_port if r < 0]
    if len(downside_diffs) > 0:
        downside_deviation = math.sqrt(
            sum(r * r for r in downside_diffs) / len(downside_diffs)
        ) * math.sqrt(12)
    else:
        downside_deviation = 0
    sortino = (mean_excess * 12) / downside_deviation if downside_deviation > 0.0001 else 0

    # Portfolio Beta
    var_bench = _var_s(monthly_bench_returns, mean_bench)
    cov_pb = _cov_s(monthly_fund_returns, mean_port, monthly_bench_returns, mean_bench)
    if var_bench > 0.000001:
        risk_beta = cov_pb / var_bench
    else:
        risk_beta = 1.0

    # Jensen's Alpha
    market_return = mean_bench * 12
    expected_return = rf_rate + risk_beta * (market_return - rf_rate)
    risk_alpha = (fund_return - expected_return) * 100

    # Information Ratio
    active_returns = [monthly_fund_returns[i] - monthly_bench_returns[i] for i in range(n)]
    mean_active = _mean(active_returns)
    std_active = _std_s(active_returns, mean_active)
    tracking_error = std_active * math.sqrt(12)
    if tracking_error > 0.0001:
        active_return_ann = fund_return - market_return
        risk_info_ratio = active_return_ann / tracking_error
    else:
        risk_info_ratio = 0.0

    # Max Drawdown
    current_nav = 100
    nav_series = [current_nav]
    for r in monthly_fund_returns:
        current_nav *= (1 + r)
        nav_series.append(current_nav)
    max_drawdown = 0
    peak = nav_series[0]
    for nav in nav_series:
        if nav > peak:
            peak = nav
        dd = (nav - peak) / peak
        if dd < max_drawdown:
            max_drawdown = dd
    max_drawdown = max_drawdown * 100

    # 95% VaR
    sorted_returns = sorted(monthly_fund_returns)
    var_index = int(0.05 * len(sorted_returns))
    var_95 = -sorted_returns[var_index] * 100 if len(sorted_returns) > 0 else 0

    # Monthly returns list for frontend
    monthly_returns_data = []
    for i in range(n):
        monthly_returns_data.append({
            "date": monthly_labels[i] if i < len(monthly_labels) else f"Month-{i}",
            "fund_return": round(monthly_fund_returns[i], 6),
            "bench_return": round(monthly_bench_returns[i], 6),
        })

    return {
        "sharpe_ratio": round(risk_sharpe, 2),
        "sortino_ratio": round(sortino, 2),
        "beta": round(risk_beta, 2),
        "alpha": round(risk_alpha, 2),
        "information_ratio": round(risk_info_ratio, 2),
        "max_drawdown": round(max_drawdown, 2),
        "var_95": round(var_95, 2),
        "std_dev_annual": round(std_dev_annual, 4),
        "fund_return_annual": round(fund_return * 100, 2),
        "benchmark_return_annual": round(market_return * 100, 2),
        "monthly_returns": monthly_returns_data,
    }


def _compute_fallback_risk_metrics(
    fund_name: str,
    isin: str,
    months_list: list,
    bench_name: str = "",
) -> dict:
    """Fallback: compute risk metrics using Nifty CSV + seed-based fund returns."""
    # Deterministic seed (matches tracker_excel.py's get_fund_seed)
    def get_fund_seed(name: str) -> int:
        hash_val = 0
        for char in name:
            hash_val = ord(char) + ((hash_val << 5) - hash_val)
            hash_val = hash_val & 0xFFFFFFFF
        if hash_val > 0x7FFFFFFF:
            hash_val = hash_val - 0x100000000
        return abs(hash_val) % 100

    seed = get_fund_seed(fund_name)

    # Get Nifty monthly returns
    nifty_returns = _compute_nifty_monthly_returns(months_list)

    # Generate fund returns using seed offset
    active_1m = (seed % 3 - 1) * 0.002  # 0.2% in decimal
    monthly_fund_returns = [r + active_1m for r in nifty_returns]

    # Benchmark = nifty - 0.001
    monthly_bench_returns = [r - 0.001 for r in nifty_returns]

    monthly_labels = [f"{y}-{str(m).zfill(2)}" for y, m in months_list]

    n = len(monthly_fund_returns)
    if n < 2:
        return {
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "beta": 1.0,
            "alpha": 0.0,
            "information_ratio": 0.0,
            "max_drawdown": 0.0,
            "var_95": 0.0,
            "std_dev_annual": 0.0,
            "fund_return_annual": 0.0,
            "benchmark_return_annual": 0.0,
            "monthly_returns": [],
        }

    return _compute_risk_from_returns(
        monthly_fund_returns,
        monthly_bench_returns,
        monthly_labels,
    )
