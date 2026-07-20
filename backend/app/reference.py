"""Small built-in reference catalogs for the demo (ICD-10 + common meds).

Not a complete terminology service — MVP1 ships a curated subset so the charting
UX has real code lookups. A full deployment would back this with SNOMED/ICD-10/
LOINC terminology services (see proposal Data Architecture).
"""
from __future__ import annotations

ICD10_CATALOG = [
    {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"},
    {"code": "E11.65", "description": "Type 2 diabetes mellitus with hyperglycemia"},
    {"code": "I10", "description": "Essential (primary) hypertension"},
    {"code": "E78.5", "description": "Hyperlipidemia, unspecified"},
    {"code": "E03.9", "description": "Hypothyroidism, unspecified"},
    {"code": "M54.30", "description": "Sciatica, unspecified side"},
    {"code": "M54.5", "description": "Low back pain"},
    {"code": "M54.9", "description": "Dorsalgia, unspecified"},
    {"code": "J06.9", "description": "Acute upper respiratory infection, unspecified"},
    {"code": "J02.9", "description": "Acute pharyngitis, unspecified"},
    {"code": "J45.909", "description": "Unspecified asthma, uncomplicated"},
    {"code": "N39.0", "description": "Urinary tract infection, site not specified"},
    {"code": "K21.9", "description": "Gastro-esophageal reflux disease without esophagitis"},
    {"code": "R51.9", "description": "Headache, unspecified"},
    {"code": "G43.909", "description": "Migraine, unspecified, not intractable"},
    {"code": "F41.1", "description": "Generalized anxiety disorder"},
    {"code": "F32.9", "description": "Major depressive disorder, single episode, unspecified"},
    {"code": "R05.9", "description": "Cough, unspecified"},
    {"code": "R50.9", "description": "Fever, unspecified"},
    {"code": "Z00.00", "description": "General adult medical exam without abnormal findings"},
    {"code": "M25.561", "description": "Pain in right knee"},
    {"code": "M25.562", "description": "Pain in left knee"},
    {"code": "E66.9", "description": "Obesity, unspecified"},
    {"code": "D64.9", "description": "Anemia, unspecified"},
    {"code": "B34.9", "description": "Viral infection, unspecified"},
]

MEDICATION_CATALOG = [
    {"name": "Metformin", "form": "Tablet", "common_doses": ["500 MG", "850 MG", "1000 MG"]},
    {"name": "Lisinopril", "form": "Tablet", "common_doses": ["5 MG", "10 MG", "20 MG"]},
    {"name": "Atorvastatin (Lipitor)", "form": "Tablet", "common_doses": ["10 MG", "20 MG", "40 MG"]},
    {"name": "Amlodipine", "form": "Tablet", "common_doses": ["5 MG", "10 MG"]},
    {"name": "Levothyroxine", "form": "Tablet", "common_doses": ["25 MCG", "50 MCG", "100 MCG"]},
    {"name": "Amoxicillin", "form": "Capsule", "common_doses": ["250 MG", "500 MG"]},
    {"name": "Azithromycin", "form": "Tablet", "common_doses": ["250 MG", "500 MG"]},
    {"name": "Ibuprofen", "form": "Tablet", "common_doses": ["200 MG", "400 MG", "600 MG"]},
    {"name": "Acetaminophen (Tylenol)", "form": "Tablet", "common_doses": ["325 MG", "500 MG"]},
    {"name": "Omeprazole", "form": "Capsule", "common_doses": ["20 MG", "40 MG"]},
    {"name": "Albuterol", "form": "Inhaler", "common_doses": ["90 MCG"]},
    {"name": "Sertraline", "form": "Tablet", "common_doses": ["25 MG", "50 MG", "100 MG"]},
    {"name": "Hydrochlorothiazide", "form": "Tablet", "common_doses": ["12.5 MG", "25 MG"]},
    {"name": "Gabapentin", "form": "Capsule", "common_doses": ["100 MG", "300 MG"]},
    {"name": "Prednisone", "form": "Tablet", "common_doses": ["5 MG", "10 MG", "20 MG"]},
]

MEDICATION_FREQUENCIES = ["QD", "BID", "TID", "QID", "HS", "PRN", "Q6H", "Q8H", "Weekly"]

# Appointment visit types (a visit type is required when creating an appointment).
VISIT_TYPES = [
    "Follow-Up Visit",
    "New Complaint",
    "Annual Physical",
    "Consultation",
    "Lab Review",
    "Procedure",
    "Immunization",
    "Antenatal (ANC)",
    "Postnatal (PNC)",
    "Chronic Care Review",
    "Telehealth",
    "Urgent Care",
]

