"""
NAV Fetcher — Real mutual fund NAV data from AMFI via api.mfapi.in

Provides:
  - search_scheme_code(isin, name) → AMFI scheme code
  - fetch_nav_history(scheme_code) → list of (date, nav) sorted ascending
  - get_nav_on_date(isin, name, target_date) → float NAV (nearest available)
  - get_monthly_nav_series(isin, name, from_date, to_date) → month-end NAVs
  - compute_fund_returns(isin, name, year, month) → dict of SI, FYTD, 6M, 3M, 1M returns
  - compute_risk_metrics_from_nav(fund_monthly_returns, bench_monthly_returns) → risk dict
"""

import math
import re
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Optional

import requests


# ── Constants ─────────────────────────────────────────────────────────────────
MFAPI_BASE = "https://api.mfapi.in/mf"
REQUEST_TIMEOUT = 30  # seconds

# ISIN → AMFI scheme code mapping cache (populated at runtime)
_isin_to_code: dict[str, int] = {}
_name_to_code: dict[str, int] = {}


# ── Scheme Code Search ────────────────────────────────────────────────────────

def _clean_fund_name(name: str) -> str:
    """Remove common suffixes to get a cleaner search term."""
    cleaned = re.sub(
        r'\b(growth|direct|regular|idcw|dividend|plan|option|mutual\s+fund|'
        r'fund|scheme|payout|reinvestment)\b',
        '', name, flags=re.IGNORECASE
    )
    cleaned = re.sub(r'[-()\/\\.,&]', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def _find_data_file(filename: str) -> str | None:
    import os
    # 1. Check in backend/app/templates
    templates_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "templates"))
    path = os.path.join(templates_dir, filename)
    if os.path.exists(path):
        return path
        
    # 2. Check in workspace root (parent of backend)
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    path = os.path.join(workspace_root, filename)
    if os.path.exists(path):
        return path
        
    # 3. Check in current directory
    if os.path.exists(filename):
        return filename
        
    return None


