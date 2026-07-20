"""SQLAlchemy ORM models — the EMR domain.

Models real ambulatory-EMR concepts: facilities, staff with roles, a Master
Patient Index, patient-level clinical lists (allergies, problems, medications),
and SOAP encounters with embedded vitals, diagnoses, and orders. Audit stamps
(created_by / created_at) live on clinical records.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


# --- Role name constants (stable keys stored on User.role for scoping logic) ---
class RoleName:
    ADMIN = "admin"
    FACILITY_ADMIN = "facility_admin"
    PHYSICIAN = "physician"
    NURSE = "nurse"
    FRONT_DESK = "front_desk"
    LAB = "lab"
    PHARMACY = "pharmacy"

    ALL = {ADMIN, FACILITY_ADMIN, PHYSICIAN, NURSE, FRONT_DESK, LAB, PHARMACY}
    # Roles that carry a patient panel / author clinical documentation.
    CLINICAL = {PHYSICIAN, NURSE}


# --- RBAC data model: permissions, roles, and their many-to-many link ---------
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    domain = Column(String(60), default="")
    description = Column(String(200), default="")


class Role(Base):
    """A role = a named, editable bundle of permissions (RB-02). Data, not code."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    key = Column(String(40), unique=True, nullable=False, index=True)  # stable identifier
    name = Column(String(80), nullable=False)  # display name
    description = Column(String(200), default="")
    is_system = Column(Boolean, default=False)  # system roles seeded by default

    permissions = relationship("Permission", secondary=role_permissions, lazy="joined")

    def permission_codes(self):
        return {p.code for p in self.permissions}


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    code = Column(String(32), unique=True, nullable=False)
    county = Column(String(80), nullable=False)
    facility_type = Column(String(60), default="Clinic")

    users = relationship("User", back_populates="facility")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(160), unique=True, nullable=False)
    full_name = Column(String(160), nullable=False)
    credentials = Column(String(40), default="")  # e.g. "MD", "RN"
    role = Column(String(32), nullable=False, default=RoleName.PHYSICIAN)  # role key (denormalized)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    department = Column(String(80), default="")  # clinical department / specialty
    hashed_password = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)  # AD-01: set/rotate on first login

    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    # Location scope (RB-03): National / County / District / Facility
    scope_level = Column(String(20), default="Facility")
    scope_county = Column(String(80), default="")

    created_at = Column(DateTime, default=_utcnow)

    facility = relationship("Facility", back_populates="users")
    role_ref = relationship("Role", lazy="joined")

    def permission_codes(self):
        return self.role_ref.permission_codes() if self.role_ref else set()


class Patient(Base):
    """Master Patient Index record."""

    __tablename__ = "patients"

    id = Column(Integer, primary_key=True)
    mrn = Column(String(24), unique=True, nullable=False, index=True)  # Medical Record No.
    prn = Column(String(24), index=True)  # Patient Registration No.
    national_id = Column(String(40), default="", index=True)  # national ID / passport

    title = Column(String(16), default="")  # Mr / Mrs / Ms / Master / Baby
    first_name = Column(String(80), nullable=False, index=True)
    middle_name = Column(String(80), default="")
    last_name = Column(String(80), nullable=False, index=True)
    date_of_birth = Column(Date, nullable=False)
    sex = Column(String(16), nullable=False)  # Male / Female / Other
    marital_status = Column(String(24), default="")
    blood_group = Column(String(8), default="")  # A+, O-, ...
    race = Column(String(40), default="")
    nationality = Column(String(40), default="Liberian")
    occupation = Column(String(80), default="")
    religion = Column(String(40), default="")
    disability = Column(String(120), default="")
    language = Column(String(40), default="English")

    phone = Column(String(40), default="")
    alt_phone = Column(String(40), default="")
    email = Column(String(160), default="")
    address = Column(String(240), default="")  # residential address
    town = Column(String(80), default="")
    district = Column(String(80), default="")
    county = Column(String(80), default="")  # county / region

    # Next of kin / emergency contact
    next_of_kin_name = Column(String(120), default="")
    next_of_kin_relationship = Column(String(60), default="")
    next_of_kin_phone = Column(String(40), default="")

    insurance_provider = Column(String(120), default="")
    insurance_id = Column(String(80), default="")
    insurance_scheme = Column(String(80), default="")

    primary_provider_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)

    portal_enrolled = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=_utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    primary_provider = relationship("User", foreign_keys=[primary_provider_id])
    facility = relationship("Facility")

    allergies = relationship(
        "Allergy", back_populates="patient", cascade="all, delete-orphan"
    )
    problems = relationship(
        "Problem", back_populates="patient", cascade="all, delete-orphan"
    )
    medications = relationship(
        "Medication", back_populates="patient", cascade="all, delete-orphan"
    )
    encounters = relationship(
        "Encounter",
        back_populates="patient",
        cascade="all, delete-orphan",
        order_by="desc(Encounter.created_at)",
    )


class Allergy(Base):
    __tablename__ = "allergies"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    substance = Column(String(120), nullable=False)
    reaction = Column(String(160), default="")
    severity = Column(String(24), default="Moderate")  # Mild / Moderate / Severe
    status = Column(String(24), default="Active")
    noted_date = Column(Date, nullable=True)

    patient = relationship("Patient", back_populates="allergies")


