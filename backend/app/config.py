"""Application configuration. Env-driven with safe dev defaults."""
from __future__ import annotations

import os

# --- Core ---
APP_NAME = "National EMR/EHR Platform"
APP_VERSION = "0.1.0"

# --- Security ---
# NOTE: dev default only. Set SECRET_KEY in the environment for any real deployment.
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8h shift

# --- Database ---
# Default: SQLite file next to the backend. Swap DATABASE_URL for Postgres in prod.
_DEFAULT_SQLITE = "sqlite:///./emr.db"
DATABASE_URL = os.environ.get("DATABASE_URL", _DEFAULT_SQLITE)

# --- CORS (frontend dev server) ---
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
