# CLAUDE.md — National EMR/EHR Platform (Francordsoft)

Project memory for Claude Code. Read this first, every session. Keep it lean and current — if a rule here is wrong, fix it rather than working around it.

---

## 1. What this is

A **National EMR/EHR platform** for a 15-county digital health program (Francordsoft LLC). The full vision (from `EMR_2026.pdf`) is a secure, offline-first, FHIR-ready national health platform. We are building it in staged MVPs — **do not try to build the whole proposal at once.**

**Current milestone: MVP1 — Foundation.**
- Authentication + role-based access control (RBAC)
- Patient management / Master Patient Index (registration, list, search, dedup)
- Clinical charting: **SOAP encounter** (Subjective / Objective / Assessment / Plan) — this is the product's core screen. The visual reference is the eagis.ai chart screenshot the user shared.

Later MVPs (do NOT build unless explicitly asked): IPD workflows, pharmacy/inventory, lab, offline sync engine, FHIR/DHIS2 interop, national warehouse & analytics, Kubernetes infra.

## 2. Stack (decided — do not swap without asking)

| Layer     | Choice                                             |
|-----------|----------------------------------------------------|
| Frontend  | React + TypeScript + Vite                          |
| Backend   | Python **FastAPI** (Pydantic v2)                   |
| ORM/DB    | SQLAlchemy 2.0 style → **SQLite** dev (Postgres-ready) |
| Auth      | JWT (access token) + bcrypt password hashing, RBAC |
| Styling   | CSS modules / plain CSS, clean clinical UI (green accent, matches reference) |

Environment: Windows, Python 3.9 (anaconda), Node 24. **Python 3.9 constraints:** no `X | Y` union syntax at runtime — use `Optional[...]` / `Union[...]` from `typing`, and put `from __future__ import annotations` at the top of modules using modern hints.

## 3. Repository layout

```
EMR_Francordsoft/
├── CLAUDE.md
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + CORS + router wiring
│   │   ├── database.py        # engine, session, Base
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── auth.py            # JWT, password hashing, RBAC deps
│   │   ├── seed.py            # demo users + sample patients/encounters
│   │   └── routers/           # auth, patients, encounters, ...
│   ├── requirements.txt
│   └── .venv/                 # local virtualenv (gitignored)
└── frontend/
    └── src/
        ├── api/               # typed API client (fetch wrappers)
        ├── auth/              # auth context, protected routes
        ├── components/        # reusable UI
        ├── pages/             # Login, Patients, PatientChart, Encounter
        └── types/             # shared TS types (mirror backend schemas)
```

## 4. Commands

Backend (from `backend/`):
- Setup: `python -m venv .venv && .venv/Scripts/pip install -r requirements.txt`
- Seed DB: `.venv/Scripts/python -m app.seed`
- Run: `.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000`
- Docs live at `http://localhost:8000/docs`

Frontend (from `frontend/`):
- Setup: `npm install`
- Run: `npm run dev` (Vite, default port 5173)
- Build: `npm run build`

## 5. Conventions

**Backend**
- Thin routers, logic in small functions; Pydantic schemas for every request/response — never return raw ORM objects.
- Every list endpoint supports search/pagination where it makes sense. Timestamps are UTC ISO-8601.
- Errors: raise `HTTPException` with correct status codes. Never leak stack traces to clients.
- Secrets/config via env vars with sane dev defaults (`SECRET_KEY`, `DATABASE_URL`).

**Frontend**
- Function components + hooks only. TypeScript strict. No `any` unless justified with a comment.
- All server calls go through `src/api/` — components never call `fetch` directly.
- Loading + error + empty states for every data view. No unhandled promise rejections.
- Keep the clinical UI fast, dense, and role-aware — this is for busy facilities.

**Both**
- TS types mirror Pydantic schemas; keep them in sync when either changes.
- Small, focused files. Name things for the domain (Patient, Encounter, Diagnosis), not generic (Data, Item).

## 6. Domain rules (healthcare — take seriously)

- **All clinical data in this repo is synthetic/demo.** Never present demo patient data as real. Seed data must be obviously fictional.
- Model real EMR concepts correctly: MRN/PRN identifiers, ICD-10 for diagnoses, SOAP encounter structure, vitals with units, medication dose/form/frequency, allergy flags.
- **Patient safety over cleverness:** allergy and high-risk alerts must be prominent and never silently dropped. Signed encounters are immutable (create an amendment, don't mutate).
- Design for **audit**: who did what, when. Even in MVP1, stamp created_by / created_at on clinical records.
- RBAC is not decoration: enforce it server-side, not just by hiding UI.

## 7. Workflow rules for the agent

- Follow the **`senior-fullstack` skill** for how to work (plan → vertical slice → verify → review). Invoke it at the start of a build session.
- **Role skills** (in `.claude/skills/`) capture the disciplines this project needs — invoke the one that fits the task:
  - `emr-backend-engineer` — FastAPI routes, models, schemas, RBAC, seed (anaconda SSL gotcha, admin-only gates).
  - `emr-frontend-engineer` — React/TS pages, typed API client, role-aware UI, eagis design system.
  - `emr-qa-verifier` — run servers, curl RBAC checks per role, headless-Chrome (CDP) screenshots.
- Build in **thin vertical slices** (DB → API → UI → runs) so there's always something demoable. Don't scaffold 20 empty files.
- **Verify before claiming done:** actually run the backend and hit the endpoint / load the page. Report real output, including failures.
- Prefer editing existing files over adding parallel ones. Delete dead code.
- Keep this file and the README updated when structure or commands change.
- Only commit/push when the user asks. Working branch: `master`.
