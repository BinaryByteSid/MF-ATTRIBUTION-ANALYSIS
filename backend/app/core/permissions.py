from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.models.user import User


class RoleChecker:
    """Dependency that checks the current user's role."""

    def __init__(self, allowed_roles: list[str]) -> None:
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends()) -> User:
        # Import here to avoid circular dependency
        from app.dependencies import get_current_active_user
        # This class is used as a dependency factory; see usage below.
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of roles: {self.allowed_roles}",
            )
        return current_user


def require_role(*roles: str):
    """
    Returns a FastAPI dependency that enforces role membership.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role("admin"))])
    """
    from app.dependencies import get_current_active_user

    async def checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of roles: {list(roles)}",
            )
        return current_user

    return checker


# Convenience shortcuts
allow_admin = require_role("admin")
allow_analyst = require_role("admin", "analyst")
allow_all = require_role("admin", "analyst", "investor")
