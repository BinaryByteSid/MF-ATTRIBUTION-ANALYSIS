from fastapi import APIRouter

from app.api.v1 import auth, users, portfolios, funds, transactions, attribution, benchmarks, reports, copilot

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(portfolios.router, prefix="/portfolios", tags=["Portfolios"])
api_router.include_router(funds.router, prefix="/funds", tags=["Funds"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["Transactions"])
api_router.include_router(attribution.router, prefix="/attribution", tags=["Attribution"])
api_router.include_router(benchmarks.router, prefix="/benchmarks", tags=["Benchmarks"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(copilot.router, prefix="/copilot", tags=["AI Copilot"])