def search_scheme_code(isin: str = "", name: str = "") -> Optional[int]:
    """
    Search for an AMFI scheme code given an ISIN or fund name.
    Returns the scheme code (int) or None if not found.
    """
    isin = isin.strip().upper() if isin else ""
    name = name.strip() if name else ""

    # Check cache first
    if isin and isin in _isin_to_code:
        return _isin_to_code[isin]
    if name and name.lower() in _name_to_code:
        return _name_to_code[name.lower()]

    # Strategy 0: Search ISIN in local CSV file
    if isin:
        try:
            csv_path = _find_data_file("nav_until_2026-05-31.csv")
            if csv_path:
                import pandas as pd
                df = pd.read_csv(csv_path, usecols=["Scheme Code", "ISIN Div Payout/ ISIN Growth"])
                matches = df[df["ISIN Div Payout/ ISIN Growth"].astype(str).str.strip().str.upper() == isin]
                if not matches.empty:
                    code = int(matches.iloc[0]["Scheme Code"])
                    _isin_to_code[isin] = code
                    print(f"[nav_fetcher] Found local Scheme Code {code} for ISIN {isin}")
                    return code
        except Exception as e:
            print(f"[nav_fetcher] Local ISIN lookup failed: {e}")

    # Strategy 1: Search by name keywords
    search_terms = []
    if name:
        # Use first 2-3 meaningful words for search
        cleaned = _clean_fund_name(name)
        words = [w for w in cleaned.split() if len(w) > 2]
        search_terms.append(' '.join(words[:4]))

    if not search_terms and isin:
        search_terms.append(isin)

    for term in search_terms:
        try:
            resp = requests.get(
                f"{MFAPI_BASE}/search",
                params={"q": term},
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code != 200:
                continue
            results = resp.json()
            if not results:
                continue

            # Try to match by ISIN first (fetch each result's meta to check)
            # But that's too many requests — instead match by name similarity
            name_lower = name.lower() if name else ""

            # Prefer Direct Plan Growth
            best_match = None
            best_score = -1

            for r in results:
                scheme_name = r.get("schemeName", "").lower()
                code = r.get("schemeCode")
                if not code:
                    continue

                score = 0
                # Prefer direct plan
                if "direct" in scheme_name:
                    score += 10
                # Prefer growth
                if "growth" in scheme_name:
                    score += 5
                # Name similarity
                if name_lower:
                    name_words = set(name_lower.split())
                    scheme_words = set(scheme_name.split())
                    overlap = len(name_words & scheme_words)
                    score += overlap * 2

                if score > best_score:
                    best_score = score
                    best_match = code

            if best_match:
                # Cache the result
                if isin:
                    _isin_to_code[isin] = best_match
                if name:
                    _name_to_code[name.lower()] = best_match
                return best_match

        except Exception as e:
            print(f"[nav_fetcher] Search error for '{term}': {e}")
            continue

    return None


# ── NAV History Fetch ─────────────────────────────────────────────────────────

@lru_cache(maxsize=128)
def fetch_nav_history(scheme_code: int) -> list[tuple[date, float]]:
    """
    Fetch full historical NAV data for a scheme.
    Returns list of (date, nav) sorted ascending by date.
    Automatically adjusts for historical unit splits (drops > 35% in a single day).
    """
    try:
        resp = requests.get(
            f"{MFAPI_BASE}/{scheme_code}",
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            print(f"[nav_fetcher] Failed to fetch NAV for code {scheme_code}: HTTP {resp.status_code}")
            return []

        data = resp.json()
        nav_data = data.get("data", [])

        result = []
        for entry in nav_data:
            try:
                nav_val = float(entry["nav"])
                # Date format from MFAPI is DD-MM-YYYY
                nav_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
                result.append((nav_date, nav_val))
            except (ValueError, KeyError):
                continue

        # Sort ascending by date
        result.sort(key=lambda x: x[0])

        # Adjust for corporate actions (splits)
        # If the NAV drops by >35% in a single day, scale all historical NAVs before that day by the ratio.
        # We verify that both NAVs are > 1.0 and the ratio is >= 0.01 to filter out bad data entries (zero/near-zero values).
        n = len(result)
        for i in range(1, n):
            prev_nav = result[i-1][1]
            curr_nav = result[i][1]
            if prev_nav > 1.0 and curr_nav > 1.0:
                ratio = curr_nav / prev_nav
                if 0.01 <= ratio <= 0.65:
                    print(f"[nav_fetcher] Adjusting split on {result[i][0]} for scheme {scheme_code}: ratio={ratio:.4f} (dropped from {prev_nav} to {curr_nav})")
                    for j in range(i):
                        result[j] = (result[j][0], result[j][1] * ratio)

        return result

    except Exception as e:
        print(f"[nav_fetcher] Error fetching NAV for code {scheme_code}: {e}")
        return []


def _get_nav_history_for_fund(isin: str = "", name: str = "") -> list[tuple[date, float]]:
    """Get NAV history for a fund identified by ISIN or name."""
    code = search_scheme_code(isin=isin, name=name)
    if code is None:
        return []
    return fetch_nav_history(code)


# ── NAV Lookup ────────────────────────────────────────────────────────────────

def get_nav_on_date(
    isin: str = "",
    name: str = "",
    target_date: str | date = "",
    nav_history: list[tuple[date, float]] | None = None,
) -> Optional[float]:
    """
    Get the NAV on or closest before a target date.

    Args:
        isin: Fund ISIN
        name: Fund name
        target_date: Target date (YYYY-MM-DD string or date object)
        nav_history: Pre-fetched NAV history (avoids re-fetching)

    Returns:
        NAV value as float, or None if not found.
    """
    if nav_history is None:
        nav_history = _get_nav_history_for_fund(isin=isin, name=name)

    if not nav_history:
        return None

    if isinstance(target_date, str):
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
    else:
        target = target_date

    # Binary search for closest date <= target
    best_nav = None
    best_date = None

    for d, nav in reversed(nav_history):
        if d <= target:
            best_nav = nav
            best_date = d
            break

    # If no date before target, try closest available
    if best_nav is None and nav_history:
        best_nav = nav_history[0][1]

    return best_nav


def get_month_end_nav(
    nav_history: list[tuple[date, float]],
    year: int,
    month: int,
) -> Optional[float]:
    """Get the last available NAV for a given month."""
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    target = date(year, month, last_day)

    # Find the last NAV on or before the last day of the month
    best = None
    for d, nav in nav_history:
        if d.year == year and d.month == month:
            best = nav  # keep updating; since sorted ascending, last one wins
        elif d > target:
            break

    # If no NAV in that exact month, try closest before
    if best is None:
        for d, nav in reversed(nav_history):
            if d <= target:
                best = nav
                break

    return best


# ── Return Computation ────────────────────────────────────────────────────────

def compute_fund_returns(
    isin: str = "",
    name: str = "",
    year: int = 2026,
    month: int = 1,
    nav_history: list[tuple[date, float]] | None = None,
) -> dict:
    """
    Compute fund returns for a given month-end snapshot.

    Returns dict with keys:
        si_return:   Since Inception CAGR (%)
        fytd_return: Financial Year To Date return (%)
        m6_return:   6-month return (%)
        m3_return:   3-month return (%)
        m1_return:   1-month return (%)
        fund_rets:   [SI, FYTD, 6M, 3M, 1M] list for direct use
        nav_current: Current NAV value
        nav_inception: Inception NAV value
    """
    if nav_history is None:
        nav_history = _get_nav_history_for_fund(isin=isin, name=name)

    result = {
        "si_return": None,
        "fytd_return": None,
        "m6_return": None,
        "m3_return": None,
        "m1_return": None,
        "fund_rets": None,
        "nav_current": None,
        "nav_inception": None,
    }

    if not nav_history:
        return result

    # Current month-end NAV
    nav_current = get_month_end_nav(nav_history, year, month)
    if nav_current is None or nav_current <= 0:
        return result

    result["nav_current"] = nav_current

    # ── 1-Month Return ────────────────────────────────────────────────────
    prev_y = year if month > 1 else year - 1
    prev_m = month - 1 if month > 1 else 12
    nav_1m = get_month_end_nav(nav_history, prev_y, prev_m)
    m1_return = None
    if nav_1m and nav_1m > 0:
        m1_return = ((nav_current - nav_1m) / nav_1m) * 100

    # ── 3-Month Return ────────────────────────────────────────────────────
    y3, m3 = year, month - 3
    if m3 <= 0:
        m3 += 12
        y3 -= 1
    nav_3m = get_month_end_nav(nav_history, y3, m3)
    m3_return = None
    if nav_3m and nav_3m > 0:
        m3_return = ((nav_current - nav_3m) / nav_3m) * 100

    # ── 6-Month Return ────────────────────────────────────────────────────
    y6, m6 = year, month - 6
    if m6 <= 0:
        m6 += 12
        y6 -= 1
    nav_6m = get_month_end_nav(nav_history, y6, m6)
    m6_return = None
    if nav_6m and nav_6m > 0:
        m6_return = ((nav_current - nav_6m) / nav_6m) * 100

    # ── FYTD Return (Financial Year starts April 1) ───────────────────────
    fy_year = year if month >= 4 else year - 1
    # Get NAV on or near April 1 of FY start
    nav_fy = get_month_end_nav(nav_history, fy_year, 3)  # March end (before FY start)
    if nav_fy is None:
        # Try April start
        nav_fy = get_month_end_nav(nav_history, fy_year, 4)
    fytd_return = None
    if nav_fy and nav_fy > 0:
        fytd_return = ((nav_current - nav_fy) / nav_fy) * 100

    # ── Since Inception Return (CAGR) ─────────────────────────────────────
    inception_date, nav_inception = nav_history[0]
    result["nav_inception"] = nav_inception
    import calendar
    current_date = date(year, month, calendar.monthrange(year, month)[1])
    days_since_inception = (current_date - inception_date).days
    years_since_inception = days_since_inception / 365.25

    si_return = None
    if nav_inception and nav_inception > 0 and years_since_inception > 0:
        si_return = ((nav_current / nav_inception) ** (1.0 / years_since_inception) - 1) * 100

    result["si_return"] = si_return
    result["fytd_return"] = fytd_return
    result["m6_return"] = m6_return
    result["m3_return"] = m3_return
    result["m1_return"] = m1_return

    # Build the fund_rets list [SI, FYTD, 6M, 3M, 1M]
    result["fund_rets"] = [
        round(si_return, 4) if si_return is not None else None,
        round(fytd_return, 4) if fytd_return is not None else None,
        round(m6_return, 4) if m6_return is not None else None,
        round(m3_return, 4) if m3_return is not None else None,
        round(m1_return, 4) if m1_return is not None else None,
    ]

    return result


def get_monthly_returns(
    nav_history: list[tuple[date, float]],
    months_list: list[tuple[int, int]],
) -> list[Optional[float]]:
    """
    Compute 1-month returns (as decimals) for each (year, month) in months_list.

    Returns a list of monthly returns (decimal, e.g. 0.02 = 2%).
    """
    returns = []
    for year, month in months_list:
        nav_end = get_month_end_nav(nav_history, year, month)
        prev_y = year if month > 1 else year - 1
        prev_m = month - 1 if month > 1 else 12
        nav_start = get_month_end_nav(nav_history, prev_y, prev_m)

        if nav_end and nav_start and nav_start > 0:
            returns.append((nav_end - nav_start) / nav_start)
        else:
            returns.append(None)

    return returns


# ── Risk Metrics Computation ──────────────────────────────────────────────────

def compute_risk_metrics_from_nav(
    fund_monthly_returns: list[float],
    bench_monthly_returns: list[float],
    rf_rate: float = 0.065,
) -> dict:
    """
    Compute risk metrics from monthly return series (decimals).

    Args:
        fund_monthly_returns: list of monthly returns (decimals, e.g. 0.02)
        bench_monthly_returns: list of monthly returns (decimals)
        rf_rate: annual risk-free rate (default 6.5%)

    Returns dict with:
        sharpe_ratio, information_ratio, beta, alpha (Jensen's, in %),
        std_dev_monthly, sortino_ratio, max_drawdown, var_95
    """
    n = len(fund_monthly_returns)
    result = {
        "sharpe_ratio": 0.0,
        "information_ratio": 0.0,
        "beta": 1.0,
        "alpha": 0.0,
        "std_dev_monthly": None,
        "sortino_ratio": 0.0,
        "max_drawdown": 0.0,
        "var_95": 0.0,
    }

    if n < 2:
        return result

    def _mean(arr):
        return sum(arr) / len(arr)

    def _var_s(arr, m):
        return sum((x - m) ** 2 for x in arr) / (len(arr) - 1)

    def _std_s(arr, m):
        return math.sqrt(_var_s(arr, m))

    def _cov_s(a, ma, b, mb):
        return sum((a[i] - ma) * (b[i] - mb) for i in range(len(a))) / (len(a) - 1)

    rf_monthly = rf_rate / 12.0

    mean_port = _mean(fund_monthly_returns)
    mean_bench = _mean(bench_monthly_returns)

    std_port = _std_s(fund_monthly_returns, mean_port)

    # Sharpe Ratio (annualized)
    fund_return_annual = mean_port * 12
    std_dev_annual = std_port * math.sqrt(12)
    if std_dev_annual > 0.0001:
        sharpe = (fund_return_annual - rf_rate) / std_dev_annual
    else:
        sharpe = 0.0

    # Sortino Ratio
    excess_port = [r - rf_monthly for r in fund_monthly_returns]
    downside_diffs = [r for r in excess_port if r < 0]
    if len(downside_diffs) > 0:
        downside_deviation = math.sqrt(
            sum(r * r for r in downside_diffs) / len(downside_diffs)
        ) * math.sqrt(12)
    else:
        downside_deviation = 0
    sortino = (_mean(excess_port) * 12) / downside_deviation if downside_deviation > 0.0001 else 0

    # Beta
    var_bench = _var_s(bench_monthly_returns, mean_bench)
    cov_pb = _cov_s(fund_monthly_returns, mean_port, bench_monthly_returns, mean_bench)
    if var_bench > 0.000001:
        beta = cov_pb / var_bench
    else:
        beta = 1.0

    # Jensen's Alpha (%)
    market_return_annual = mean_bench * 12
    expected_return = rf_rate + beta * (market_return_annual - rf_rate)
    alpha = (fund_return_annual - expected_return) * 100

    # Information Ratio
    active_returns = [fund_monthly_returns[i] - bench_monthly_returns[i] for i in range(n)]
    mean_active = _mean(active_returns)
    std_active = _std_s(active_returns, mean_active)
    tracking_error = std_active * math.sqrt(12)
    if tracking_error > 0.0001:
        info_ratio = (fund_return_annual - market_return_annual) / tracking_error
    else:
        info_ratio = 0.0

    # Max Drawdown
    current_nav = 100
    nav_series = [current_nav]
    for r in fund_monthly_returns:
        current_nav *= (1 + r)
        nav_series.append(current_nav)
    max_dd = 0
    peak = nav_series[0]
    for nav in nav_series:
        if nav > peak:
            peak = nav
        dd = (nav - peak) / peak
        if dd < max_dd:
            max_dd = dd

    # 95% VaR
    sorted_returns = sorted(fund_monthly_returns)
    var_index = int(0.05 * len(sorted_returns))
    var_95 = -sorted_returns[var_index] * 100 if len(sorted_returns) > 0 else 0

    result["sharpe_ratio"] = round(sharpe, 4)
    result["information_ratio"] = round(info_ratio, 4)
    result["beta"] = round(beta, 4)
    result["alpha"] = round(alpha, 4)
    result["std_dev_monthly"] = std_port
    result["sortino_ratio"] = round(sortino, 4)
    result["max_drawdown"] = round(max_dd * 100, 4)
    result["var_95"] = round(var_95, 4)

    return result


# ── Category Rank (best-effort) ───────────────────────────────────────────────

def get_category_rank(
    fund_return: float,
    category: str,
    period: str = "1M",
) -> tuple[Optional[int], Optional[int]]:
    """
    Attempt to compute category rank.
    Since we can't fetch all category funds efficiently, return N/A.
    """
    # Category rank requires NAV data for all funds in the same category
    # which would require 40+ API calls — not practical for real-time report
    return (None, None)


# ── Convenience: Fetch returns for both fund and benchmark ────────────────────

def fetch_fund_and_bench_returns(
    fund_isin: str = "",
    fund_name: str = "",
    bench_isin: str = "",
    bench_name: str = "",
    year: int = 2026,
    month: int = 1,
    months_list: list[tuple[int, int]] | None = None,
) -> dict:
    """
    Fetch returns for both fund and benchmark. Returns a comprehensive dict.

    Returns:
        {
            "fund_rets": [SI, FYTD, 6M, 3M, 1M] or None,
            "bench_rets": [SI, FYTD, 6M, 3M, 1M] or None,
            "fund_monthly_returns": [decimal returns per month],
            "bench_monthly_returns": [decimal returns per month],
            "fund_nav_history": [...],
            "bench_nav_history": [...],
            "risk_metrics": {...},
            "fund_nav_current": float,
        }
    """
    result = {
        "fund_rets": None,
        "bench_rets": None,
        "fund_monthly_returns": [],
        "bench_monthly_returns": [],
        "fund_nav_history": [],
        "bench_nav_history": [],
        "risk_metrics": None,
        "fund_nav_current": None,
    }

    # Fetch fund NAV history
    fund_nav = _get_nav_history_for_fund(isin=fund_isin, name=fund_name)
    result["fund_nav_history"] = fund_nav

    if fund_nav:
        fund_returns = compute_fund_returns(
            isin=fund_isin, name=fund_name,
            year=year, month=month,
            nav_history=fund_nav,
        )
        result["fund_rets"] = fund_returns.get("fund_rets")
        result["fund_nav_current"] = fund_returns.get("nav_current")

    # Fetch benchmark NAV history
    bench_nav = []
    if bench_isin or bench_name:
        bench_nav = _get_nav_history_for_fund(isin=bench_isin, name=bench_name)
        result["bench_nav_history"] = bench_nav

        if bench_nav:
            bench_returns = compute_fund_returns(
                isin=bench_isin, name=bench_name,
                year=year, month=month,
                nav_history=bench_nav,
            )
            result["bench_rets"] = bench_returns.get("fund_rets")

    # Compute monthly returns for risk metrics
    if months_list and fund_nav:
        fund_monthly = get_monthly_returns(fund_nav, months_list)
        result["fund_monthly_returns"] = [r for r in fund_monthly if r is not None]

        if bench_nav:
            bench_monthly = get_monthly_returns(bench_nav, months_list)
            result["bench_monthly_returns"] = [r for r in bench_monthly if r is not None]

            valid_fund = result["fund_monthly_returns"]
            valid_bench = result["bench_monthly_returns"]
            min_len = min(len(valid_fund), len(valid_bench))
            if min_len >= 2:
                result["risk_metrics"] = compute_risk_metrics_from_nav(
                    valid_fund[:min_len],
                    valid_bench[:min_len],
                )

    return result


# ── AMFI Fund Performance Polling API Integration ────────────────────────────

def map_section_to_ids(sec: str) -> tuple[int, int, int]:
    """Map category description (section) to AMFI API maturity, category, and subcategory IDs."""
    sec_lower = str(sec).lower()
    
    # Maturity Type
    maturity_id = 1  # Open ended default
    if "close" in sec_lower:
        maturity_id = 2
    elif "interval" in sec_lower:
        maturity_id = 2
        
    # Category
    cat_id = 1  # Equity default
    if "debt" in sec_lower:
        cat_id = 2
    elif "hybrid" in sec_lower:
        cat_id = 3
    elif "solution" in sec_lower:
        cat_id = 4
    elif "other" in sec_lower:
        cat_id = 5
    elif "gilt" in sec_lower or "money market" in sec_lower or "income" in sec_lower:
        cat_id = 2
        
    # Subcategory defaults
    if cat_id == 1:
        sub_id = 1
    elif cat_id == 2:
        sub_id = 15
    elif cat_id == 3:
        sub_id = 30
    elif cat_id == 4:
        sub_id = 36
    elif cat_id == 5:
        sub_id = 38
    else:
        sub_id = 1
    
    # Subcategory mapping rules
    if cat_id == 1:  # Equity
        if "large & mid" in sec_lower:
            sub_id = 2
        elif "large cap" in sec_lower:
            sub_id = 1
        elif "flexi cap" in sec_lower:
            sub_id = 3
        elif "multi cap" in sec_lower:
            sub_id = 4
        elif "mid cap" in sec_lower:
            sub_id = 5
        elif "small cap" in sec_lower:
            sub_id = 6
        elif "value" in sec_lower:
            sub_id = 7
        elif "elss" in sec_lower:
            sub_id = 8
        elif "contra" in sec_lower:
            sub_id = 9
        elif "dividend yield" in sec_lower:
            sub_id = 10
        elif "focused" in sec_lower:
            sub_id = 11
        elif "sectoral" in sec_lower or "thematic" in sec_lower:
            sub_id = 12
    elif cat_id == 2:  # Debt
        if "gilt with 10" in sec_lower or "10 year constant" in sec_lower:
            sub_id = 29
        elif "gilt" in sec_lower:
            sub_id = 28
        elif "medium to long" in sec_lower:
            sub_id = 14
        elif "long duration" in sec_lower:
            sub_id = 13
        elif "ultra short" in sec_lower:
            sub_id = 19
        elif "short duration" in sec_lower:
            sub_id = 15
        elif "medium duration" in sec_lower:
            sub_id = 16
        elif "money market" in sec_lower:
            sub_id = 17
        elif "low duration" in sec_lower:
            sub_id = 18
        elif "liquid" in sec_lower:
            sub_id = 20
        elif "overnight" in sec_lower:
            sub_id = 21
        elif "dynamic bond" in sec_lower:
            sub_id = 22
        elif "corporate bond" in sec_lower:
            sub_id = 23
        elif "credit risk" in sec_lower:
            sub_id = 24
        elif "banking" in sec_lower or "psu" in sec_lower:
            sub_id = 25
        elif "floater" in sec_lower:
            sub_id = 26
        elif "fmp" in sec_lower:
            sub_id = 27
    elif cat_id == 3:  # Hybrid
        if "aggressive hybrid" in sec_lower:
            sub_id = 30
        elif "conservative hybrid" in sec_lower or "conservative hyrbid" in sec_lower:
            sub_id = 31
        elif "equity savings" in sec_lower:
            sub_id = 32
        elif "arbitrage" in sec_lower:
            sub_id = 33
        elif "multi asset" in sec_lower:
            sub_id = 34
        elif "dynamic asset" in sec_lower or "balanced advantage" in sec_lower:
            sub_id = 35
        elif "balanced hybrid" in sec_lower:
            sub_id = 40
    elif cat_id == 4:  # Solution Oriented
        if "children" in sec_lower:
            sub_id = 36
        elif "retirement" in sec_lower:
            sub_id = 37
    elif cat_id == 5:  # Other
        if "index fund" in sec_lower or "index" in sec_lower:
            sub_id = 38
        elif "etf" in sec_lower:
            sub_id = 38
        elif "fof" in sec_lower or "fund of funds" in sec_lower:
            sub_id = 39
        
    return maturity_id, cat_id, sub_id


def clean_name(name: str) -> str:
    """Normalize fund name for matching by removing common suffixes."""
    n = str(name).lower()
    n = n.replace("flexicap", "flexi cap")
    n = n.replace("multicap", "multi cap")
    n = n.replace("midcap", "mid cap")
    n = n.replace("smallcap", "small cap")
    n = n.replace("largecap", "large cap")
    
    n = n.replace("-", " ").replace("/", " ").replace("(", " ").replace(")", " ")
    tokens = n.split()
    suffixes_to_remove = {
        "direct", "regular", "retail", "plan", "growth", "option", "idcw", "dividend", 
        "payout", "reinvestment", "annual", "monthly", "weekly", "quarterly", "fortnightly",
        "bonus", "fund"
    }
    cleaned_tokens = [t for t in tokens if t not in suffixes_to_remove]
    return " ".join(cleaned_tokens)


def find_matching_perf_row(nav_name: str, perf_rows: list) -> dict | None:
    """Fuzzy match a NAV fund name against the performance records list."""
    if not perf_rows:
        return None
    cleaned_nav = clean_name(nav_name)
    if not cleaned_nav:
        return None
        
    # 1. Substring match
    for p_row in perf_rows:
        p_name = p_row.get("schemeName") or ""
        cleaned_perf = clean_name(p_name)
        if cleaned_perf and (cleaned_perf in cleaned_nav or cleaned_nav in cleaned_perf):
            return p_row
            
    # 2. Token overlap fallback
    nav_tokens = set(cleaned_nav.split())
    best_row = None
    best_score = 0.0
    for p_row in perf_rows:
        p_name = p_row.get("schemeName") or ""
        cleaned_perf = clean_name(p_name)
        if not cleaned_perf:
            continue
        perf_tokens = set(cleaned_perf.split())
        intersection = nav_tokens.intersection(perf_tokens)
        if intersection:
            score = len(intersection) / len(nav_tokens.union(perf_tokens))
            if score > best_score:
                best_score = score
                best_row = p_row
                
    if best_score > 0.4:
        return best_row
    return None


_perf_api_cache = {}

def get_performance_stats(fund_name: str, category: str, date_str: str, is_direct: bool = False) -> dict | None:
    """
    Fetch performance stats (AUM, category returns, and ranks) for a given fund and category on a specific date.
    
    Args:
        fund_name: Clean name of the fund
        category: Fund category string
        date_str: Target date in DD-MMM-YYYY format
        is_direct: True if Direct plan, False if Regular plan
        
    Returns:
        Dict with keys: fund_aum, category_returns, ranks or None.
    """
    maturity_id, cat_id, sub_id = map_section_to_ids(category)
    key = (date_str, maturity_id, cat_id, sub_id)
    
    # 1. Check in cache
    if key in _perf_api_cache:
        rows = _perf_api_cache[key]
    else:
        url = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json"
        }
        payload = {
            "maturityType": maturity_id,
            "category": cat_id,
            "subCategory": sub_id,
            "mfid": 0,
            "reportDate": date_str
        }
        
        import time
        max_retries = 3
        backoff = 0.5
        rows = []
        
        for attempt in range(max_retries):
            try:
                resp = requests.post(url, json=payload, headers=headers, timeout=15)
                if resp.status_code == 200:
                    res_data = resp.json()
                    if res_data.get("validationMsg") == "SUCCESS":
                        rows = res_data.get("data", [])
                        _perf_api_cache[key] = rows
                        break
            except Exception as e:
                print(f"[nav_fetcher] AMFI performance fetch attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(backoff)
                backoff *= 2
                
        if not rows:
            _perf_api_cache[key] = []
            return None

    if not rows:
        return None
        
    # Find matching fund row
    match = find_matching_perf_row(fund_name, rows)
    if not match:
        return None
        
    fund_aum = float(match.get("dailyAUM")) if match.get("dailyAUM") else None
    
    period_keys = [
        ("1M", "return1MonthRegular", "return1MonthDirect"),
        ("3M", "return3MonthRegular", "return3MonthDirect"),
        ("6M", "return6MonthRegular", "return6MonthDirect"),
        ("1Y", "return1YearRegular", "return1YearDirect"),
        ("SI", "returnSinceLaunchRegular", "returnSinceLaunchDirect")
    ]
    
    stats = {
        "fund_aum": fund_aum,
        "category_returns": {},
        "ranks": {}
    }
    
    for label, reg_key, dir_key in period_keys:
        val_key = dir_key if is_direct else reg_key
        
        # Collect returns for category average and ranking
        valid_rets = []
        for r in rows:
            val = r.get(val_key)
            if val is not None and val != "":
                try:
                    valid_rets.append(float(val))
                except ValueError:
                    pass
                    
        if not valid_rets:
            stats["category_returns"][label] = None
            stats["ranks"][label] = (None, None)
            continue
            
        # Category average return
        stats["category_returns"][label] = round(sum(valid_rets) / len(valid_rets), 4)
        
        # Fund's rank
        fund_val_str = match.get(val_key)
        if fund_val_str is not None and fund_val_str != "":
            try:
                fund_val = float(fund_val_str)
                sorted_rets = sorted(valid_rets, reverse=True)
                rank_num = sorted_rets.index(fund_val) + 1
                rank_den = len(sorted_rets)
                stats["ranks"][label] = (rank_num, rank_den)
            except (ValueError, IndexError):
                stats["ranks"][label] = (None, None)
        else:
            stats["ranks"][label] = (None, None)
            
    return stats
