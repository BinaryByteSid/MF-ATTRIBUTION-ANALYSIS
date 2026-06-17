"""
Unified portfolio metrics module.
Combines: returns (XIRR, CAGR, TWRR, rolling), risk (Sharpe, Sortino, MaxDD, VaR),
factor (Alpha, Beta, Tracking Error, Information Ratio), and portfolio-level
(Active Share, Concentration Risk, Up/Down Capture) into one file.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from scipy.optimize import brentq


# ══════════════════════════════════════════════════════════════════════════════
# RETURN METRICS
# ══════════════════════════════════════════════════════════════════════════════

def compute_xirr(cashflows: list[dict]) -> Optional[float]:
    """XIRR via Brent's method. cashflows: [{date, amount}], negative=outflow."""
    if not cashflows or len(cashflows) < 2:
        return None
    dates = [cf["date"] for cf in cashflows]
    amounts = [float(cf["amount"]) for cf in cashflows]
    if all(a <= 0 for a in amounts) or all(a >= 0 for a in amounts):
        return None
    t0 = dates[0]
    fracs = [(d - t0).days / 365.0 for d in dates]

    def npv(r):
        return sum(a / (1 + r) ** t for a, t in zip(amounts, fracs))

    try:
        return float(brentq(npv, -0.9999, 100.0, maxiter=1000, xtol=1e-8))
    except (ValueError, RuntimeError):
        return None


def compute_cagr(start_val: float, end_val: float, years: float) -> Optional[float]:
    """Compound Annual Growth Rate."""
    if start_val <= 0 or years <= 0 or end_val < 0:
        return None
    return float((end_val / start_val) ** (1 / years) - 1)


def compute_twrr(nav_series: pd.Series) -> float:
    """Time-Weighted Return from a NAV series (no external flows needed)."""
    if nav_series.empty or len(nav_series) < 2:
        return 0.0
    return float(nav_series.iloc[-1] / nav_series.iloc[0] - 1)


def compute_rolling_returns(nav_series: pd.Series, window_days: int) -> pd.Series:
    """Rolling N-day returns from NAV."""
    return nav_series.pct_change(periods=window_days).dropna() if not nav_series.empty else pd.Series(dtype=float)


def compute_absolute_return(invested: float, current: float) -> float:
    return (current - invested) / invested if invested else 0.0


# ══════════════════════════════════════════════════════════════════════════════
# RISK METRICS
# ══════════════════════════════════════════════════════════════════════════════

def compute_sharpe(returns: pd.Series, rf: float = 0.065, ann: int = 252) -> Optional[float]:
    """Annualised Sharpe ratio."""
    if len(returns) < 2:
        return None
    fund_return = float(returns.mean() * ann)
    std_dev = float(returns.std() * np.sqrt(ann))
    if std_dev <= 0:
        return None
    sharpe_ratio = (fund_return - rf) / std_dev
    return sharpe_ratio


def compute_sortino(returns: pd.Series, rf: float = 0.065, ann: int = 252) -> Optional[float]:
    """Sortino ratio (downside deviation only)."""
    if len(returns) < 2:
        return None
    excess = returns - rf / ann
    down = excess[excess < 0]
    if down.empty:
        return None
    dd = float(np.sqrt((down ** 2).mean()) * np.sqrt(ann))
    return float(excess.mean() * ann / dd) if dd else None


def compute_max_drawdown(nav: pd.Series) -> float:
    """Maximum peak-to-trough drawdown (negative decimal)."""
    if nav.empty:
        return 0.0
    return float(((nav - nav.cummax()) / nav.cummax()).min())


def compute_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """Historical Value-at-Risk (positive = loss)."""
    return float(-np.percentile(returns.dropna(), (1 - confidence) * 100)) if not returns.empty else 0.0


def compute_calmar(returns: pd.Series, nav: pd.Series, ann: int = 252) -> Optional[float]:
    """Annual return / |max drawdown|."""
    mdd = abs(compute_max_drawdown(nav))
    return float(returns.mean() * ann / mdd) if mdd else None


# ══════════════════════════════════════════════════════════════════════════════
# FACTOR / REGRESSION METRICS
# ══════════════════════════════════════════════════════════════════════════════

