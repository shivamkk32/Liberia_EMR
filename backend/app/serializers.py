"""Helpers to convert ORM objects into read schemas with joined display fields."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from . import models, schemas


def _provider_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.get(models.User, user_id)
    if not u:
        return None
    return f"{u.full_name}{', ' + u.credentials if u.credentials else ''}"


def patient_read(db: Session, p: models.Patient) -> schemas.PatientRead:
    data = schemas.PatientRead.model_validate(p)
    data.primary_provider_name = _provider_name(db, p.primary_provider_id)
    if p.facility_id:
        fac = db.get(models.Facility, p.facility_id)
        data.facility_name = fac.name if fac else None
    # Active medications first, most recent first.
    data.medications = [
        schemas.MedicationRead.model_validate(m)
        for m in sorted(p.medications, key=lambda m: (m.status != "Active", -m.id))
    ]
    return data


def encounter_summary(db: Session, e: models.Encounter) -> schemas.EncounterSummary:
    s = schemas.EncounterSummary.model_validate(e)
    s.provider_name = _provider_name(db, e.provider_id)
    return s


def user_read(user: models.User) -> schemas.UserRead:
    r = schemas.UserRead.model_validate(user)
    r.permissions = sorted(user.permission_codes())
    return r


def role_read(role: models.Role) -> schemas.RoleRead:
    # Build explicitly: the ORM `permissions` relationship (Permission objects)
    # collides with the schema's List[str] field under model_validate.
    return schemas.RoleRead(
        id=role.id, key=role.key, name=role.name,
        description=role.description or "", is_system=bool(role.is_system),
        permissions=sorted(role.permission_codes()),
    )


def audit_read(db: Session, log: models.AuditLog) -> schemas.AuditRead:
    r = schemas.AuditRead.model_validate(log)
    if log.patient_id:
        p = db.get(models.Patient, log.patient_id)
        if p:
            r.patient_name = f"{p.first_name} {p.last_name}"
    return r


def notification_read(db: Session, n: models.Notification) -> schemas.NotificationRead:
    r = schemas.NotificationRead.model_validate(n)
    if n.patient_id:
        p = db.get(models.Patient, n.patient_id)
        if p:
            r.patient_name = f"{p.first_name} {p.last_name}"
            r.patient_mrn = p.mrn
    return r


def appointment_summary(db: Session, a: models.Appointment) -> schemas.AppointmentSummary:
    s = schemas.AppointmentSummary.model_validate(a)
    s.provider_name = _provider_name(db, a.provider_id)
    if a.patient:
        s.patient_name = f"{a.patient.first_name} {a.patient.last_name}"
    return s


def encounter_read(db: Session, e: models.Encounter) -> schemas.EncounterRead:
    r = schemas.EncounterRead.model_validate(e)
    r.provider_name = _provider_name(db, e.provider_id)
    if e.patient:
        r.patient_name = f"{e.patient.first_name} {e.patient.last_name}"
    # Medications relate to Patient (with an encounter_id), not via an Encounter
    # relationship — fetch the ones authored in this encounter's Plan.
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.encounter_id == e.id)
        .order_by(models.Medication.id)
        .all()
    )
    r.medications = [schemas.MedicationRead.model_validate(m) for m in meds]
    return r
