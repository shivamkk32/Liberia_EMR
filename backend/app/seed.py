"""Seed the database with demo facilities, staff, and synthetic patients.

Idempotent: running twice will not duplicate. ALL patient data here is fictional.
Run:  python -m app.seed
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from .auth import hash_password
from .database import SessionLocal, init_db
from .permissions import PERMISSION_CATALOG, ROLE_PERMISSIONS, SEED_ROLES
from . import models


def _get_or_create(db, model, defaults=None, **filters):
    obj = db.query(model).filter_by(**filters).first()
    if obj:
        return obj, False
    obj = model(**filters, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj, True


def _seed_rbac(db):
    """Seed the permission catalog and the default roles → permission matrix
    (spec §3/§4). Idempotent. Roles are editable data thereafter."""
    perms = {}
    for code, domain, description in PERMISSION_CATALOG:
        p, _ = _get_or_create(db, models.Permission, code=code,
                              defaults=dict(domain=domain, description=description))
        perms[code] = p
    roles = {}
    for key, name, is_system in SEED_ROLES:
        role, created = _get_or_create(db, models.Role, key=key,
                                       defaults=dict(name=name, is_system=is_system))
        if created or not role.permissions:
            role.permissions = [perms[c] for c in ROLE_PERMISSIONS.get(key, []) if c in perms]
        roles[key] = role
    db.flush()
    return roles


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        roles = _seed_rbac(db)
        # --- Facilities ---
        north, _ = _get_or_create(
            db, models.Facility, code="NRO-001",
            defaults=dict(name="North Regional Hospital", county="Nairobi", facility_type="Hospital"),
        )
        south, _ = _get_or_create(
            db, models.Facility, code="SCC-002",
            defaults=dict(name="South County Clinic", county="Kisumu", facility_type="Clinic"),
        )

        # --- Staff (demo logins; one per role — spec §10 step 8) ---
        staff = [
            dict(username="sjohnson", full_name="Sarah Johnson", credentials="MD", department="Internal Medicine",
                 role="physician", email="s.johnson@emr.health", facility_id=north.id),
            dict(username="mleo", full_name="Michael Leo", credentials="MD", department="Pediatrics",
                 role="physician", email="m.leo@emr.health", facility_id=north.id),
            dict(username="aokafor", full_name="Ada Okafor", credentials="MD", department="Obstetrics & Gynecology",
                 role="physician", email="a.okafor@emr.health", facility_id=north.id),
            dict(username="nwang", full_name="Nancy Wang", credentials="RN", department="Outpatient",
                 role="nurse", email="n.wang@emr.health", facility_id=north.id),
            dict(username="pmoore", full_name="Patrick Moore", credentials="PharmD", department="Pharmacy",
                 role="pharmacy", email="p.moore@emr.health", facility_id=north.id),
            dict(username="ltech", full_name="Linda Tech", credentials="MLT", department="Laboratory",
                 role="lab", email="l.tech@emr.health", facility_id=north.id),
            dict(username="fdesk", full_name="Faith Desk", credentials="", department="Reception",
                 role="front_desk", email="frontdesk@emr.health", facility_id=north.id),
            dict(username="fadmin", full_name="Frank Ops", credentials="", department="Facility Administration",
                 role="facility_admin", email="f.ops@emr.health", facility_id=north.id),
            dict(username="admin", full_name="System Administrator", credentials="", department="Administration",
                 role="admin", email="admin@emr.health", facility_id=north.id, scope_level="National"),
        ]
        users = {}
        for s in staff:
            role_obj = roles.get(s["role"])
            u, _created = _get_or_create(
                db, models.User, username=s["username"],
                defaults=dict(
                    full_name=s["full_name"], credentials=s["credentials"], role=s["role"],
                    role_id=role_obj.id if role_obj else None,
                    department=s["department"], email=s["email"], facility_id=s["facility_id"],
                    scope_level=s.get("scope_level", "Facility"),
                    hashed_password=hash_password("emr1234"),
                ),
            )
            # keep role_id in sync on reseed of existing users
            if role_obj and u.role_id != role_obj.id:
                u.role_id = role_obj.id
            users[s["username"]] = u

        # --- Patients (synthetic) ---
        if db.query(models.Patient).count() == 0:
            _seed_patients(db, users, north, south)

        # --- Schedule + hospital notifications (idempotent) ---
        _seed_schedule_and_notifications(db, users, north, south)

        db.commit()
        _report(db)
    finally:
        db.close()


def _seed_patients(db, users, north, south):
    dr_sarah = users["sjohnson"]
    dr_leo = users["mleo"]
    provider = dr_sarah  # authored the historical clinical data below

    def make_patient(idx, owner=None, **kw):
        owner = owner or dr_sarah
        p = models.Patient(
            mrn=f"100{idx:07d}",
            prn=f"PR{idx:06d}",
            facility_id=kw.pop("facility_id", north.id),
            primary_provider_id=owner.id,
            created_by=owner.id,
            **kw,
        )
        db.add(p)
        db.flush()  # assign id for child rows
        return p

    # Patient 1 — Daniel Okoro (mirrors the reference SOAP chart), fully detailed
    daniel = make_patient(
        1, title="Mr", first_name="Daniel", middle_name="K.", last_name="Okoro",
        date_of_birth=date(1966, 3, 12), sex="Male", national_id="LR-1966-004471",
        marital_status="Married", blood_group="O+", nationality="Liberian",
        occupation="Teacher", religion="Christian", language="English",
        phone="+231 77 445 908", alt_phone="+231 88 220 110",
        email="daniel.okoro@example.com", address="12 Riverside Rd", town="Monrovia",
        district="Greater Monrovia", county="Montserrado",
        next_of_kin_name="Grace Okoro", next_of_kin_relationship="Spouse",
        next_of_kin_phone="+231 77 990 112",
        insurance_provider="Medicare", insurance_id="MED-88213", insurance_scheme="National Health",
        portal_enrolled=True,
    )
    db.add_all([
        models.Allergy(patient_id=daniel.id, substance="Penicillin", reaction="Anaphylaxis",
                       severity="Severe", status="Active", noted_date=date(2018, 6, 1)),
        models.Problem(patient_id=daniel.id, description="Type 2 diabetes mellitus without complications",
                       icd10_code="E11.9", status="Chronic", onset_date=date(2016, 7, 6)),
        models.Problem(patient_id=daniel.id, description="Essential (primary) hypertension",
                       icd10_code="I10", status="Chronic", onset_date=date(2017, 2, 20)),
        models.Problem(patient_id=daniel.id, description="Hypothyroidism, unspecified",
                       icd10_code="E03.9", status="Chronic"),
        models.Medication(patient_id=daniel.id, name="Metformin", dose="500 MG", form="Tablet",
                          frequency="BID", status="Active", prescribed_by=provider.id),
        models.Medication(patient_id=daniel.id, name="Lisinopril", dose="10 MG", form="Tablet",
                          frequency="QD", status="Active", prescribed_by=provider.id),
        models.Medication(patient_id=daniel.id, name="Atorvastatin (Lipitor)", dose="20 MG", form="Tablet",
                          frequency="HS", status="Active", prescribed_by=provider.id),
    ])

    # A signed historical encounter for Daniel
    enc = models.Encounter(
        patient_id=daniel.id, provider_id=provider.id, facility_id=north.id,
        encounter_type="Office Visit (SOAP)", status="signed",
        reason="Follow-up Visit",
        chief_complaint="Lower back pain radiating to right leg for 1 week.",
        history_present_illness=("Patient reports intermittent lower back pain x1 week, worse with "
                                 "sitting and bending. Radiates to right leg. No numbness or weakness."),
        review_of_systems="Constitutional: denies fever/chills. Musculoskeletal: + back pain. Neuro: denies weakness.",
        physical_exam=("General: Alert, oriented, no acute distress. Back: Mild lumbar tenderness, SLR "
                       "positive on right. Neuro: Motor 5/5, sensation intact."),
        bp_systolic=120, bp_diastolic=80, heart_rate=76, resp_rate=16, temperature_f=98.6,
        spo2=98, weight_kg=79.4, height_cm=175.0, bmi=25.9, pain_score=4,
        patient_instructions="Avoid heavy lifting. Apply ice/heat as needed. Follow up in 2 weeks.",
        follow_up="Return in 2 weeks",
        created_at=datetime.utcnow() - timedelta(days=20),
        signed_at=datetime.utcnow() - timedelta(days=20),
        signed_by=provider.id,
    )
    db.add(enc)
    db.flush()
    db.add_all([
        models.EncounterDiagnosis(encounter_id=enc.id, description="Sciatica, unspecified side",
                                  icd10_code="M54.30", status="Chronic", onset_date=date(2018, 8, 6)),
        models.EncounterDiagnosis(encounter_id=enc.id, description="Type 2 diabetes mellitus without complications",
                                  icd10_code="E11.9", status="Chronic"),
        models.Order(encounter_id=enc.id, order_type="Referral", description="Physical Therapy Referral"),
        models.Order(encounter_id=enc.id, order_type="Imaging", description="MRI Lumbar Spine"),
        models.Order(encounter_id=enc.id, order_type="Lab", description="Comprehensive Metabolic Panel"),
    ])

    # A second signed encounter for Daniel dated TODAY (shows on Sarah's dashboard)
    enc_today = models.Encounter(
        patient_id=daniel.id, provider_id=provider.id, facility_id=north.id,
        encounter_type="Office Visit (SOAP)", status="signed", reason="Diabetes Follow-up",
        chief_complaint="Routine diabetes and blood pressure review.",
        history_present_illness="Reports good adherence to medication. No hypoglycemic episodes.",
        physical_exam="General: well-appearing. CV: RRR. No edema.",
        bp_systolic=128, bp_diastolic=82, heart_rate=72, resp_rate=16, temperature_f=98.4,
        spo2=98, weight_kg=79.0, height_cm=175.0, bmi=25.8,
        patient_instructions="Continue current regimen. Recheck HbA1c in 3 months.",
        follow_up="3 months",
        created_at=datetime.utcnow(), signed_at=datetime.utcnow(), signed_by=provider.id,
    )
    db.add(enc_today)
    db.flush()
    db.add(models.EncounterDiagnosis(
        encounter_id=enc_today.id, description="Type 2 diabetes mellitus without complications",
        icd10_code="E11.9", status="Chronic"))

    # Dr. Sarah's panel
    make_patient(2, dr_sarah, first_name="Emily", last_name="Achieng", date_of_birth=date(1990, 11, 2),
                 sex="Female", phone="+254 720 118 220", insurance_provider="NHIF",
                 county="Nairobi", portal_enrolled=True)
    make_patient(3, dr_sarah, first_name="Rohan", last_name="Mwangi", date_of_birth=date(1992, 1, 15),
                 sex="Male", phone="+254 733 900 112", insurance_provider="AAR", county="Nairobi")
    p4 = make_patient(4, dr_sarah, first_name="Grace", last_name="Wanjiru", date_of_birth=date(1978, 6, 30),
                      sex="Female", phone="+254 701 552 334", insurance_provider="Jubilee", county="Nairobi")
    db.add(models.Allergy(patient_id=p4.id, substance="Sulfa drugs", reaction="Rash",
                          severity="Moderate", status="Active"))

    # Dr. Leo's panel (so provider scoping is visible — Sarah must NOT see these)
    make_patient(5, dr_leo, first_name="Samuel", last_name="Otieno", date_of_birth=date(2001, 9, 9),
                 sex="Male", phone="+254 799 010 020", insurance_provider="NHIF", county="Kisumu",
                 facility_id=south.id)
    make_patient(6, dr_leo, first_name="Aisha", last_name="Hassan", date_of_birth=date(1985, 4, 21),
                 sex="Female", phone="+254 711 234 567", insurance_provider="Britam", county="Mombasa")


def _seed_schedule_and_notifications(db, users, north, south):
    """Idempotent: upcoming appointments (next 7 days) + hospital notifications."""
    dr_sarah = users["sjohnson"]
    dr_leo = users["mleo"]
    now = datetime.utcnow()

    def patient_by_mrn(mrn):
        return db.query(models.Patient).filter(models.Patient.mrn == mrn).first()

    if db.query(models.Appointment).count() == 0:
        daniel = patient_by_mrn("1000000001")
        emily = patient_by_mrn("1000000002")
        rohan = patient_by_mrn("1000000003")
        grace = patient_by_mrn("1000000004")
        samuel = patient_by_mrn("1000000005")
        appts = [
            (daniel, dr_sarah, 1, 9, "Follow-up Visit", "Diabetes & BP review"),
            (emily, dr_sarah, 2, 11, "New Complaint", "Persistent cough"),
            (grace, dr_sarah, 3, 14, "Annual Physical", "Preventive visit"),
            (rohan, dr_sarah, 5, 10, "Lab Review", "Discuss lipid panel"),
            (samuel, dr_leo, 2, 15, "Follow-up Visit", "Asthma check"),  # Leo's — hidden from Sarah
        ]
        for patient, prov, day_offset, hour, appt_type, reason in appts:
            if not patient:
                continue
            when = (now + timedelta(days=day_offset)).replace(hour=hour, minute=0, second=0, microsecond=0)
            db.add(models.Appointment(
                patient_id=patient.id, provider_id=prov.id, facility_id=patient.facility_id,
                scheduled_at=when, appointment_type=appt_type, status="Scheduled", reason=reason,
            ))

    if db.query(models.Notification).count() == 0:
        daniel = patient_by_mrn("1000000001")
        emily = patient_by_mrn("1000000002")
        grace = patient_by_mrn("1000000004")
        # Patient report notifications (results received) — tied to a patient.
        report_notifs = []
        if daniel:
            report_notifs += [
                models.Notification(
                    facility_id=north.id, patient_id=daniel.id, title="Lab report received",
                    message="Comprehensive Metabolic Panel results are back for Daniel Okoro (MRN 1000000001). HbA1c 7.2% (H).",
                    level="warning", category="Report", created_at=now - timedelta(minutes=25)),
                models.Notification(
                    facility_id=north.id, patient_id=daniel.id, title="Imaging report received",
                    message="MRI Lumbar Spine report available for Daniel Okoro (MRN 1000000001).",
                    level="info", category="Report", created_at=now - timedelta(hours=2)),
            ]
        if emily:
            report_notifs.append(models.Notification(
                facility_id=north.id, patient_id=emily.id, title="Lab report received",
                message="CBC results received for Emily Achieng (MRN 1000000002). All values within range.",
                level="success", category="Report", created_at=now - timedelta(hours=1)))
        if grace:
            report_notifs.append(models.Notification(
                facility_id=north.id, patient_id=grace.id, title="Radiology report received",
                message="Chest X-ray report received for Grace Wanjiru (MRN 1000000004). No acute findings.",
                level="success", category="Report", created_at=now - timedelta(hours=4)))
        db.add_all(report_notifs)
        # System / facility notifications.
        db.add_all([
            models.Notification(
                facility_id=None, title="Scheduled maintenance window",
                message="National EMR core services will undergo maintenance Sunday 02:00–04:00. Offline mode remains available.",
                level="warning", category="System", created_at=now - timedelta(hours=3)),
            models.Notification(
                facility_id=north.id, title="Lab analyzer back online",
                message="North Regional Hospital chemistry analyzer restored. Pending CMP results are processing.",
                level="success", category="Laboratory", created_at=now - timedelta(hours=6)),
            models.Notification(
                facility_id=north.id, title="Influenza vaccination drive",
                message="Facility-wide flu vaccination campaign begins Monday. Encourage eligible patients to enroll.",
                level="info", category="Public Health", created_at=now - timedelta(days=1)),
        ])


def _report(db):
    print("Seed complete.")
    print(f"  Facilities : {db.query(models.Facility).count()}")
    print(f"  Users      : {db.query(models.User).count()}")
    print(f"  Patients   : {db.query(models.Patient).count()}")
    print(f"  Encounters : {db.query(models.Encounter).count()}")
    print(f"  Appointments: {db.query(models.Appointment).count()}")
    print(f"  Notifications: {db.query(models.Notification).count()}")
    print(f"  Permissions : {db.query(models.Permission).count()}  Roles: {db.query(models.Role).count()}")
    print("\nDemo logins (password: emr1234) — one per role for the RBAC demo:")
    print("  sjohnson  — Sarah Johnson, MD    (Doctor)")
    print("  mleo      — Michael Leo, MD      (Doctor — for transfer demo)")
    print("  nwang     — Nancy Wang, RN       (Nurse)")
    print("  pmoore    — Patrick Moore, PharmD (Pharmacist — partial clinical)")
    print("  ltech     — Linda Tech, MLT      (Lab Tech — partial clinical)")
    print("  fdesk     — Faith Desk           (Front Desk — no clinical)")
    print("  fadmin    — Frank Ops            (Facility Admin — user mgmt, no clinical)")
    print("  admin     — System Administrator (System Admin — roles + audit, no clinical)")


if __name__ == "__main__":
    seed()
