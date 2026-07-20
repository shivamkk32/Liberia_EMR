# National EMR/EHR Platform — Francordsoft

A national, county-scalable EMR/EHR platform. This repository holds the **MVP1
(Foundation)** slice: authentication + role-based access control, a Master
Patient Index, and clinical **SOAP** charting — the demonstrable core of an
ambulatory EMR, built toward eClinicalWorks-caliber usability.

> The broader vision (offline-first sync, FHIR/DHIS2 interoperability, national
> warehouse & analytics, Kubernetes rollout across 15 counties) is described in
> `EMR_2026.pdf` and staged for later MVPs. See `CLAUDE.md` for scope guardrails.

---

## Stack

| Layer     | Technology                                    |
|-----------|-----------------------------------------------|
| Frontend  | React + TypeScript + Vite                     |
| Backend   | Python **FastAPI** (Pydantic v2)              |
| ORM / DB  | SQLAlchemy 2.0 → **SQLite** (Postgres-ready)  |
| Auth      | JWT access tokens, pbkdf2 password hashing, RBAC |

## What's implemented (MVP1)

- **Auth & RBAC** — JWT login; roles `physician`, `nurse`, `front_desk`, `lab`,
  `pharmacy`, `admin`. Authorization is enforced **server-side** (e.g. front-desk
  cannot author clinical notes → `403`).
- **Master Patient Index** — register, search (name/MRN/phone), and open charts.
  Auto-generated MRN/PRN.
- **Patient chart** — demographics, prominent **allergy/high-risk alerts**,
  problem list (ICD-10), medications, and an encounter timeline.
- **SOAP encounter editor** — Subjective / Objective / Assessment / Plan with
  vitals (auto-BMI), **ICD-10 typeahead**, medications, orders, instructions,
  and follow-up.
- **Clinical safety** — signing an encounter locks it (**immutable**; edits
  return `409`) and promotes its diagnoses to the patient problem list. Every
  clinical action is audit-stamped.
- **Dashboard** — live facility stats and recent activity.

> ⚠️ All patient data in this repository is **synthetic and fictional** (see
> `backend/app/seed.py`).

---

## Running locally

Two terminals. Backend first.

### 1. Backend (FastAPI, port 8000)

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

.venv/Scripts/python -m app.seed                  # create + seed the SQLite DB
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs> · Health: <http://localhost:8000/api/health>

> **Anaconda on Windows note:** if you hit an SSL error during `pip install`,
> add anaconda's OpenSSL DLLs to PATH for the session:
> ```bash
> export PATH="/c/Users/<you>/anaconda3/Library/bin:/c/Users/<you>/anaconda3/DLLs:$PATH"
> ```

### 2. Frontend (React + Vite, port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` → `http://localhost:8000`.

### Demo logins (password `emr1234`)

| Username   | Role        | Can do                                  |
|------------|-------------|-----------------------------------------|
| `sjohnson` | physician   | full clinical charting + sign           |
| `nwang`    | nurse       | clinical charting                       |
| `fdesk`    | front_desk  | register/search patients (no charting)  |
| `admin`    | admin       | everything                              |

Try: log in as `sjohnson` → open **Daniel Okoro** → **New Encounter (SOAP)** →
add vitals, an ICD-10 diagnosis, a medication → **Sign & Save**.

---

## Project layout

```
backend/app/
  main.py         FastAPI app + CORS + routers (all under /api)
  models.py       SQLAlchemy ORM — facilities, users, patients, encounters…
  schemas.py      Pydantic request/response contracts
  auth.py         JWT, password hashing, RBAC dependencies
  reference.py    built-in ICD-10 + medication catalogs (demo)
  seed.py         idempotent synthetic demo data
  routers/        auth_router, patients, encounters, meta
frontend/src/
  api/client.ts   single typed API client (components never fetch directly)
  auth/           auth context + protected routes
  components/      Layout (sidebar/topbar), UI primitives (Modal, Toast…)
  pages/           Login, Dashboard, Patients, PatientChart, EncounterEditor
  lib/format.ts    shared formatting helpers
```

## Verification status

Verified end-to-end during development:
- Backend: login → dashboard → patient search → chart → SOAP create → **sign** →
  edit-after-sign returns `409` → diagnosis auto-promoted to problem list; RBAC
  `403` for front-desk on clinical write. All via the Vite proxy.
- Frontend: `tsc -b` clean, production build clean (44 modules); login and
  dashboard render verified via headless browser; patient chart load traced with
  all API responses `200`.

## Roadmap (later MVPs)

IPD workflows · pharmacy & inventory · lab orders/results · offline-first sync ·
FHIR R4 / DHIS2 interoperability · national warehouse & analytics · Kubernetes
deployment. See `EMR_2026.pdf`.
