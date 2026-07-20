"""Pydantic v2 schemas — request/response contracts. Never expose ORM objects."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth ---------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserRead"


class StaffCreate(BaseModel):
    """Admin-only: register a new staff member / doctor with a role + scope."""
    username: str = Field(min_length=3)
    full_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=4)
    role: str  # role key
    credentials: str = ""
    department: str = ""
    facility_id: Optional[int] = None
    scope_level: str = "Facility"  # National / County / District / Facility
    scope_county: str = ""


class UserUpdate(BaseModel):
    """Admin edit of a staff member (role, scope, activation)."""
    full_name: Optional[str] = None
    role: Optional[str] = None
    credentials: Optional[str] = None
    department: Optional[str] = None
    facility_id: Optional[int] = None
    scope_level: Optional[str] = None
    scope_county: Optional[str] = None
    is_active: Optional[bool] = None


class UserRead(ORMModel):
    id: int
    username: str
    email: str
    full_name: str
    credentials: str = ""
    role: str
    department: str = ""
    facility_id: Optional[int] = None
    scope_level: str = "Facility"
    scope_county: str = ""
    is_active: bool = True
    must_change_password: bool = False
    permissions: List[str] = Field(default_factory=list)  # effective permission codes

    @computed_field  # human-facing staff/doctor identifier (e.g. DOC-0001)
    @property
    def doctor_id(self) -> str:
        return f"DOC-{self.id:04d}"


# --- RBAC: permissions & roles as data ---------------------------------------
class PermissionRead(ORMModel):
    code: str
    domain: str = ""
    description: str = ""


class RoleRead(ORMModel):
    id: int
    key: str
    name: str
    description: str = ""
    is_system: bool = False
    permissions: List[str] = Field(default_factory=list)


class RoleCreate(BaseModel):
    key: str = Field(min_length=2)
    name: str = Field(min_length=2)
    description: str = ""
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


# --- Transfer of care & audit -------------------------------------------------
class TransferRequest(BaseModel):
    to_provider_id: int
    reason: str = ""


class AuditRead(ORMModel):
    id: int
    username: str = ""
    role: str = ""
    scope: str = ""
    action: str
    entity: str = ""
    entity_id: Optional[int] = None
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    decision: str = "allow"
    detail: str = ""
    timestamp: Optional[datetime] = None


# --- Admin dashboard (organization-level) ------------------------------------
class RoleCount(BaseModel):
    key: str
    name: str
    count: int


class DeptCount(BaseModel):
    department: str
    count: int


class AdminOverview(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    total_doctors: int
    total_patients: int
    total_appointments: int
    upcoming_appointments: int
    total_encounters: int
    total_facilities: int
    total_roles: int
    total_permissions: int
    pending_onboarding: int   # users who must change password
    denials_recent: int       # permission-denied events in the trail
    users_by_role: List[RoleCount] = Field(default_factory=list)
    doctors_by_department: List[DeptCount] = Field(default_factory=list)
    recent_users: List[UserRead] = Field(default_factory=list)
    recent_activity: List[AuditRead] = Field(default_factory=list)


# --- Facility -----------------------------------------------------------------
class FacilityRead(ORMModel):
    id: int
    name: str
    code: str
    county: str
    facility_type: str = "Clinic"


# --- Allergy / Problem / Medication ------------------------------------------
class AllergyBase(BaseModel):
    substance: str
    reaction: str = ""
    severity: str = "Moderate"
    status: str = "Active"
    noted_date: Optional[date] = None


class AllergyRead(ORMModel, AllergyBase):
    id: int


class ProblemBase(BaseModel):
    description: str
    icd10_code: str = ""
    status: str = "Active"
    onset_date: Optional[date] = None


class ProblemRead(ORMModel, ProblemBase):
    id: int


class MedicationBase(BaseModel):
    name: str
    dose: str = ""
    form: str = ""
    route: str = "Oral"
    frequency: str = ""
    status: str = "Active"
    start_date: Optional[date] = None


class MedicationRead(ORMModel, MedicationBase):
    id: int
    encounter_id: Optional[int] = None


# --- Patient ------------------------------------------------------------------
class PatientBase(BaseModel):
    # Identity
    title: str = ""
    first_name: str
    middle_name: str = ""
    last_name: str
    date_of_birth: date
    sex: str
    national_id: str = ""
    marital_status: str = ""
    blood_group: str = ""
    race: str = ""
    nationality: str = "Liberian"
    occupation: str = ""
    religion: str = ""
    disability: str = ""
    language: str = "English"
    # Contact
    phone: str = ""
    alt_phone: str = ""
    email: str = ""
    address: str = ""
    town: str = ""
    district: str = ""
    county: str = ""
    # Next of kin
    next_of_kin_name: str = ""
    next_of_kin_relationship: str = ""
    next_of_kin_phone: str = ""
    # Insurance / admin
    insurance_provider: str = ""
    insurance_id: str = ""
    insurance_scheme: str = ""
    primary_provider_id: Optional[int] = None
    facility_id: Optional[int] = None
    portal_enrolled: bool = False


class PatientCreate(PatientBase):
    # Optional inline clinical lists at registration.
    allergies: List[AllergyBase] = Field(default_factory=list)
    problems: List[ProblemBase] = Field(default_factory=list)


class PatientUpdate(BaseModel):
    title: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    sex: Optional[str] = None
    national_id: Optional[str] = None
    marital_status: Optional[str] = None
    blood_group: Optional[str] = None
    race: Optional[str] = None
    nationality: Optional[str] = None
    occupation: Optional[str] = None
    religion: Optional[str] = None
    disability: Optional[str] = None
    language: Optional[str] = None
    phone: Optional[str] = None
    alt_phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    town: Optional[str] = None
    district: Optional[str] = None
    county: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_relationship: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_id: Optional[str] = None
    insurance_scheme: Optional[str] = None
    primary_provider_id: Optional[int] = None
    portal_enrolled: Optional[bool] = None
    active: Optional[bool] = None


class PatientSummary(ORMModel):
    """Lightweight row for the patient list / MPI search."""

    id: int
    mrn: str
    prn: Optional[str] = None
    national_id: str = ""
    title: str = ""
    first_name: str
    last_name: str
    date_of_birth: date
    sex: str
    phone: str = ""
    insurance_provider: str = ""
    portal_enrolled: bool = False
    active: bool = True


class PatientRead(PatientSummary):
    middle_name: str = ""
    marital_status: str = ""
    blood_group: str = ""
    race: str = ""
    nationality: str = ""
    occupation: str = ""
    religion: str = ""
    disability: str = ""
    language: str = ""
    alt_phone: str = ""
    email: str = ""
    address: str = ""
    town: str = ""
    district: str = ""
    county: str = ""
    next_of_kin_name: str = ""
    next_of_kin_relationship: str = ""
    next_of_kin_phone: str = ""
    insurance_id: str = ""
    insurance_scheme: str = ""
    primary_provider_id: Optional[int] = None
    primary_provider_name: Optional[str] = None
    facility_id: Optional[int] = None
    facility_name: Optional[str] = None
    created_at: Optional[datetime] = None
    allergies: List[AllergyRead] = Field(default_factory=list)
    problems: List[ProblemRead] = Field(default_factory=list)
    medications: List[MedicationRead] = Field(default_factory=list)


# --- Encounter: diagnoses & orders -------------------------------------------
class DiagnosisBase(BaseModel):
    description: str
    icd10_code: str = ""
    status: str = "Active"
    onset_date: Optional[date] = None


class DiagnosisRead(ORMModel, DiagnosisBase):
    id: int


class OrderBase(BaseModel):
    order_type: str = "Lab"
    description: str
    status: str = "Ordered"


class OrderRead(ORMModel, OrderBase):
    id: int
    ordered_at: Optional[datetime] = None


# --- Encounter (SOAP) ---------------------------------------------------------
class VitalsBase(BaseModel):
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    resp_rate: Optional[int] = None
    temperature_f: Optional[float] = None
    spo2: Optional[int] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    bmi: Optional[float] = None
    pain_score: Optional[int] = None


class MedicationInPlan(MedicationBase):
    """A medication authored in the encounter Plan."""


class EncounterCreate(VitalsBase):
    patient_id: int
    provider_id: Optional[int] = None  # defaults to current user if clinical
    encounter_type: str = "Office Visit (SOAP)"
    reason: str = ""

    chief_complaint: str = ""
    history_present_illness: str = ""
    review_of_systems: str = ""
    physical_exam: str = ""
    patient_instructions: str = ""
    follow_up: str = ""

    diagnoses: List[DiagnosisBase] = Field(default_factory=list)
    orders: List[OrderBase] = Field(default_factory=list)
    medications: List[MedicationInPlan] = Field(default_factory=list)


class EncounterUpdate(VitalsBase):
    encounter_type: Optional[str] = None
    reason: Optional[str] = None
    chief_complaint: Optional[str] = None
    history_present_illness: Optional[str] = None
    review_of_systems: Optional[str] = None
    physical_exam: Optional[str] = None
    patient_instructions: Optional[str] = None
    follow_up: Optional[str] = None
    diagnoses: Optional[List[DiagnosisBase]] = None
    orders: Optional[List[OrderBase]] = None
    medications: Optional[List[MedicationInPlan]] = None


class EncounterSummary(ORMModel):
    id: int
    patient_id: int
    encounter_type: str
    status: str
    reason: str = ""
    chief_complaint: str = ""
    provider_id: int
    provider_name: Optional[str] = None
    created_at: Optional[datetime] = None
    signed_at: Optional[datetime] = None


class EncounterRead(EncounterSummary, VitalsBase):
    history_present_illness: str = ""
    review_of_systems: str = ""
    physical_exam: str = ""
    patient_instructions: str = ""
    follow_up: str = ""
    facility_id: Optional[int] = None
    patient_name: Optional[str] = None
    diagnoses: List[DiagnosisRead] = Field(default_factory=list)
    orders: List[OrderRead] = Field(default_factory=list)
    medications: List[MedicationRead] = Field(default_factory=list)


# --- Appointments & Notifications --------------------------------------------
class AppointmentSummary(ORMModel):
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    provider_id: int
    provider_name: Optional[str] = None
    scheduled_at: datetime
    appointment_type: str = "Office Visit"
    status: str = "Scheduled"
    reason: str = ""


class AppointmentCreate(BaseModel):
    patient_id: int
    provider_id: Optional[int] = None  # defaults to current user
    scheduled_at: datetime
    appointment_type: str = Field(min_length=1)  # visit type is required
    reason: str = ""


class NotificationRead(ORMModel):
    id: int
    title: str
    message: str = ""
    level: str = "info"
    category: str = "General"
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    patient_mrn: Optional[str] = None
    created_at: Optional[datetime] = None


# --- Dashboard ----------------------------------------------------------------
class DashboardStats(BaseModel):
    scope: str  # "provider" (clinician sees own panel) | "facility"
    provider_name: Optional[str] = None
    my_patients: int
    encounters_today: int
    upcoming_appointments: int
    draft_encounters: int
    signed_encounters: int
    total_encounters: int
    patients: List[PatientSummary] = Field(default_factory=list)
    todays_encounters: List[EncounterSummary] = Field(default_factory=list)
    upcoming: List[AppointmentSummary] = Field(default_factory=list)
    notifications: List[NotificationRead] = Field(default_factory=list)


Token.model_rebuild()
