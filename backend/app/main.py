"""FastAPI application entrypoint."""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .database import init_db
from .routers import appointments, auth_router, encounters, meta, patients, users

app = FastAPI(
    title=config.APP_NAME,
    version=config.APP_VERSION,
    description="MVP1 — Foundation: auth/RBAC, Master Patient Index, and SOAP clinical charting.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    # First-boot seed (demo): populate an empty database so the app comes up ready.
    if os.environ.get("SEED_ON_START", "1") == "1":
        from . import models
        from .database import SessionLocal

        db = SessionLocal()
        try:
            empty = db.query(models.User).count() == 0
        finally:
            db.close()
        if empty:
            from .seed import seed

            seed()


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "app": config.APP_NAME, "version": config.APP_VERSION}


# All API routes are served under /api.
app.include_router(auth_router.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(encounters.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(meta.router, prefix="/api")


# --- Serve the built frontend (production single-container) --------------------
# In dev this directory is absent (Vite serves the UI); in the Docker image the
# built React app is copied to ./static and served here on the same origin, so
# the frontend's relative /api calls work with no CORS or proxy.
_STATIC_DIR = os.environ.get(
    "FRONTEND_DIR", os.path.join(os.path.dirname(__file__), "..", "static")
)
if os.path.isdir(_STATIC_DIR):
    _assets = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        target = os.path.join(_STATIC_DIR, full_path)
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(_STATIC_DIR, "index.html"))
