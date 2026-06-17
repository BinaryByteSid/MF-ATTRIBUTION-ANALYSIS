from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.crud.user import user as crud_user
from app.dependencies import get_current_active_user, get_db
from app.models.user import AuditLog, RefreshToken, User
from app.schemas.auth import (
    AccessToken,
    LoginRequest,
    PasswordChange,
    RefreshRequest,
    Token,
)
from app.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    existing = await crud_user.get_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    new_user = await crud_user.create(db, obj_in=body)
    return new_user


@router.post("/login", response_model=Token)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and receive access + refresh tokens."""
    user = await crud_user.authenticate(db, email=body.email, password=body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token_data = {"sub": str(user.id), "email": user.email, "role": user.role}
    access_token = security.create_access_token(token_data)
    refresh_token = security.create_refresh_token(token_data)

    # Store refresh token hash
    token_hash = security.hash_token(refresh_token)
    payload = security.decode_token(refresh_token)
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    db_token = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)

    # Audit log
    log = AuditLog(
        user_id=user.id,
        action="user_login",
        entity="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AccessToken)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a new access token (token rotation)."""
    try:
        payload = security.decode_token(body.refresh_token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token is not a refresh token")

    token_hash = security.hash_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    db_token = result.scalar_one_or_none()
    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")

    # Fetch user
    result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Revoke old token
    db_token.revoked = True
    db.add(db_token)

    # Issue new access token only (stateless rotation)
    token_data = {"sub": str(user.id), "email": user.email, "role": user.role}
    new_access = security.create_access_token(token_data)

    await db.commit()
    return AccessToken(access_token=new_access)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all refresh tokens for the current user."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.commit()


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile (name only; role changes require admin)."""
    update_data = body.model_dump(exclude_unset=True)
    # Non-admins cannot change role
    if "role" in update_data and current_user.role != "admin":
        del update_data["role"]
    updated = await crud_user.update(db, db_obj=current_user, obj_in=update_data)
    return updated


@router.post("/change-password")
async def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password; revokes all existing refresh tokens."""
    from app.core.security import verify_password

    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    await crud_user.update_password(db, user=current_user, new_password=body.new_password)

    # Revoke all refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id)
        .values(revoked=True)
    )
    await db.commit()
    return {"message": "Password updated successfully"}
