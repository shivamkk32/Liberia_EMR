# Deploying to AWS

This app ships as **one Docker image**: the FastAPI backend serves the built
React frontend on the same origin, so the UI's relative `/api` calls work with
no CORS or proxy. The image seeds demo data on first boot.

> **Database note:** this build keeps **SQLite** (`emr.db` inside the container).
> On AWS the container filesystem is **ephemeral** — data resets on every deploy,
> restart, or scale event. That's fine for a demo. For persistence, switch to
> **Amazon RDS for PostgreSQL** later: set `DATABASE_URL=postgresql+psycopg://…`
> and add `psycopg[binary]` to `backend/requirements.txt` (the code already reads
> `DATABASE_URL`).

## Build & run locally (parity with prod)

```bash
docker build -t national-emr .
docker run -p 8000:8000 -e SECRET_KEY=change-me national-emr
# open http://localhost:8000  (login: admin / emr1234)
```

## Option A — AWS App Runner (simplest)

1. Push the image to **Amazon ECR**:
   ```bash
   aws ecr create-repository --repository-name national-emr
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
   docker build -t national-emr .
   docker tag national-emr:latest <acct>.dkr.ecr.<region>.amazonaws.com/national-emr:latest
   docker push <acct>.dkr.ecr.<region>.amazonaws.com/national-emr:latest
   ```
2. App Runner → **Create service** → source = that ECR image.
3. Port: **8000**. Env vars: `SECRET_KEY` (required), optional `SEED_ON_START=1`.
4. Deploy → App Runner gives you an HTTPS URL. Done.

App Runner can also build straight from a **connected GitHub repo** (it detects
the `Dockerfile`) — no manual ECR push needed.

## Option B — Elastic Beanstalk (Docker platform)

```bash
eb init -p docker national-emr
eb create national-emr-env --envvars SECRET_KEY=change-me
eb open
```

## Option C — ECS Fargate

Push to ECR (as above), create a Fargate task definition (container port 8000,
env `SECRET_KEY`), and an ALB-fronted service.

## Required / useful env vars

| Var | Purpose | Default |
|-----|---------|---------|
| `SECRET_KEY` | JWT signing — **set this** | dev default (insecure) |
| `PORT` | listen port | `8000` |
| `SEED_ON_START` | seed demo data if DB empty | `1` |
| `DATABASE_URL` | swap to Postgres for persistence | SQLite file |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | session length | `480` |

## Demo logins (password `emr1234`)
`admin` (System Admin) · `fadmin` (Facility Admin) · `sjohnson`/`mleo` (Doctors) ·
`nwang` (Nurse) · `pmoore` (Pharmacist) · `ltech` (Lab) · `fdesk` (Front Desk)
