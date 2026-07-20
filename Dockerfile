# Single-image build: FastAPI backend serves the built React frontend on one
# origin (no CORS/proxy). Suitable for AWS App Runner / ECS Fargate / Elastic
# Beanstalk (Docker) / Lightsail Containers.

# --- Stage 1: build the frontend ---------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend + static frontend --------------------------------------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Built SPA is served by FastAPI from ./static (see app/main.py).
COPY --from=frontend /app/frontend/dist ./static

ENV FRONTEND_DIR=/app/static \
    SEED_ON_START=1 \
    PORT=8000
# NOTE: set SECRET_KEY (and DATABASE_URL for Postgres) as runtime env vars.
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
