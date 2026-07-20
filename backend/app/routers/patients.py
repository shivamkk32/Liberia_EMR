"""Patient / Master Patient Index routes with field-level data protection,
location scoping, and transfer of care."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, models, schemas, serializers
from ..database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


def _next_mrn(db: Session) -> str:
    last = db.query(models.Patient).order_by(models.Patient.id.desc()).first()
    seq = (last.id + 1) if last else 1
    return f"100{seq:07d}"


def _get_or_404(db: Session, patient_id: int) -> models.Patient:
    p = db.get(models.Patient, patient_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


def _apply_scope(query, user: models.User):
    """Location scope (PS-04): facility-scoped users see only their facility."""
    if user.scope_level in ("National", "County"):
        return query  # (county filtering omitted in demo — facility is the key scope)
    if user.facility_id:
        return query.filter(models.Patient.facility_id == user.facility_id)
    return query


def _mask_clinical(read: schemas.PatientRead, user: models.User) -> schemas.PatientRead:
    """Field-level data protection (DP-01/DP-04). Strip clinical fields the role
    may not see. Allergies remain as a safety banner (UI-03, configurable)."""
    perms = user.permission_codes()
    if "patient.view_clinical" not in perms:
        # Front desk / non-clinical: demographics + allergy safety banner only.
        read.problems = []
        read.medications = []
        return read
    if user.role == models.RoleName.LAB:
        # Lab tech: order + indication (problems) + allergies; no medications.
        read.medications = []
    # Pharmacist (meds + allergies + problems) and clinicians (full) see it all.
    return read


# --- List / register ----------------------------------------------------------
@router.get("", response_model=List[schemas.PatientSummary])
def list_patients(
    q: Optional[str] = Query(None, description="Search name, MRN, or phone"),
    active: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("patient.view_demographics")),
):
    query = _apply_scope(db.query(models.Patient), current)
    if active is not None:
        query = query.filter(models.Patient.active == active)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            models.Patient.first_name.ilike(like),
            models.Patient.last_name.ilike(like),
            models.Patient.mrn.ilike(like),
            models.Patient.phone.ilike(like),
        ))
    rows = (
        query.order_by(models.Patient.last_name, models.Patient.first_name)
        .offset(offset).limit(limit).all()
    )
    return [schemas.PatientSummary.model_validate(p) for p in rows]


@router.post("", response_model=schemas.PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: schemas.PatientCreate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("patient.register")),
):
    data = payload.model_dump(exclude={"allergies", "problems"})
    patient = models.Patient(**data, created_by=current.id)
    if patient.facility_id is None:
        patient.facility_id = current.facility_id
    # PS-02: registering by a clinician establishes the patient–provider relationship.
    if patient.primary_provider_id is None and current.role in models.RoleName.CLINICAL:
        patient.primary_provider_id = current.id
    db.add(patient)
    db.flush()
    patient.mrn = _next_mrn(db)
    patient.prn = f"PR{patient.id:06d}"

    for a in payload.allergies:
        db.add(models.Allergy(patient_id=patient.id, **a.model_dump()))
    for pr in payload.problems:
        db.add(models.Problem(patient_id=patient.id, **pr.model_dump()))

    auth.audit(db, current, action="register_patient", entity="patient",
               entity_id=patient.id, patient_id=patient.id,
               detail=f"{patient.first_name} {patient.last_name}")
    db.commit()
    db.refresh(patient)
    return serializers.patient_read(db, patient)


# --- Read (field-level protected) ---------------------------------------------
@router.get("/{patient_id}", response_model=schemas.PatientRead)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("patient.view_demographics")),
):
    patient = _get_or_404(db, patient_id)
    read = serializers.patient_read(db, patient)
    masked = _mask_clinical(read, current)
    # Audit clinical access explicitly (DP-06 / AU-01).
    if "patient.view_clinical" in current.permission_codes():
        auth.audit(db, current, action="view_clinical", entity="patient",
                   entity_id=patient_id, patient_id=patient_id)
    else:
        auth.audit(db, current, action="view_demographics", entity="patient",
                   entity_id=patient_id, patient_id=patient_id)
    db.commit()
    return masked


@router.patch("/{patient_id}", response_model=schemas.PatientRead)
def update_patient(
    patient_id: int,
    payload: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("patient.edit_demographics")),
):
    patient = _get_or_404(db, patient_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    auth.audit(db, current, action="edit_demographics", entity="patient",
               entity_id=patient_id, patient_id=patient_id)
    db.commit()
    db.refresh(patient)
    return _mask_clinical(serializers.patient_read(db, patient), current)


# --- Transfer of care (PS-03) -------------------------------------------------
@router.post("/{patient_id}/transfer", response_model=schemas.PatientRead)
def transfer_patient(
    patient_id: int,
    payload: schemas.TransferRequest,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("patient.transfer")),
):
    patient = _get_or_404(db, patient_id)
    to_provider = db.get(models.User, payload.to_provider_id)
    if to_provider is None or to_provider.role not in models.RoleName.CLINICAL:
        raise HTTPException(status_code=422, detail="Select a valid receiving clinician")

    from_provider_id = patient.primary_provider_id
    patient.primary_provider_id = to_provider.id
    db.add(models.PatientTransfer(
        patient_id=patient.id, from_provider_id=from_provider_id,
        to_provider_id=to_provider.id, reason=payload.reason, transferred_by=current.id,
    ))
    auth.audit(db, current, action="transfer_care", entity="patient", entity_id=patient.id,
               patient_id=patient.id,
               detail=f"to {to_provider.full_name} (DOC-{to_provider.id:04d}); reason: {payload.reason or '—'}")
    db.commit()
    db.refresh(patient)
    return _mask_clinical(serializers.patient_read(db, patient), current)


# --- Clinical lists (permission-gated) ----------------------------------------
@router.post("/{patient_id}/allergies", response_model=schemas.AllergyRead, status_code=201)
def add_allergy(
    patient_id: int, payload: schemas.AllergyBase,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("patient.view_clinical")),
):
    _get_or_404(db, patient_id)
    allergy = models.Allergy(patient_id=patient_id, **payload.model_dump())
    db.add(allergy); db.commit(); db.refresh(allergy)
    return schemas.AllergyRead.model_validate(allergy)


@router.post("/{patient_id}/problems", response_model=schemas.ProblemRead, status_code=201)
def add_problem(
    patient_id: int, payload: schemas.ProblemBase,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("encounter.edit", "encounter.create")),
):
    _get_or_404(db, patient_id)
    problem = models.Problem(patient_id=patient_id, **payload.model_dump())
    db.add(problem); db.commit(); db.refresh(problem)
    return schemas.ProblemRead.model_validate(problem)


@router.post("/{patient_id}/medications", response_model=schemas.MedicationRead, status_code=201)
def add_medication(
    patient_id: int, payload: schemas.MedicationBase,
    db: Session = Depends(get_db),
    current: models.User = Depends(auth.require_permission("rx.prescribe")),
):
    _get_or_404(db, patient_id)
    med = models.Medication(patient_id=patient_id, prescribed_by=current.id, **payload.model_dump())
    db.add(med); db.commit(); db.refresh(med)
    return schemas.MedicationRead.model_validate(med)


@router.post("/{patient_id}/medications/{med_id}/discontinue", response_model=schemas.MedicationRead)
def discontinue_medication(
    patient_id: int, med_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_permission("rx.prescribe")),
):
    med = db.get(models.Medication, med_id)
    if med is None or med.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Medication not found")
    med.status = "Discontinued"
    db.commit(); db.refresh(med)
    return schemas.MedicationRead.model_validate(med)
