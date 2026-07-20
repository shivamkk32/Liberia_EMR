"""Admin console: user management (role + location scope), role/permission
editing (RBAC-as-data), permission catalog, and the audit viewer."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db

router = APIRouter(tags=["admin"])


def _role_by_key(db: Session, key: str) -> Optional[models.Role]:
    return db.query(models.Role).filter(models.Role.key == key).first()


# --- Admin dashboard (organization-level statistics) --------------------------
@router.get("/admin/overview", response_model=schemas.AdminOverview)
def admin_overview(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("user.edit", "user.create", "audit.view")),
):
    from datetime import datetime, timedelta
    now = datetime.utcnow()

    users = db.query(models.User).all()
    roles = db.query(models.Role).order_by(models.Role.name).all()
    role_names = {r.key: r.name for r in roles}

    role_counts = {}
    dept_counts = {}
    for u in users:
        role_counts[u.role] = role_counts.get(u.role, 0) + 1
        if u.role == models.RoleName.PHYSICIAN:
            d = u.department or "Unassigned"
            dept_counts[d] = dept_counts.get(d, 0) + 1

    upcoming = (
        db.query(models.Appointment)
        .filter(models.Appointment.scheduled_at >= now,
                models.Appointment.scheduled_at <= now + timedelta(days=7),
                models.Appointment.status == "Scheduled")
        .count()
    )
    recent_users = db.query(models.User).order_by(models.User.created_at.desc()).limit(6).all()
    recent_activity = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.action.in_(
            ["create_user", "edit_user", "edit_role", "create_role",
             "deactivate_user", "reactivate_user", "permission_denied"]))
        .order_by(models.AuditLog.timestamp.desc()).limit(10).all()
    )

    return schemas.AdminOverview(
        total_users=len(users),
        active_users=sum(1 for u in users if u.is_active),
        inactive_users=sum(1 for u in users if not u.is_active),
        total_doctors=role_counts.get(models.RoleName.PHYSICIAN, 0),
        total_patients=db.query(models.Patient).count(),
        total_appointments=db.query(models.Appointment).count(),
        upcoming_appointments=upcoming,
        total_encounters=db.query(models.Encounter).count(),
        total_facilities=db.query(models.Facility).count(),
        total_roles=len(roles),
        total_permissions=db.query(models.Permission).count(),
        pending_onboarding=sum(1 for u in users if u.must_change_password),
        denials_recent=db.query(models.AuditLog).filter(models.AuditLog.decision == "deny").count(),
        users_by_role=[schemas.RoleCount(key=k, name=role_names.get(k, k), count=v)
                       for k, v in sorted(role_counts.items(), key=lambda kv: -kv[1])],
        doctors_by_department=[schemas.DeptCount(department=d, count=c)
                               for d, c in sorted(dept_counts.items(), key=lambda kv: -kv[1])],
        recent_users=[serializers.user_read(u) for u in recent_users],
        recent_activity=[serializers.audit_read(db, a) for a in recent_activity],
    )


# --- Users --------------------------------------------------------------------
@router.get("/users", response_model=List[schemas.UserRead])
def list_users(
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("user.create", "user.edit")),
):
    q = db.query(models.User)
    # Facility Admin manages only within their facility (AD-05).
    if current.role == models.RoleName.FACILITY_ADMIN and current.facility_id:
        q = q.filter(models.User.facility_id == current.facility_id)
    rows = q.order_by(models.User.full_name).all()
    return [serializers.user_read(u) for u in rows]


@router.post("/users", response_model=schemas.UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.StaffCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("user.create")),
):
    role = _role_by_key(db, payload.role)
    if role is None:
        raise HTTPException(status_code=422, detail=f"Unknown role: {payload.role}")
    # Facility Admin cannot grant national scope or create outside their facility (AD-05).
    if current.role == models.RoleName.FACILITY_ADMIN:
        if payload.scope_level == "National":
            raise HTTPException(status_code=403, detail="Facility Admin cannot grant national scope")
        payload.facility_id = current.facility_id

    username = payload.username.strip().lower()
    email = str(payload.email).strip().lower()
    if db.query(models.User).filter(
        or_(models.User.username == username, models.User.email == email)
    ).first():
        raise HTTPException(status_code=409, detail="Username or email already in use")

    user = models.User(
        username=username, full_name=payload.full_name.strip(), email=email,
        credentials=payload.credentials.strip(), role=role.key, role_id=role.id,
        department=payload.department.strip(),
        facility_id=payload.facility_id or current.facility_id,
        scope_level=payload.scope_level or "Facility", scope_county=payload.scope_county,
        hashed_password=auth.hash_password(payload.password),
        is_active=True, must_change_password=True,
    )
    db.add(user)
    db.flush()
    auth.audit(db, current, action="create_user", entity="user", entity_id=user.id,
               detail=f"{user.full_name} ({role.key}) @ {auth.user_scope_label(user)}")
    db.commit()
    db.refresh(user)
    return serializers.user_read(user)


@router.patch("/users/{user_id}", response_model=schemas.UserRead)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("user.edit")),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"]:
        role = _role_by_key(db, data["role"])
        if role is None:
            raise HTTPException(status_code=422, detail=f"Unknown role: {data['role']}")
        user.role = role.key
        user.role_id = role.id
        data.pop("role")
    for field, value in data.items():
        setattr(user, field, value)
    auth.audit(db, current, action="edit_user", entity="user", entity_id=user.id,
               detail=", ".join(f"{k}={v}" for k, v in payload.model_dump(exclude_unset=True).items()))
    db.commit()
    db.refresh(user)
    return serializers.user_read(user)


@router.post("/users/{user_id}/deactivate", response_model=schemas.UserRead)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("user.deactivate")),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=422, detail="You cannot deactivate your own account")
    user.is_active = not user.is_active  # toggle (deactivate/reactivate)
    auth.audit(db, current, action="deactivate_user" if not user.is_active else "reactivate_user",
               entity="user", entity_id=user.id, detail=user.full_name)
    db.commit()
    db.refresh(user)
    return serializers.user_read(user)


# --- Permission catalog & roles (RBAC-as-data) --------------------------------
@router.get("/permissions", response_model=List[schemas.PermissionRead])
def list_permissions(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("permission.view_catalog", "role.edit")),
):
    rows = db.query(models.Permission).order_by(models.Permission.domain, models.Permission.code).all()
    return [schemas.PermissionRead.model_validate(p) for p in rows]


@router.get("/roles", response_model=List[schemas.RoleRead])
def list_roles(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("permission.view_catalog", "role.edit", "role.assign")),
):
    rows = db.query(models.Role).order_by(models.Role.name).all()
    return [serializers.role_read(r) for r in rows]


@router.post("/roles", response_model=schemas.RoleRead, status_code=201)
def create_role(
    payload: schemas.RoleCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("role.create")),
):
    if _role_by_key(db, payload.key):
        raise HTTPException(status_code=409, detail="Role key already exists")
    role = models.Role(key=payload.key.strip(), name=payload.name.strip(),
                       description=payload.description, is_system=False)
    _set_role_permissions(db, role, payload.permissions)
    db.add(role)
    db.flush()
    auth.audit(db, current, action="create_role", entity="role", entity_id=role.id, detail=role.key)
    db.commit()
    db.refresh(role)
    return serializers.role_read(role)


@router.patch("/roles/{role_id}", response_model=schemas.RoleRead)
def update_role(
    role_id: int,
    payload: schemas.RoleUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("role.edit")),
):
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if payload.name is not None:
        role.name = payload.name
    if payload.description is not None:
        role.description = payload.description
    if payload.permissions is not None:
        _set_role_permissions(db, role, payload.permissions)
    auth.audit(db, current, action="edit_role", entity="role", entity_id=role.id,
               detail=f"{role.key}: {len(role.permissions)} permissions")
    db.commit()
    db.refresh(role)
    return serializers.role_read(role)


def _set_role_permissions(db: Session, role: models.Role, codes: List[str]) -> None:
    perms = db.query(models.Permission).filter(models.Permission.code.in_(codes)).all()
    role.permissions = perms


# --- Audit viewer (AU-01/AU-02) ----------------------------------------------
@router.get("/audit", response_model=List[schemas.AuditRead])
def audit_viewer(
    user: Optional[str] = Query(None, description="username filter"),
    patient_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("audit.view")),
):
    q = db.query(models.AuditLog)
    if user:
        q = q.filter(models.AuditLog.username.ilike(f"%{user.strip()}%"))
    if patient_id:
        q = q.filter(models.AuditLog.patient_id == patient_id)
    if action:
        q = q.filter(models.AuditLog.action.ilike(f"%{action.strip()}%"))
    if date_from:
        q = q.filter(models.AuditLog.timestamp >= datetime(date_from.year, date_from.month, date_from.day))
    if date_to:
        q = q.filter(models.AuditLog.timestamp < datetime(date_to.year, date_to.month, date_to.day) + timedelta(days=1))
    rows = q.order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return [serializers.audit_read(db, r) for r in rows]
