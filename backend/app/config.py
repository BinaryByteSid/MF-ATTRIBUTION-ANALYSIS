from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://mfuser:secret@127.0.0.1:5432/mf_attribution"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://mfuser:secret@127.0.0.1:5432/mf_attribution"

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ──────────────────────────────────────────────────────────────────
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    # ── External Data ─────────────────────────────────────────────────────────
    AMFI_NAV_URL: str = "https://www.amfiindia.com/spages/NAVAll.txt"

    # ── Seed Admin ────────────────────────────────────────────────────────────
    FIRST_SUPERUSER_EMAIL: str = "admin@mfattribution.com"
    FIRST_SUPERUSER_PASSWORD: str = "changeme123"

    # ── App ───────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "MF Portfolio Attribution Platform"
    API_V1_STR: str = "/api/v1"

    # ── Reports ───────────────────────────────────────────────────────────────
    REPORTS_DIR: str = os.path.join(tempfile.gettempdir(), "mf_reports")

    # ── OpenRouter ────────────────────────────────────────────────────────────
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_MODEL: str = "google/gemini-2.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