def _ols(port: pd.Series, bench: pd.Series, rf: float = 0.065, ann: int = 252) -> dict:
    """Shared OLS regression: excess_port = α + β·excess_bench + ε."""
    df = pd.DataFrame({"rp": port, "rb": bench}).dropna()
    if len(df) < 5:
        return {}
    
    # Compute Beta
    mean_p = df["rp"].mean()
    mean_b = df["rb"].mean()
    cov_pb = df["rp"].cov(df["rb"])
    var_b = df["rb"].var()
    beta = float(cov_pb / var_b) if var_b > 0 else 1.0
    
    # Annualized arithmetic returns
    fund_return = float(mean_p * ann)
    market_return = float(mean_b * ann)
    
    # Jensen's Alpha using CAPM expected return formula: expected_return = rf + beta * (market_return - rf)
    # Expressed as a percentage (multiplied by 100)
    expected_return = rf + beta * (market_return - rf)
    jensen_alpha = (fund_return - expected_return) * 100
    
    active = df["rp"] - df["rb"]
    ss_tot = np.sum((df["rp"] - mean_p) ** 2)
    
    # R-squared calculation
    daily_rf = rf / ann
    ep, eb = df["rp"] - daily_rf, df["rb"] - daily_rf
    X = np.column_stack([np.ones(len(eb)), eb.values])
    try:
        coeffs, *_ = np.linalg.lstsq(X, ep.values, rcond=None)
        y_pred = X @ coeffs
        ss_res = np.sum((ep.values - y_pred) ** 2)
        r_squared = float(1 - ss_res / ss_tot) if ss_tot else 0.0
    except Exception:
        r_squared = 0.0

    return {
        "alpha": jensen_alpha,
        "beta": beta,
        "r_squared": r_squared,
        "tracking_error": float(active.std() * np.sqrt(ann)),
    }


def compute_alpha(port: pd.Series, bench: pd.Series, rf: float = 0.065) -> Optional[float]:
    return _ols(port, bench, rf).get("alpha")


def compute_beta(port: pd.Series, bench: pd.Series, rf: float = 0.065) -> Optional[float]:
    return _ols(port, bench, rf).get("beta")


def compute_tracking_error(port: pd.Series, bench: pd.Series) -> Optional[float]:
    active = (port - bench).dropna()
    return float(active.std() * np.sqrt(252)) if len(active) >= 2 else None


def compute_information_ratio(port: pd.Series, bench: pd.Series, ann: int = 252) -> Optional[float]:
    active = (port - bench).dropna()
    if len(active) < 5 or not active.std():
        return None
    fund_return = float(port.mean() * ann)
    benchmark_return = float(bench.mean() * ann)
    active_return = fund_return - benchmark_return
    tracking_error = float(active.std() * np.sqrt(ann))
    if tracking_error <= 0:
        return None
    information_ratio = active_return / tracking_error
    return information_ratio


# ══════════════════════════════════════════════════════════════════════════════
# PORTFOLIO-LEVEL METRICS
# ══════════════════════════════════════════════════════════════════════════════

def compute_active_share(port_weights: dict[str, float], bench_weights: dict[str, float]) -> float:
    """
    Active Share = ½ Σ |w_p,i − w_b,i|  (range 0–1).
    Keys = fund or sector identifiers, values = decimal weights summing to 1.
    """
    all_keys = set(port_weights) | set(bench_weights)
    return 0.5 * sum(abs(port_weights.get(k, 0) - bench_weights.get(k, 0)) for k in all_keys)


def compute_concentration_risk(weights: list[float], top_n: int = 5) -> dict:
    """
    Returns HHI and top-N concentration from a list of holding weights (decimals).
    HHI ∈ [0, 10000]; top_n_pct ∈ [0, 1].
    """
    w = sorted(weights, reverse=True)
    hhi = sum(x ** 2 for x in w) * 10000
    top_n_pct = sum(w[:top_n])
    return {"hhi": round(hhi, 2), f"top_{top_n}_pct": round(top_n_pct, 4), "num_holdings": len(w)}


def compute_updown_capture(port: pd.Series, bench: pd.Series) -> dict:
    """Up/Down capture ratios."""
    df = pd.DataFrame({"rp": port, "rb": bench}).dropna()
    if len(df) < 5:
        return {"up_capture": None, "down_capture": None}
    up, dn = df[df["rb"] > 0], df[df["rb"] < 0]
    return {
        "up_capture": float(up["rp"].mean() / up["rb"].mean()) if not up.empty and up["rb"].mean() else None,
        "down_capture": float(dn["rp"].mean() / dn["rb"].mean()) if not dn.empty and dn["rb"].mean() else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# AGGREGATE HELPER
# ══════════════════════════════════════════════════════════════════════════════

def compute_all_risk_metrics(
    port_returns: pd.Series,
    bench_returns: pd.Series,
    nav_series: pd.Series,
    rf: float = 0.065,
) -> dict:
    """One-call to compute every risk metric. Returns a flat dict."""
    ols = _ols(port_returns, bench_returns, rf)
    cap = compute_updown_capture(port_returns, bench_returns)
    return {
        "sharpe_ratio": compute_sharpe(port_returns, rf),
        "sortino_ratio": compute_sortino(port_returns, rf),
        "max_drawdown": compute_max_drawdown(nav_series),
        "var_95": compute_var(port_returns),
        "calmar_ratio": compute_calmar(port_returns, nav_series),
        "beta": ols.get("beta"),
        "alpha": ols.get("alpha"),
        "tracking_error": ols.get("tracking_error"),
        "r_squared": ols.get("r_squared"),
        "information_ratio": compute_information_ratio(port_returns, bench_returns),
        "up_capture": cap.get("up_capture"),
        "down_capture": cap.get("down_capture"),
    }
