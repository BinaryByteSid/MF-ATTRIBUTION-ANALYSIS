from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_portfolio(client: AsyncClient, test_user):
    _, headers = test_user
    resp = await client.post(
        "/api/v1/portfolios",
        json={"name": "My Equity Portfolio", "description": "Aggressive growth"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Equity Portfolio"
    assert data["currency"] == "INR"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_portfolios(client: AsyncClient, test_user, test_portfolio):
    _, headers = test_user
    resp = await client.get("/api/v1/portfolios", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_portfolio(client: AsyncClient, test_user, test_portfolio):
    _, headers = test_user
    pid = test_portfolio["id"]
    resp = await client.get(f"/api/v1/portfolios/{pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == pid


@pytest.mark.asyncio
async def test_get_portfolio_unauthorized(client: AsyncClient, test_portfolio):
    """Try to access a portfolio without auth."""
    pid = test_portfolio["id"]
    resp = await client.get(f"/api/v1/portfolios/{pid}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_portfolio(client: AsyncClient, test_user, test_portfolio):
    _, headers = test_user
    pid = test_portfolio["id"]
    resp = await client.patch(
        f"/api/v1/portfolios/{pid}",
        json={"name": "Updated Portfolio Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Portfolio Name"


@pytest.mark.asyncio
async def test_delete_portfolio(client: AsyncClient, test_user):
    _, headers = test_user
    # Create a portfolio to delete
    create_resp = await client.post(
        "/api/v1/portfolios",
        json={"name": "To Delete"},
        headers=headers,
    )
    pid = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/portfolios/{pid}", headers=headers)
    assert resp.status_code == 204

    # Confirm deletion
    get_resp = await client.get(f"/api/v1/portfolios/{pid}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_portfolio_summary(client: AsyncClient, test_user, test_portfolio):
    _, headers = test_user
    pid = test_portfolio["id"]
    resp = await client.get(f"/api/v1/portfolios/{pid}/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_value" in data
    assert "total_invested" in data
    assert "portfolio_id" in data


@pytest.mark.asyncio
async def test_add_transaction(client: AsyncClient, test_user, test_portfolio, sample_fund):
    _, headers = test_user
    pid = test_portfolio["id"]
    resp = await client.post(
        "/api/v1/transactions",
        json={
            "portfolio_id": pid,
            "fund_id": str(sample_fund.id),
            "txn_type": "purchase",
            "txn_date": date.today().isoformat(),
            "units": "100.0000",
            "nav_at_txn": "50.0000",
            "amount": "5000.00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["txn_type"] == "purchase"
    assert data["portfolio_id"] == pid


@pytest.mark.asyncio
async def test_holdings_after_transaction(client: AsyncClient, test_user, test_portfolio, sample_fund):
    _, headers = test_user
    pid = test_portfolio["id"]

    # Add a purchase
    await client.post(
        "/api/v1/transactions",
        json={
            "portfolio_id": pid,
            "fund_id": str(sample_fund.id),
            "txn_type": "purchase",
            "txn_date": date.today().isoformat(),
            "units": "200.0000",
            "nav_at_txn": "55.0000",
            "amount": "11000.00",
        },
        headers=headers,
    )

    # Check holdings
    resp = await client.get(f"/api/v1/portfolios/{pid}/holdings", headers=headers)
    assert resp.status_code == 200
    holdings = resp.json()
    assert isinstance(holdings, list)
    # Should have at least one holding for sample_fund
    fund_ids = [h["fund_id"] for h in holdings]
    assert str(sample_fund.id) in fund_ids


@pytest.mark.asyncio
async def test_cross_user_portfolio_access(client: AsyncClient, test_user, test_portfolio):
    """A second user should not be able to access the first user's portfolio."""
    # Register second user
    email2 = f"user2_{uuid.uuid4().hex[:8]}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email2, "password": "user2password1"},
    )
    login2 = await client.post(
        "/api/v1/auth/login",
        json={"email": email2, "password": "user2password1"},
    )
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}

    pid = test_portfolio["id"]
    resp = await client.get(f"/api/v1/portfolios/{pid}", headers=headers2)
    assert resp.status_code == 403
