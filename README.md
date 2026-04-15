# Aether

Aether is a Function-as-a-Service (FaaS) platform for writing, deploying, and executing Python functions in isolated Docker sandboxes.

This project combines:
- A React + TanStack frontend for authentication, function editing, and job history
- A FastAPI backend for auth, function/task storage, and job orchestration
- An RQ worker for sandboxed execution
- Redis for sessions and queue state
- MinIO (S3-compatible) for function artifacts

## Table of Contents

1. Overview
2. Architecture
3. Repository Structure
4. Prerequisites
5. Quick Start
6. Configuration
7. API Reference
8. Function Execution Lifecycle
9. License

## Overview

Aether is a developer-focused FaaS platform that lets users:
- Create an account and sign in
- Create functions with code and requirements
- Save and update existing functions
- Queue function runs
- Inspect run status, timing, output, and logs
- View per-function run summaries and recent jobs

## Architecture

At runtime, the Aether FaaS platform is composed of four services:

- `webserver` (FastAPI)
  - Authenticates users
  - Stores and retrieves function metadata and code references
  - Enqueues execution jobs to Redis/RQ
  - Serves function and job APIs

- `worker` (RQ Worker)
  - Reads queued jobs
  - Pulls code and requirements from MinIO
  - Runs user code in a constrained Docker container
  - Returns result payloads, logs, status, and timing

- `redis`
  - Session store (`session:*`)
  - User/function/job index sets and hashes
  - RQ queue backend

- `minio`
  - Stores function artifacts:
    - `code.py`
    - `requirements.txt`
    - `metadata.txt`

Frontend runs separately (Vite dev server) and calls backend APIs.

## Repository Structure

```text
.
|-- docker-compose.yml
|-- frontend/
|   |-- package.json
|   `-- src/
|       |-- lib/
|       `-- routes/
|-- webServer/
|   |-- main.py
|   |-- auth.py
|   |-- connections.py
|   `-- requirements.txt
|-- worker/
|   |-- orchestrator.py
|   |-- sandbox_executor.py
|   |-- connections.py
|   `-- requirements.txt
`-- shared/
    `-- rq_jobs.py
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ and npm (for frontend dev)
- Python 3.11+ (optional for local lint/syntax checks outside containers)

## Quick Start

### 1) Start infrastructure and backend services

From repository root:

```bash
docker compose up --build
```

This starts:
- Redis on `6379`
- MinIO API on `9000`
- MinIO Console on `9001`
- FastAPI backend on `8000`
- Worker service

### 2) Start frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server is typically `http://localhost:5173`.

### 3) Use the app

- Open the Aether frontend
- Sign up / sign in
- Create a new function
- Edit code and requirements
- Run now and inspect output/logs

## Configuration

### Backend and Worker Environment Variables

Configured in `docker-compose.yml`.

| Variable | Service | Default in Compose | Purpose |
|---|---|---|---|
| `REDIS_URL` | webserver, worker | `redis://redis:6379/0` | Redis connection |
| `MINIO_ENDPOINT` | webserver, worker | `http://minio:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | webserver, worker | `admin` | MinIO access key |
| `MINIO_SECRET_KEY` | webserver, worker | `password` | MinIO secret key |
| `SANDBOX_RUNTIME_IMAGE` | worker | `python:3.11-slim` | Execution runtime image |
| `SANDBOX_MEMORY_LIMIT` | worker | `256m` | Per-run memory limit |
| `SANDBOX_CPU_LIMIT` | worker | `0.50` | Per-run CPU fraction |
| `SANDBOX_TIMEOUT_SECONDS` | worker | `120` | Per-run timeout |
| `BUCKET_NAME` | webserver, worker | `lambda-functions` | MinIO bucket |
| `CORS_ALLOWED_ORIGINS` | webserver | builtin default list | CORS allowlist |

### Frontend Environment Variables

- `VITE_API_BASE_URL`
  - Backend base URL used by frontend API client
  - Default: `http://localhost:8000`

## API Reference

### Auth Endpoints

- `POST /auth/signup`
- `POST /auth/signin`
- `GET /auth/me`
- `POST /auth/signout`

Auth-protected routes require `Authorization: Bearer <token>`.

### Function and Job Endpoints

- `POST /deploy`
  - Upload function artifacts and metadata
- `POST /enqueue/{task_id}`
  - Queue a run for a function
- `PATCH /tasks/{task_id}`
  - Update code, requirements, and metadata
- `GET /tasks/{task_id}`
  - Fetch function details and job summary list
- `GET /tasks/{task_id}/jobs`
  - List jobs for a function
- `GET /tasks/{task_id}/job-times`
  - Timing-focused job list for a function
- `GET /job/{job_id}`
  - Fetch single job details/result
- `GET /functions`
  - List user functions with lightweight summary and status

### Status Fields

Job responses include:
- `status` (effective execution status)
- `rq_status` (raw RQ status)
- `is_finished`
- `is_failed`
- Timing fields: `created_at`, `enqueued_at`, `started_at`, `ended_at`, `duration_seconds`

## Function Execution Lifecycle

1. User creates function -> backend stores artifacts in MinIO
2. User queues run -> backend enqueues RQ job and tracks summary stats
3. Worker pulls artifacts -> launches isolated container
4. Worker installs dependencies (if provided), runs code, captures logs and timing
5. Worker returns result payload to RQ
6. Frontend polls job/task endpoints for live status and details

## License

This project is licensed under the MIT License.
See `LICENSE.md`.
