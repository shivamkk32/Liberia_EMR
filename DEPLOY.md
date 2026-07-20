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

## Continuous deployment — push to GitHub → auto-deploy on AWS

`.github/workflows/deploy.yml` builds the image and pushes it to ECR on every
push to `main`; App Runner deploys it. Everything runs in the cloud (no laptop).

### One-time AWS setup (run in **AWS CloudShell** — no localhost needed)

1. **Create the ECR repository**
   ```bash
   aws ecr create-repository --repository-name liberia-emr --region <region>
   ```

2. **Create an IAM user for GitHub Actions** (or use OIDC — more secure) with
   ECR push + App Runner deploy permissions, then create an access key:
   ```bash
   aws iam create-user --user-name gh-actions-emr
   aws iam attach-user-policy --user-name gh-actions-emr \
     --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
   aws iam attach-user-policy --user-name gh-actions-emr \
     --policy-arn arn:aws:iam::aws:policy/AWSAppRunnerFullAccess
   aws iam create-access-key --user-name gh-actions-emr   # note the keys
   ```

3. **Do the first image push once** so App Runner has something to point at
   (from CloudShell — it has Docker + your account):
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REGION=<region>
   aws ecr get-login-password --region $REGION | docker login --username AWS \
     --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
   git clone https://github.com/shivamkk32/Liberia_EMR.git && cd Liberia_EMR
   docker build -t $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/liberia-emr:latest .
   docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/liberia-emr:latest
   ```

4. **Create the App Runner service** → console → *Create service* →
   Source = **Container registry / Amazon ECR** → the `liberia-emr:latest` image →
   **Deployment trigger = Automatic** → Port **8000** → env var `SECRET_KEY=<random>`.
   App Runner gives you an HTTPS URL and redeploys whenever `:latest` changes.

5. **Add GitHub repo settings** (Settings → Secrets and variables → Actions):
   - **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - **Variables:** `AWS_REGION` (e.g. `us-east-1`), `ECR_REPOSITORY` (`liberia-emr`),
     and optionally `APPRUNNER_SERVICE_ARN` (from step 4) to force a redeploy each push.

After that: **every `git push` to `main`** rebuilds and redeploys automatically —
watch it under the repo's **Actions** tab.

> SQLite reminder: App Runner storage is ephemeral, so demo data resets on each
> deploy. Switch `DATABASE_URL` to Amazon RDS Postgres when you need persistence.

## Demo logins (password `emr1234`)
`admin` (System Admin) · `fadmin` (Facility Admin) · `sjohnson`/`mleo` (Doctors) ·
`nwang` (Nurse) · `pmoore` (Pharmacist) · `ltech` (Lab) · `fdesk` (Front Desk)
