from __future__ import annotations

import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.base import Base
from app.dependencies import get_db
from app.main import app
from app.db.session import database_url

settings = get_settings()

# Use the same resolved DB (with fallback logic) for tests.
# If SQLite is used, write to a separate test.sqlite3 file to isolate test runs.
TEST_DATABASE_URL = database_url
if "sqlite" in TEST_DATABASE_URL:
    TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.sqlite3"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """Create all tables at the start of the test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(client: AsyncClient):
    """Register a test user and return (user_data, auth_headers)."""
    email = f"testuser_{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpassword123", "full_name": "Test User"},
    )
    assert resp.status_code == 201
    user_data = resp.json()

    # Login to get token
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    return user_data, headers


@pytest_asyncio.fixture
async def test_admin(client: AsyncClient, db: AsyncSession):
    """Create an admin user and return (user_data, auth_headers)."""
    from app.models.user import User
    from app.core.security import get_password_hash

    email = f"admin_{uuid.uuid4().hex[:8]}@test.com"
    admin = User(
        email=email,
        hashed_password=get_password_hash("adminpassword123"),
        full_name="Admin User",
        role="admin",
        is_active=True,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "adminpassword123"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    user_data = {"id": str(admin.id), "email": email, "role": "admin"}
    return user_data, headers


@pytest_asyncio.fixture
async def test_portfolio(client: AsyncClient, test_user):
    """Create a test portfolio for the test user."""
    user_data, headers = test_user
    resp = await client.post(
        "/api/v1/portfolios",
        json={"name": "Test Portfolio", "description": "For testing"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def sample_fund(db: AsyncSession):
    """Create a test fund record."""
    from app.models.fund import Fund

    fund = Fund(
        isin=f"INF{uuid.uuid4().hex[:8].upper()}",
        amfi_code=str(uuid.uuid4().int)[:6],
        scheme_name="Test Equity Fund - Direct Growth",
        amc="Test AMC",
        fund_type="direct",
        is_active=True,
    )
    db.add(fund)
    await db.commit()
    await db.refresh(fund)
    return fund