class Problem(Base):
    """Patient-level problem list entry (chronic/active conditions)."""

    __tablename__ = "problems"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    description = Column(String(200), nullable=False)
    icd10_code = Column(String(16), default="")
    status = Column(String(24), default="Active")  # Active / Chronic / Resolved
    onset_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    patient = relationship("Patient", back_populates="problems")


class Medication(Base):
    """Patient medication (may originate from an encounter's Plan)."""

    __tablename__ = "medications"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=True)

    name = Column(String(160), nullable=False)  # e.g. "Metformin 500 MG"
    dose = Column(String(60), default="")
    form = Column(String(60), default="")  # Tablet / Capsule / ...
    route = Column(String(40), default="Oral")
    frequency = Column(String(60), default="")  # QD / BID / PRN / HS ...
    status = Column(String(24), default="Active")  # Active / Discontinued
    start_date = Column(Date, nullable=True)
    prescribed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    patient = relationship("Patient", back_populates="medications")


class Encounter(Base):
    """A clinical visit documented as a SOAP note. Vitals embedded."""

    __tablename__ = "encounters"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)

    encounter_type = Column(String(60), default="Office Visit (SOAP)")
    status = Column(String(24), default="draft")  # draft / signed
    reason = Column(String(200), default="")  # visit reason / appointment type

    # -- Subjective --
    chief_complaint = Column(Text, default="")
    history_present_illness = Column(Text, default="")
    review_of_systems = Column(Text, default="")

    # -- Objective: vitals (embedded) --
    bp_systolic = Column(Integer, nullable=True)
    bp_diastolic = Column(Integer, nullable=True)
    heart_rate = Column(Integer, nullable=True)
    resp_rate = Column(Integer, nullable=True)
    temperature_f = Column(Float, nullable=True)
    spo2 = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    bmi = Column(Float, nullable=True)
    pain_score = Column(Integer, nullable=True)

    # -- Objective: findings --
    physical_exam = Column(Text, default="")

    # -- Plan --
    patient_instructions = Column(Text, default="")
    follow_up = Column(String(200), default="")

    created_at = Column(DateTime, default=_utcnow)
    signed_at = Column(DateTime, nullable=True)
    signed_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    patient = relationship("Patient", back_populates="encounters")
    provider = relationship("User", foreign_keys=[provider_id])
    facility = relationship("Facility")

    diagnoses = relationship(
        "EncounterDiagnosis",
        back_populates="encounter",
        cascade="all, delete-orphan",
    )
    orders = relationship(
        "Order", back_populates="encounter", cascade="all, delete-orphan"
    )


class EncounterDiagnosis(Base):
    """Assessment: a diagnosis captured within an encounter."""

    __tablename__ = "encounter_diagnoses"

    id = Column(Integer, primary_key=True)
    encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False)
    description = Column(String(200), nullable=False)
    icd10_code = Column(String(16), default="")
    status = Column(String(24), default="Active")  # Active / Chronic / Resolved
    onset_date = Column(Date, nullable=True)

    encounter = relationship("Encounter", back_populates="diagnoses")


class Order(Base):
    """Plan: an order placed during an encounter (lab, imaging, referral...)."""

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False)
    order_type = Column(String(40), default="Lab")  # Lab / Imaging / Referral / Procedure
    description = Column(String(200), nullable=False)
    status = Column(String(24), default="Ordered")  # Ordered / Completed / Cancelled
    ordered_at = Column(DateTime, default=_utcnow)

    encounter = relationship("Encounter", back_populates="orders")


class Appointment(Base):
    """A scheduled visit — powers the provider's upcoming-appointments view."""

    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    scheduled_at = Column(DateTime, nullable=False)
    appointment_type = Column(String(60), default="Office Visit")
    status = Column(String(24), default="Scheduled")  # Scheduled / Completed / Cancelled / No-show
    reason = Column(String(200), default="")
    created_at = Column(DateTime, default=_utcnow)

    patient = relationship("Patient")
    provider = relationship("User", foreign_keys=[provider_id])


class Notification(Base):
    """Hospital/system-level notification. facility_id NULL = system-wide."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)  # report notifications
    title = Column(String(160), nullable=False)
    message = Column(String(400), default="")
    level = Column(String(24), default="info")  # info / warning / critical / success
    category = Column(String(40), default="General")  # System / Report / Laboratory / ...
    created_at = Column(DateTime, default=_utcnow)

    patient = relationship("Patient")


class PatientTransfer(Base):
    """Transfer of care record (PS-03) — audited reassignment of a patient."""

    __tablename__ = "patient_transfers"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    from_provider_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    to_provider_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String(300), default="")
    transferred_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)


class AuditLog(Base):
    """Append-only audit trail (AU-01/AU-03). Captures who, role+scope, action,
    target, decision (allow/deny), and time."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(64), default="")
    role = Column(String(40), default="")       # role active at the time
    scope = Column(String(80), default="")      # scope active at the time
    action = Column(String(60), nullable=False)  # login / view_clinical / transfer / ...
    entity = Column(String(60), default="")
    entity_id = Column(Integer, nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    decision = Column(String(10), default="allow")  # allow / deny
    detail = Column(String(300), default="")
    timestamp = Column(DateTime, default=_utcnow)
