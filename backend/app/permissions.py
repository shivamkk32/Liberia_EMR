"""RBAC catalog: the atomic permission list (spec §3) and the seed role→permission
matrix (spec §4). These are the DEFAULTS seeded into the DB — roles are stored as
data and are editable by an admin at runtime (RB-02, RB-06). Nothing here is an
enforcement gate; enforcement reads the DB (see auth.require_permission)."""
from __future__ import annotations

# --- Atomic permission catalog (code, domain, description) — spec §3 ----------
PERMISSION_CATALOG = [
    # Patient identity
    ("patient.register", "Patient identity", "Register a new patient"),
    ("patient.view_demographics", "Patient identity", "View patient demographics"),
    ("patient.edit_demographics", "Patient identity", "Edit patient demographics"),
    ("patient.view_clinical", "Patient identity", "View full clinical record"),
    ("patient.transfer", "Patient identity", "Transfer care to another provider"),
    ("patient.merge", "Patient identity", "Merge duplicate patient records"),
    ("patient.mark_deceased", "Patient identity", "Mark a patient deceased"),
    # Encounter
    ("encounter.create", "Encounter", "Create clinical encounters"),
    ("encounter.view", "Encounter", "View clinical encounters"),
    ("encounter.edit", "Encounter", "Edit draft encounters"),
    ("encounter.sign", "Encounter", "Sign/finalize encounters"),
    # Vitals
    ("vitals.record", "Vitals", "Record patient vitals"),
    ("vitals.view", "Vitals", "View patient vitals"),
    # Laboratory
    ("lab.order.create", "Laboratory", "Order laboratory tests"),
    ("lab.result.enter", "Laboratory", "Enter laboratory results"),
    ("lab.result.validate", "Laboratory", "Validate laboratory results"),
    ("lab.result.view", "Laboratory", "View laboratory results"),
    # Pharmacy
    ("rx.prescribe", "Pharmacy", "Prescribe medications"),
    ("rx.dispense", "Pharmacy", "Dispense medications"),
    ("rx.view", "Pharmacy", "View medications"),
    ("stock.manage", "Pharmacy", "Manage pharmacy stock"),
    # Appointments
    ("appointment.book", "Appointments", "Book appointments"),
    ("appointment.view", "Appointments", "View appointments"),
    ("appointment.reschedule", "Appointments", "Reschedule appointments"),
    # Billing
    ("billing.view", "Billing", "View billing"),
    ("billing.charge", "Billing", "Create charges"),
    ("billing.payment", "Billing", "Take payments"),
    # Referral
    ("referral.create", "Referral", "Create referrals"),
    ("referral.receive", "Referral", "Receive referrals"),
    # Reporting
    ("report.facility.view", "Reporting", "View facility reports"),
    ("report.national.view", "Reporting", "View national reports"),
    # Administration
    ("user.create", "Administration", "Create users"),
    ("user.edit", "Administration", "Edit users"),
    ("user.deactivate", "Administration", "Deactivate users"),
    ("role.create", "Administration", "Create roles"),
    ("role.edit", "Administration", "Edit roles & permissions"),
    ("role.assign", "Administration", "Assign roles to users"),
    ("permission.view_catalog", "Administration", "View the permission catalog"),
    # Audit
    ("audit.view", "Audit", "View the audit trail"),
]

ALL_PERMISSION_CODES = [p[0] for p in PERMISSION_CATALOG]

# --- Seed roles (key, display name, is_system) --------------------------------
# `key` is the stable role identifier stored on User.role for scoping logic.
SEED_ROLES = [
    ("front_desk", "Front Desk", True),
    ("nurse", "Nurse", True),
    ("physician", "Doctor", True),
    ("pharmacy", "Pharmacist", True),
    ("lab", "Lab Tech", True),
    ("facility_admin", "Facility Admin", True),
    ("admin", "System Admin", True),
]

# --- Seed role → permission matrix — spec §4 ----------------------------------
# Separation of duties: neither admin role has patient.view_clinical.
ROLE_PERMISSIONS = {
    "front_desk": [
        "patient.register", "patient.view_demographics", "patient.edit_demographics",
        "vitals.record", "appointment.book", "appointment.view", "appointment.reschedule",
        "billing.view", "billing.charge", "billing.payment",
    ],
    "nurse": [
        "patient.register", "patient.view_demographics", "patient.edit_demographics",
        "patient.view_clinical", "patient.transfer",
        "encounter.create", "encounter.edit", "encounter.view",
        "vitals.record", "vitals.view", "lab.result.view", "rx.view",
        "appointment.book", "appointment.view",
    ],
    "physician": [
        "patient.register", "patient.view_demographics", "patient.edit_demographics",
        "patient.view_clinical", "patient.transfer",
        "encounter.create", "encounter.edit", "encounter.sign", "encounter.view",
        "vitals.record", "vitals.view",
        "lab.order.create", "lab.result.view", "rx.prescribe", "rx.view",
        "appointment.book", "appointment.view", "report.facility.view", "referral.create",
    ],
    # Pharmacist: partial clinical (active meds + allergies) — see auth field masking.
    "pharmacy": [
        "patient.view_demographics", "patient.view_clinical",
        "rx.dispense", "stock.manage", "rx.view",
    ],
    # Lab Tech: partial clinical (order + indication only).
    "lab": [
        "patient.view_demographics", "patient.view_clinical",
        "lab.result.enter", "lab.result.validate", "lab.result.view",
    ],
    "facility_admin": [
        "patient.view_demographics", "patient.transfer",
        "appointment.book", "appointment.view",
        "billing.view", "billing.charge", "billing.payment", "report.facility.view",
        "user.create", "user.edit", "user.deactivate", "role.assign",
        "permission.view_catalog", "audit.view",
    ],
    "admin": [
        "user.create", "user.edit", "user.deactivate",
        "role.create", "role.edit", "role.assign", "permission.view_catalog",
        "audit.view", "report.national.view",
    ],
}

# Roles whose clinical view is limited to a subset of fields (DP-04).
PARTIAL_CLINICAL_ROLES = {"pharmacy", "lab"}
