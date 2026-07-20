"""Authentication & authorization: password hashing, JWT, RBAC dependencies."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import RoleName, User

# pbkdf2_sha256 is pure-Python — no native bcrypt backend needed, so it installs
# and runs cleanly across environments (incl. this Windows/anaconda setup).
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(user: User) -> str:
    expire = datetime.utcnow() + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": expire,
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = creds.credentials
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, config.SECRET_KEY, algorithms=[config.JWT_ALGORITHM]
        )
        user_id = int(payload.get("sub", 0))
    except (jwt.PyJWTError, ValueError):
        raise invalid

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise invalid
    return user


def require_roles(*roles: str):
    """Dependency factory: allow only the given roles (admin always allowed)."""
    allowed: Iterable[str] = set(roles) | {RoleName.ADMIN}

    def _checker(current: User = Depends(get_current_user)) -> User:
        if current.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role is not permitted to perform this action",
            )
        return current

    return _checker


def require_admin(current: User = Depends(get_current_user)) -> User:
    """Admin-only actions (e.g. registering staff/doctors)."""
    if current.role != RoleName.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required for this action",
        )
    return current


# --- Permission-based enforcement (RB-01/04/07/08) ----------------------------
def effective_permissions(user: User) -> set:
    """The user's effective permission codes, resolved from their role (data)."""
    return user.permission_codes()


def has_permission(user: User, *codes: str) -> bool:
    perms = effective_permissions(user)
    return any(c in perms for c in codes)


def user_scope_label(user: User) -> str:
    if user.scope_level == "National":
        return "National"
    if user.scope_level == "County":
        return f"County: {user.scope_county or '—'}"
    return f"Facility #{user.facility_id or '—'}"


def audit(db: Session, user, action: str, *, entity: str = "", entity_id=None,
          patient_id=None, decision: str = "allow", detail: str = "") -> None:
    """Write an append-only audit entry (AU-01). Best-effort; never blocks the request."""
    from .models import AuditLog
    db.add(AuditLog(
        user_id=getattr(user, "id", None),
        username=getattr(user, "username", ""),
        role=getattr(user, "role", ""),
        scope=user_scope_label(user) if user else "",
        action=action, entity=entity, entity_id=entity_id,
        patient_id=patient_id, decision=decision, detail=detail,
    ))


def require_permission(*codes: str):
    """Dependency factory enforcing that the user holds at least one of `codes`
    (deny-by-default, RB-07). Enforcement reads the role's permissions from the
    DB (RB-06/RB-08). On denial: 403 + audit entry."""
    def _checker(
        current: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(current, *codes):
            audit(db, current, action="permission_denied",
                  detail=f"required: {', '.join(codes)}", decision="deny")
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission ({' or '.join(codes)})",
            )
        return current
    return _checker


# Common role gates (kept for scoping-heavy endpoints; permission gates preferred).
require_clinical = require_roles(RoleName.PHYSICIAN, RoleName.NURSE)
require_registration = require_roles(RoleName.FRONT_DESK, RoleName.PHYSICIAN, RoleName.NURSE)
