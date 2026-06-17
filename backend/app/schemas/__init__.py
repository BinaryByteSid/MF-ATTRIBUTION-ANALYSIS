"""
Schemas package — re-exports all public Pydantic schemas.
"""

from app.schemas.auth import (
    Token,
    TokenPayload,
    LoginRequest,
    RefreshRequest,
    PasswordChange,
)
from app.schemas.user import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserResponse,
    UserPublic,
)
from app.schemas.portfolio import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioResponse,
    HoldingResponse,
    PortfolioSummary,
    SnapshotResponse,
)
from app.schemas.fund import (
    AssetClassResponse,
    FundCategoryResponse,
    FundCreate,
    FundUpdate,
    FundResponse,
    FundDetail,
    NavHistoryResponse,
)
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    BulkTransactionCreate,
    TransactionImportRow,
)
from app.schemas.attribution import (
    AttributionRequest,
    BrinsonSegment,
    AttributionSummary,
    AttributionResponse,
    RiskMetrics,
)
from app.schemas.benchmark import (
    BenchmarkCreate,
    BenchmarkUpdate,
    BenchmarkResponse,
    BenchmarkReturnResponse,
)
from app.schemas.report import (
    ReportRequest,
    ReportJobResponse,
    ReportStatusResponse,
)

__all__ = [
    # auth
    "Token",
    "TokenPayload",
    "LoginRequest",
    "RefreshRequest",
    "PasswordChange",
    # user
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserPublic",
    # portfolio
    "PortfolioCreate",
    "PortfolioUpdate",
    "PortfolioResponse",
    "HoldingResponse",
    "PortfolioSummary",
    "SnapshotResponse",
    # fund
    "AssetClassResponse",
    "FundCategoryResponse",
    "FundCreate",
    "FundUpdate",
    "FundResponse",
    "FundDetail",
    "NavHistoryResponse",
    # transaction
    "TransactionCreate",
    "TransactionUpdate",
    "TransactionResponse",
    "BulkTransactionCreate",
    "TransactionImportRow",
    # attribution
    "AttributionRequest",
    "BrinsonSegment",
    "AttributionSummary",
    "AttributionResponse",
    "RiskMetrics",
    # benchmark
    "BenchmarkCreate",
    "BenchmarkUpdate",
    "BenchmarkResponse",
    "BenchmarkReturnResponse",
    # report
    "ReportRequest",
    "ReportJobResponse",
    "ReportStatusResponse",
]
