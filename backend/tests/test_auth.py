from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_user(client: AsyncClient):
    email = f"reg_{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "securepassword1", "full_name": "New User"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert data["role"] == "investor"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, test_user):
    user_data, _ = test_user
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": user_data["email"], "password": "anotherpassword1"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    email = f"login_{uuid.uuid4().hex[:8]}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "loginpassword1"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "loginpassword1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    email = f"wrong_{uuid.uuid4().hex[:8]}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correctpassword1"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, test_user):
    _, headers = test_user
    resp = await client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "email" in data
    assert "id" in data


@pytest.mark.asyncio
async def test_get_me_no_auth(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    email = f"refresh_{uuid.uuid4().hex[:8]}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "refreshpass123"},
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "refreshpass123"},
    )
    tokens = login_resp.json()

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, test_user):
    _, headers = test_user
    resp = await client.post("/api/v1/auth/logout", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient):
    email = f"chgpw_{uuid.uuid4().hex[:8]}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "oldpassword12"},
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "oldpassword12"},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "oldpassword12", "new_password": "newpassword12"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify new password works
    resp2 = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "newpassword12"},
    )
    assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_workflow(client: AsyncClient):
    email = f"forgot_{uuid.uuid4().hex[:8]}@test.com"
    question = "What is your mother's maiden name?"
    answer = "Smith"
    
    # Register with security question
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "oldpassword12",
            "security_question": question,
            "security_answer": answer
        },
    )
    
    # Verify email
    resp_verify = await client.post(
        "/api/v1/auth/forgot-password/verify",
        json={"email": email}
    )
    assert resp_verify.status_code == 200
    assert resp_verify.json()["security_question"] == question
    
    # Reset password fails with wrong answer
    resp_reset_fail = await client.post(
        "/api/v1/auth/forgot-password/reset",
        json={
            "email": email,
            "security_question": question,
            "security_answer": "WrongAnswer",
            "new_password": "newpassword12"
        }
    )
    assert resp_reset_fail.status_code == 400
    
    # Reset password succeeds with correct answer
    resp_reset_success = await client.post(
        "/api/v1/auth/forgot-password/reset",
        json={
            "email": email,
            "security_question": question,
            "security_answer": "smith",  # case-insensitive check
            "new_password": "newpassword12"
        }
    )
    assert resp_reset_success.status_code == 200
    
    # Verify login works with new password
    resp_login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "newpassword12"}
    )
    assert resp_login.status_code == 200
