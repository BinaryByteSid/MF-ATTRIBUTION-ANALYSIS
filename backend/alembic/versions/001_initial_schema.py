"""initial schema — all tables

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. asset_classes
    op.create_table(
        "asset_classes",
        sa.Column("id", sa.SmallInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
    )

    # 2. fund_categories
    op.create_table(
        "fund_categories",
        sa.Column("id", sa.SmallInteger, primary_key=True, autoincrement=True),
        sa.Column("asset_class_id", sa.SmallInteger, sa.ForeignKey("asset_classes.id"), nullable=False),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
    )

    # 3. benchmarks
    op.create_table(
        "benchmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("ticker", sa.String(30), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
    )

    # 4. users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="investor"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'analyst', 'investor')", name="ck_user_role"),
    )

    # 5. refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 6. funds
    op.create_table(
        "funds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("isin", sa.String(20), unique=True, index=True, nullable=False),
        sa.Column("amfi_code", sa.String(10), unique=True, nullable=True),
        sa.Column("scheme_name", sa.String(255), index=True, nullable=False),
        sa.Column("amc", sa.String(100), nullable=True),
        sa.Column("category_id", sa.SmallInteger, sa.ForeignKey("fund_categories.id"), nullable=True),
        sa.Column("benchmark_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("benchmarks.id"), nullable=True),
        sa.Column("expense_ratio", sa.Numeric(5, 4), nullable=True),
        sa.Column("fund_type", sa.String(10), nullable=False, server_default="regular"),
        sa.Column("launch_date", sa.Date, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("fund_type IN ('regular', 'direct')", name="ck_fund_type"),
    )

    # 7. portfolios
    op.create_table(
        "portfolios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("benchmark_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("benchmarks.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 8. transactions
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fund_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("funds.id"), nullable=False),
        sa.Column("txn_type", sa.String(20), nullable=False),
        sa.Column("txn_date", sa.Date, nullable=False),
        sa.Column("units", sa.Numeric(14, 4), nullable=False),
        sa.Column("nav_at_txn", sa.Numeric(14, 4), nullable=False),
        sa.Column("amount", sa.Numeric(16, 2), nullable=False),
        sa.Column("folio_number", sa.String(50), nullable=True),
        sa.Column("stamp_duty", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("exit_load", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("stcg_tax", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("ltcg_tax", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "txn_type IN ('purchase', 'redemption', 'sip', 'switch_in', 'switch_out', 'dividend')",
            name="ck_txn_type",
        ),
    )
    op.create_index("idx_txn_portfolio", "transactions", ["portfolio_id"])
    op.create_index("idx_txn_fund_date", "transactions", ["fund_id", "txn_date"])

    # 9. nav_history
    op.create_table(
        "nav_history",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("fund_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("funds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nav_date", sa.Date, nullable=False),
        sa.Column("nav", sa.Numeric(14, 4), nullable=False),
        sa.UniqueConstraint("fund_id", "nav_date", name="uq_nav_fund_date"),
    )
    op.create_index("idx_nav_fund_date", "nav_history", ["fund_id", "nav_date"])

    # 10. benchmark_returns
    op.create_table(
        "benchmark_returns",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("benchmark_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("benchmarks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("return_date", sa.Date, nullable=False),
        sa.Column("daily_return", sa.Numeric(10, 6), nullable=False),
        sa.UniqueConstraint("benchmark_id", "return_date", name="uq_benchmark_return_date"),
    )
    op.create_index("idx_benchmark_date", "benchmark_returns", ["benchmark_id", "return_date"])

    # 11. holdings
    op.create_table(
        "holdings",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fund_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("funds.id"), nullable=False),
        sa.Column("units", sa.Numeric(14, 4), nullable=False),
        sa.Column("avg_nav", sa.Numeric(14, 4), nullable=False),
        sa.Column("current_nav", sa.Numeric(14, 4), nullable=True),
        sa.Column("current_value", sa.Numeric(18, 2), nullable=True),
        sa.Column("weight", sa.Numeric(6, 4), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("portfolio_id", "fund_id", name="uq_holding_portfolio_fund"),
    )
    op.create_index("idx_holding_portfolio", "holdings", ["portfolio_id"])

    # 12. portfolio_snapshots
    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("snapshot_date", sa.Date, nullable=False),
        sa.Column("total_value", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_invested", sa.Numeric(18, 2), nullable=False),
        sa.Column("daily_pnl", sa.Numeric(16, 2), nullable=True),
        sa.UniqueConstraint("portfolio_id", "snapshot_date", name="uq_snapshot_portfolio_date"),
    )

    # 13. attribution_results
    op.create_table(
        "attribution_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("benchmark_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("benchmarks.id"), nullable=True),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("method", sa.String(30), nullable=False),
        sa.Column("total_return", sa.Numeric(10, 6), nullable=True),
        sa.Column("benchmark_return", sa.Numeric(10, 6), nullable=True),
        sa.Column("active_return", sa.Numeric(10, 6), nullable=True),
        sa.Column("allocation_effect", sa.Numeric(10, 6), nullable=True),
        sa.Column("selection_effect", sa.Numeric(10, 6), nullable=True),
        sa.Column("interaction_effect", sa.Numeric(10, 6), nullable=True),
        sa.Column("result_json", postgresql.JSONB, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("portfolio_id", "period_start", "period_end", "method", name="uq_attribution_portfolio_period_method"),
        sa.CheckConstraint("method IN ('brinson', 'factor', 'carino', 'geometric')", name="ck_attribution_method"),
    )
    op.create_index("idx_attr_portfolio", "attribution_results", ["portfolio_id", "period_end"])

    # 14. audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity", sa.String(50), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("attribution_results")
    op.drop_table("portfolio_snapshots")
    op.drop_table("holdings")
    op.drop_table("benchmark_returns")
    op.drop_table("nav_history")
    op.drop_table("transactions")
    op.drop_table("portfolios")
    op.drop_table("funds")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("benchmarks")
    op.drop_table("fund_categories")
    op.drop_table("asset_classes")
