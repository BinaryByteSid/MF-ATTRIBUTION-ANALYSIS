from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.user import user as crud_user
from app.dependencies import get_db, require_role
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter()

admin_only = require_role("admin")


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    """List all users (admin only)."""
    return await crud_user.get_multi(db, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    """Get a user by ID (admin only)."""
    u = await crud_user.get(db, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    """Update a user's role, active status, or name (admin only)."""
    u = await crud_user.get(db, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return await crud_user.update(db, db_obj=u, obj_in=body)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    """Deactivate a user account (soft delete, admin only)."""
    u = await crud_user.get(db, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    await crud_user.update(db, db_obj=u, obj_in={"is_active": False})
