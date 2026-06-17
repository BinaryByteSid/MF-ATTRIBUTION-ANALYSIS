from __future__ import annotations
from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    email: str
    role: str
    jti: str
    exp: int
    type: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    model_config = {"str_min_length": 0}

    def __init__(self, **data):
        super().__init__(**data)
        if len(self.new_password) < 8:
            raise ValueError("new_password must be at least 8 characters")
