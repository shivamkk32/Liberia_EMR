"""Clinical encounter (SOAP note) routes."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db

router = APIRouter(tags=["encounters"])

_VITALS_FIELDS = (
    "bp_systolic", "bp_diastolic", "heart_rate", "resp_rate", "temperature_f",
    "spo2", "weight_kg", "height_cm", "bmi", "pain_score",
)


def _get_encounter_or_404(db: Session, encounter_id: int) -> models.Encounter:
    e = db.get(models.Encounter, encounter_id)
    if e is None:
        raise HTTPException(status_code=404, detail="Encounter not found")
    return e


def _compute_bmi(weight_kg, height_cm):
    if weight_kg and height_cm:
        h = height_cm / 100.0
        if h > 0:
            return round(weight_kg / (h * h), 1)
    return None


def _replace_children(db: Session, encounter: models.Encounter, diagnoses, orders, medications):
    """Replace an encounter's diagnoses/orders and encounter-authored meds."""
    if diagnoses is not None:
        encounter.diagnoses.clear()
        for d in diagnoses:
            encounter.diagnoses.append(models.EncounterDiagnosis(**d.model_dump()))
    if orders is not None:
        encounter.orders.clear()
        for o in orders:
            encounter.orders.append(models.Order(**o.model_dump()))
    if medications is not None:
        # Remove previously encounter-authored meds, then re-add from the Plan.
        for m in list(encounter.patient.medications):
            if m.encounter_id == encounter.id:
                db.delete(m)
        for m in medications:
            db.add(
                models.Medication(
                    patient_id=encounter.patient_id,
                    encounter_id=encounter.id,
                    prescribed_by=encounter.provider_id,
                    **m.model_dump(),
                )
            )


@router.get("/patients/{patient_id}/encounters", response_model=List[schemas.EncounterSummary])
def list_patient_encounters(
    patient_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("encounter.view")),
):
    if db.get(models.Patient, patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    rows = (
        db.query(models.Encounter)
        .filter(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.created_at.desc())
        .all()
    )
    return [serializers.encounter_summary(db, e) for e in rows]


@router.get("/patients/{patient_id}/vitals-trend")
def vitals_trend(
    patient_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("vitals.view", "encounter.view")),
):
    """Last few vitals readings, oldest-first, for trend display."""
    rows = (
        db.query(models.Encounter)
        .filter(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.created_at.desc())
        .limit(6)
        .all()
    )
    trend = []
    for e in reversed(rows):
        if e.bp_systolic or e.heart_rate or e.weight_kg:
            trend.append(
                {
                    "date": e.created_at.date().isoformat() if e.created_at else None,
                    "bp": f"{e.bp_systolic}/{e.bp_diastolic}" if e.bp_systolic else None,
                    "heart_rate": e.heart_rate,
                    "weight_kg": e.weight_kg,
                    "bmi": e.bmi,
                    "spo2": e.spo2,
                }
            )
    return trend


@router.post("/encounters", response_model=schemas.EncounterRead, status_code=201)
def create_encounter(
    payload: schemas.EncounterCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("encounter.create")),
):
    patient = db.get(models.Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    provider_id = payload.provider_id or current.id
    body = payload.model_dump(exclude={"diagnoses", "orders", "medications", "provider_id"})
    body["bmi"] = body.get("bmi") or _compute_bmi(body.get("weight_kg"), body.get("height_cm"))

    encounter = models.Encounter(
        provider_id=provider_id,
        facility_id=current.facility_id,
        status="draft",
        **body,
    )
    db.add(encounter)
    db.flush()

    _replace_children(db, encounter, payload.diagnoses, payload.orders, payload.medications)

    db.add(
        models.AuditLog(
            user_id=current.id,
            action="create_encounter",
            entity="encounter",
            entity_id=encounter.id,
        )
    )
    db.commit()
    db.refresh(encounter)
    return serializers.encounter_read(db, encounter)


@router.get("/encounters/{encounter_id}", response_model=schemas.EncounterRead)
def get_encounter(
    encounter_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("encounter.view")),
):
    return serializers.encounter_read(db, _get_encounter_or_404(db, encounter_id))


@router.patch("/encounters/{encounter_id}", response_model=schemas.EncounterRead)
def update_encounter(
    encounter_id: int,
    payload: schemas.EncounterUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("encounter.edit")),
):
    encounter = _get_encounter_or_404(db, encounter_id)
    if encounter.status == "signed":
        # Signed notes are immutable — amendments would be a new encounter/addendum.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Encounter is signed and cannot be edited",
        )

    scalar = payload.model_dump(exclude={"diagnoses", "orders", "medications"}, exclude_unset=True)
    for field, value in scalar.items():
        setattr(encounter, field, value)
    encounter.bmi = _compute_bmi(encounter.weight_kg, encounter.height_cm) or encounter.bmi

    _replace_children(db, encounter, payload.diagnoses, payload.orders, payload.medications)
    db.commit()
    db.refresh(encounter)
    return serializers.encounter_read(db, encounter)


@router.post("/encounters/{encounter_id}/sign", response_model=schemas.EncounterRead)
def sign_encounter(
    encounter_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("encounter.sign")),
):
    encounter = _get_encounter_or_404(db, encounter_id)
    if encounter.status == "signed":
        raise HTTPException(status_code=409, detail="Encounter is already signed")

    encounter.status = "signed"
    encounter.signed_at = datetime.utcnow()
    encounter.signed_by = current.id

    # Promote encounter diagnoses to the patient problem list if not already present.
    existing = {p.description.lower() for p in encounter.patient.problems}
    for d in encounter.diagnoses:
        if d.description.lower() not in existing:
            db.add(
                models.Problem(
                    patient_id=encounter.patient_id,
                    description=d.description,
                    icd10_code=d.icd10_code,
                    status=d.status,
                    onset_date=d.onset_date,
                )
            )

    db.add(
        models.AuditLog(
            user_id=current.id,
            action="sign_encounter",
            entity="encounter",
            entity_id=encounter.id,
        )
    )
    db.commit()
    db.refresh(encounter)
    return serializers.encounter_read(db, encounter)
