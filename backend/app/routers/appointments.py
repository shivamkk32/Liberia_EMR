"""Appointment scheduling routes: filtered/sorted listing and creation."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db
from ..reference import VISIT_TYPES

router = APIRouter(tags=["appointments"])


@router.get("/reference/visit-types", response_model=List[str])
def visit_types():
    return VISIT_TYPES


def _day_start(d: date) -> datetime:
    return datetime(d.year, d.month, d.day)


@router.get("/appointments", response_model=List[schemas.AppointmentSummary])
def list_appointments(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    appointment_type: Optional[str] = Query(None),
    reason: Optional[str] = Query(None),
    sort: str = Query("asc", pattern="^(asc|desc)$"),
    status: str = Query("Scheduled"),
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("appointment.view")),
):
    """Provider-scoped for clinicians. Defaults to the next 7 days when no
    date range is supplied."""
    q = db.query(models.Appointment)
    if status and status != "All":
        q = q.filter(models.Appointment.status == status)

    if current.role in models.RoleName.CLINICAL:
        q = q.filter(models.Appointment.provider_id == current.id)
    elif current.facility_id:
        q = q.filter(models.Appointment.facility_id == current.facility_id)

    if date_from:
        q = q.filter(models.Appointment.scheduled_at >= _day_start(date_from))
    else:
        now = datetime.utcnow()
        q = q.filter(models.Appointment.scheduled_at >= datetime(now.year, now.month, now.day))
    if date_to:
        q = q.filter(models.Appointment.scheduled_at < _day_start(date_to) + timedelta(days=1))

    if appointment_type and appointment_type != "All":
        q = q.filter(models.Appointment.appointment_type == appointment_type)
    if reason:
        q = q.filter(models.Appointment.reason.ilike(f"%{reason.strip()}%"))

    order = (
        models.Appointment.scheduled_at.desc()
        if sort == "desc"
        else models.Appointment.scheduled_at.asc()
    )
    rows = q.order_by(order).limit(200).all()
    return [serializers.appointment_summary(db, a) for a in rows]


@router.post("/appointments", response_model=schemas.AppointmentSummary, status_code=201)
def create_appointment(
    payload: schemas.AppointmentCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("appointment.book")),
):
    patient = db.get(models.Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not payload.appointment_type.strip():
        raise HTTPException(status_code=422, detail="Visit type is required")

    # Front-desk staff must book against a specific department doctor.
    is_clinician = current.role in models.RoleName.CLINICAL
    provider_id = payload.provider_id or (current.id if is_clinician else None)
    if provider_id is None:
        raise HTTPException(status_code=422, detail="Select a doctor for this appointment")
    provider = db.get(models.User, provider_id)
    if provider is None or provider.role not in models.RoleName.CLINICAL:
        raise HTTPException(status_code=422, detail="Invalid doctor selected")

    appt = models.Appointment(
        patient_id=patient.id,
        provider_id=provider_id,
        facility_id=current.facility_id or patient.facility_id,
        scheduled_at=payload.scheduled_at,
        appointment_type=payload.appointment_type.strip(),
        reason=payload.reason,
        status="Scheduled",
    )
    db.add(appt)
    db.add(
        models.AuditLog(
            user_id=current.id, action="create_appointment",
            entity="appointment", detail=payload.appointment_type,
        )
    )
    db.commit()
    db.refresh(appt)
    return serializers.appointment_summary(db, appt)
