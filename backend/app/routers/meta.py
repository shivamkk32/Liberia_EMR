"""Reference data & dashboard: facilities, providers, ICD-10 search, stats."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db
from ..reference import ICD10_CATALOG, MEDICATION_CATALOG

router = APIRouter(tags=["reference"])


@router.get("/facilities", response_model=List[schemas.FacilityRead])
def list_facilities(db: Session = Depends(get_db)):
    rows = db.query(models.Facility).order_by(models.Facility.name).all()
    return [schemas.FacilityRead.model_validate(f) for f in rows]


@router.get("/providers", response_model=List[schemas.UserRead])
def list_providers(
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.User).filter(models.User.role.in_(list(models.RoleName.CLINICAL)))
    if department and department != "All":
        q = q.filter(models.User.department == department)
    rows = q.order_by(models.User.full_name).all()
    return [serializers.user_read(u) for u in rows]


@router.get("/departments", response_model=List[str])
def list_departments(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    rows = (
        db.query(models.User.department)
        .filter(models.User.role.in_(list(models.RoleName.CLINICAL)), models.User.department != "")
        .distinct()
        .all()
    )
    return sorted({r[0] for r in rows})


@router.get("/notifications", response_model=List[schemas.NotificationRead])
def list_notifications(
    category: Optional[str] = Query(None),
    patient_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.Notification).filter(
        or_(
            models.Notification.facility_id == current.facility_id,
            models.Notification.facility_id.is_(None),
        )
    )
    if category and category != "All":
        q = q.filter(models.Notification.category == category)
    if patient_id:
        q = q.filter(models.Notification.patient_id == patient_id)
    rows = q.order_by(models.Notification.created_at.desc()).limit(50).all()
    return [serializers.notification_read(db, n) for n in rows]


@router.get("/reference/icd10")
def search_icd10(q: str = Query("", description="Search by code or description")):
    ql = q.strip().lower()
    if not ql:
        return ICD10_CATALOG[:20]
    hits = [
        item
        for item in ICD10_CATALOG
        if ql in item["code"].lower() or ql in item["description"].lower()
    ]
    return hits[:20]


@router.get("/reference/medications")
def search_medications(q: str = Query("")):
    ql = q.strip().lower()
    if not ql:
        return MEDICATION_CATALOG[:20]
    return [m for m in MEDICATION_CATALOG if ql in m["name"].lower()][:20]


@router.get("/dashboard", response_model=schemas.DashboardStats)
def dashboard(
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.get_current_user),
):
    """Provider-scoped for clinicians: a physician/nurse sees only their own
    panel (their patients, their encounters, their upcoming appointments).
    Admin/front-desk see the whole facility."""
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_end = now + timedelta(days=7)
    is_clinician = current.role in models.RoleName.CLINICAL

    enc_base = db.query(models.Encounter)
    pat_base = db.query(models.Patient)
    appt_base = db.query(models.Appointment)

    if is_clinician:
        scope = "provider"
        enc_base = enc_base.filter(models.Encounter.provider_id == current.id)
        pat_base = pat_base.filter(models.Patient.primary_provider_id == current.id)
        appt_base = appt_base.filter(models.Appointment.provider_id == current.id)
    else:
        scope = "facility"
        if current.facility_id:
            pat_base = pat_base.filter(models.Patient.facility_id == current.facility_id)
            appt_base = appt_base.filter(models.Appointment.facility_id == current.facility_id)

    my_patients = pat_base.count()
    encounters_today = enc_base.filter(models.Encounter.created_at >= today_start).count()
    draft = enc_base.filter(models.Encounter.status == "draft").count()
    signed = enc_base.filter(models.Encounter.status == "signed").count()
    total_encounters = enc_base.count()

    upcoming_rows = (
        appt_base.filter(
            models.Appointment.scheduled_at >= now,
            models.Appointment.scheduled_at <= week_end,
            models.Appointment.status == "Scheduled",
        )
        .order_by(models.Appointment.scheduled_at)
        .all()
    )

    patient_rows = (
        pat_base.order_by(models.Patient.last_name, models.Patient.first_name).limit(8).all()
    )
    todays_rows = (
        enc_base.filter(models.Encounter.created_at >= today_start)
        .order_by(models.Encounter.created_at.desc())
        .all()
    )

    # Hospital-level notifications: facility-specific + system-wide (facility NULL).
    notif_rows = (
        db.query(models.Notification)
        .filter(
            or_(
                models.Notification.facility_id == current.facility_id,
                models.Notification.facility_id.is_(None),
            )
        )
        .order_by(models.Notification.created_at.desc())
        .limit(6)
        .all()
    )

    return schemas.DashboardStats(
        scope=scope,
        provider_name=f"{current.full_name}{', ' + current.credentials if current.credentials else ''}",
        my_patients=my_patients,
        encounters_today=encounters_today,
        upcoming_appointments=len(upcoming_rows),
        draft_encounters=draft,
        signed_encounters=signed,
        total_encounters=total_encounters,
        patients=[schemas.PatientSummary.model_validate(p) for p in patient_rows],
        todays_encounters=[serializers.encounter_summary(db, e) for e in todays_rows],
        upcoming=[serializers.appointment_summary(db, a) for a in upcoming_rows],
        notifications=[serializers.notification_read(db, n) for n in notif_rows],
    )
