# app.analytics — consolidated portfolio analytics
#
# metrics.py      → XIRR, CAGR, Sharpe, Sortino, Alpha, Beta, Tracking Error,
#                    Active Share, Concentration Risk, Max Drawdown, VaR, etc.
# attribution.py  → Brinson BHB (arithmetic + geometric) + pipeline orchestration

from app.analytics.metrics import (
    compute_xirr,
    compute_cagr,
    compute_twrr,
    compute_rolling_returns,
    compute_sharpe,
    compute_sortino,
    compute_max_drawdown,
    compute_var,
    compute_calmar,
    compute_alpha,
    compute_beta,
    compute_tracking_error,
    compute_information_ratio,
    compute_active_share,
    compute_concentration_risk,
    compute_updown_capture,
    compute_all_risk_metrics,
)
from app.analytics.attribution import (
    brinson_bhb,
    run_full_attribution,
    compute_portfolio_daily_returns,
    refresh_holdings,
)
