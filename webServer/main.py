import os
from datetime import datetime, timezone
from fastapi import FastAPI, Body, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Any
from shared.rq_jobs import run_task_in_sandbox
import uuid
from webServer.auth import router as auth_router, get_current_user
from webServer.connections import BUCKET_NAME, client, q, s3

app = FastAPI()

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


def _assert_user_owns_task(task_id: str, user_email: str) -> None:
    """Authorize access to a task using Redis first, then MinIO metadata fallback."""
    try:
        if not client.sismember(f"user:{user_email}:tasks", task_id):
            raise HTTPException(status_code=403, detail="not allowed to access this task")
        return
    except HTTPException:
        raise
    except Exception:
        # Redis unavailable: fall back to metadata ownership in MinIO.
        try:
            meta_obj = s3.get_object(Bucket=BUCKET_NAME, Key=f"{task_id}/metadata.txt")
            meta_text = meta_obj["Body"].read().decode("utf-8")
            meta = json.loads(meta_text)
            if meta.get("owner") != user_email:
                raise HTTPException(status_code=403, detail="not allowed to access this task")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="task metadata not found")


def _load_task_metadata(task_id: str) -> dict[str, Any]:
    """Load task metadata JSON from MinIO, returning an empty dict if unreadable."""
    try:
        meta_obj = s3.get_object(Bucket=BUCKET_NAME, Key=f"{task_id}/metadata.txt")
        meta_text = meta_obj["Body"].read().decode("utf-8")
        parsed = json.loads(meta_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _read_task_text(task_id: str, filename: str, required: bool = True) -> str:
    """Read task text artifacts from MinIO."""
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=f"{task_id}/{filename}")
        return obj["Body"].read().decode("utf-8")
    except Exception:
        if required:
            raise HTTPException(status_code=404, detail=f"{filename} not found")
        return ""


def _iso_datetime(value: Any) -> str | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed.startswith("-"):
            digits = trimmed[1:]
            return -int(digits) if digits.isdigit() else None
        return int(trimmed) if trimmed.isdigit() else None
    return None


def _job_duration_seconds(job: Any) -> float | None:
    if isinstance(getattr(job, "result", None), dict):
        result_duration = _coerce_float(job.result.get("container_execution_duration_seconds"))
        if result_duration is not None:
            return result_duration

    started_at = getattr(job, "started_at", None)
    ended_at = getattr(job, "ended_at", None)
    if isinstance(started_at, datetime) and isinstance(ended_at, datetime):
        return max((ended_at - started_at).total_seconds(), 0.0)

    return None


def _effective_job_status(job: Any) -> str:
    """Derive execution status using both RQ state and worker result payload."""
    rq_status = (job.get_status() or "").lower()

    result = getattr(job, "result", None)
    if isinstance(result, dict):
        result_status_raw = result.get("status")
        result_status = (
            str(result_status_raw).strip().lower()
            if isinstance(result_status_raw, str)
            else ""
        )
        exit_code = _coerce_int(result.get("exit_code"))
        if exit_code is None:
            exit_code = _coerce_int(result.get("StatusCode"))

        if result_status in {"failed", "error", "exited", "dead", "oomkilled", "killed"}:
            return "failed"
        if exit_code is not None and exit_code != 0:
            return "failed"
        if result_status in {"completed", "finished", "success"}:
            return "completed"
        if result_status in {"running", "started"}:
            return "running"
        if result_status in {"queued", "deferred", "scheduled"}:
            return "queued"

    if rq_status in {"failed", "stopped", "canceled", "cancelled", "error"}:
        return "failed"
    if rq_status in {"started", "running"}:
        return "running"
    if rq_status in {"queued", "deferred", "scheduled"}:
        return "queued"
    if rq_status in {"finished", "completed", "success"}:
        return "completed"
    return rq_status or "unknown"


def _job_status_to_function_status(status: str | None) -> str:
    normalized = (status or "").lower()
    if normalized in {"queued", "deferred", "scheduled", "started", "running"}:
        return "deploying"
    if normalized in {"failed", "stopped", "canceled", "error"}:
        return "error"
    return "ready"


def _task_summary_key(user_email: str, task_id: str) -> str:
    return f"user:{user_email}:task:{task_id}:summary"


def _job_owner_key(user_email: str, job_id: str) -> str:
    return f"user:{user_email}:job:{job_id}:task"


def _get_task_summary(user_email: str, task_id: str) -> dict[str, Any]:
    summary = {
        "runs_count": 0,
        "last_run_at": None,
        "last_job_id": None,
    }
    try:
        raw = client.hgetall(_task_summary_key(user_email=user_email, task_id=task_id))
        if raw:
            runs_count_raw = raw.get("runs_count")
            if isinstance(runs_count_raw, str) and runs_count_raw.isdigit():
                summary["runs_count"] = int(runs_count_raw)
            summary["last_run_at"] = raw.get("last_run_at") or None
            summary["last_job_id"] = raw.get("last_job_id") or None
            return summary
    except Exception:
        pass

    # Fallback for old tasks created before summary tracking.
    try:
        summary["runs_count"] = int(client.scard(f"user:{user_email}:task:{task_id}:jobs"))
    except Exception:
        summary["runs_count"] = 0

    return summary


def _job_timing_fields(job: Any) -> dict[str, Any]:
    return {
        "created_at": _iso_datetime(getattr(job, "created_at", None)),
        "enqueued_at": _iso_datetime(getattr(job, "enqueued_at", None)),
        "started_at": _iso_datetime(getattr(job, "started_at", None)),
        "ended_at": _iso_datetime(getattr(job, "ended_at", None)),
        "duration_seconds": _job_duration_seconds(job),
    }


def _job_to_summary(job_id: str, job: Any | None) -> dict[str, Any]:
    if job is None:
        return {"job_id": job_id, "status": "missing"}

    return {
        "job_id": job_id,
        "status": _effective_job_status(job),
        "rq_status": job.get_status(),
        "is_finished": job.is_finished,
        "is_failed": job.is_failed,
        **_job_timing_fields(job),
    }


def _assert_user_owns_job(job_id: str, user_email: str) -> str:
    """Authorize access to a job and return its owning task_id."""
    try:
        mapped_task_id = client.get(_job_owner_key(user_email=user_email, job_id=job_id))
        if isinstance(mapped_task_id, str) and mapped_task_id:
            return mapped_task_id
    except Exception:
        pass

    # Backward-compatible fallback for jobs queued before job-owner mapping existed.
    try:
        for task_id in client.smembers(f"user:{user_email}:tasks"):
            if client.sismember(f"user:{user_email}:task:{task_id}:jobs", job_id):
                return task_id
    except Exception:
        pass

    raise HTTPException(status_code=403, detail="not allowed to access this job")


def _list_user_task_ids(user_email: str) -> list[str]:
    """Get user task IDs from Redis index first; fallback to MinIO scan."""
    try:
        redis_task_ids = {
            task_id
            for task_id in client.smembers(f"user:{user_email}:tasks")
            if isinstance(task_id, str) and task_id
        }
        if redis_task_ids:
            return sorted(redis_task_ids)
    except Exception:
        pass

    # Fallback path for legacy data when Redis index is unavailable or empty.
    task_ids = set()
    kwargs = {"Bucket": BUCKET_NAME, "Prefix": ""}
    try:
        while True:
            resp = s3.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                key = obj.get("Key", "")
                if not key:
                    continue
                parts = key.split("/", 1)
                if parts and parts[0]:
                    task_ids.add(parts[0])
            if resp.get("IsTruncated"):
                kwargs["ContinuationToken"] = resp.get("NextContinuationToken")
            else:
                break
    except Exception:
        return []

    return sorted(task_ids)


@app.post("/deploy")
async def deploy(
    code: str = Body(...),
    requirements: str = Body(""),
    name: str | None = Body(None),
    description: str | None = Body(None),
    user_email: str = Depends(get_current_user),
):
    # generate task id server-side
    task_id = uuid.uuid4().hex

    # 1. Upload code and requirements to MinIO
    s3.put_object(
        Bucket=BUCKET_NAME, Key=f"{task_id}/code.py", 
        Body=code, 
        ContentType="text/plain"
    )
    s3.put_object(
        Bucket=BUCKET_NAME, 
        Key=f"{task_id}/requirements.txt", 
        Body=requirements, 
        ContentType="text/plain"
    )
    # 1.b save metadata (name, description, owner)
    metadata = {
        "task_id": task_id,
        "owner": user_email,
        "name": name or "",
        "description": description or "",
    }
    s3.put_object(
        Bucket=BUCKET_NAME, Key=f"{task_id}/metadata.txt", 
        Body=json.dumps(metadata), 
        ContentType="text/plain"
    )

    # register task under the user's Redis set for quick lookup
    try:
        client.sadd(f"user:{user_email}:tasks", task_id)
    except Exception:
        # non-fatal: continue even if Redis update fails
        pass

    # done: files uploaded to MinIO, return task_id (no enqueue)
    return {"status": "uploaded", "task_id": task_id, "owner": user_email}


@app.post("/enqueue/{task_id}")
def enqueue_task(task_id: str, user_email: str = Depends(get_current_user)):
    # verify this task belongs to the authenticated user
    _assert_user_owns_task(task_id=task_id, user_email=user_email)

    # enqueue the task for worker processing
    # Keep job records/results indefinitely in Redis (no result/failure expiry).
    job = q.enqueue(run_task_in_sandbox, task_id, result_ttl=-1, failure_ttl=-1)

    # Map user+task -> job IDs so jobs can be queried by task later.
    try:
        client.sadd(f"user:{user_email}:task:{task_id}:jobs", job.id)
        client.hincrby(_task_summary_key(user_email=user_email, task_id=task_id), "runs_count", 1)
        client.hset(
            _task_summary_key(user_email=user_email, task_id=task_id),
            mapping={
                "last_run_at": datetime.now(timezone.utc).isoformat(),
                "last_job_id": job.id,
            },
        )
        client.set(_job_owner_key(user_email=user_email, job_id=job.id), task_id)
    except Exception:
        # non-fatal: job is queued even if index update fails
        pass

    return {"status": "queued", "task_id": task_id, "job_id": job.id}


@app.patch("/tasks/{task_id}")
def update_task(
    task_id: str,
    code: str | None = Body(None),
    requirements: str | None = Body(None),
    name: str | None = Body(None),
    description: str | None = Body(None),
    metadata: dict[str, Any] | None = Body(None),
    user_email: str = Depends(get_current_user),
):
    """Update an existing task's artifacts while preserving task_id and owner."""
    _assert_user_owns_task(task_id=task_id, user_email=user_email)

    if (
        code is None
        and requirements is None
        and name is None
        and description is None
        and metadata is None
    ):
        raise HTTPException(status_code=400, detail="no fields provided to update")

    updated_fields = []

    if code is not None:
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=f"{task_id}/code.py",
            Body=code,
            ContentType="text/plain",
        )
        updated_fields.append("code")

    if requirements is not None:
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=f"{task_id}/requirements.txt",
            Body=requirements,
            ContentType="text/plain",
        )
        updated_fields.append("requirements")

    # Metadata merge: caller can add arbitrary keys, but task identity stays immutable.
    if metadata is not None or name is not None or description is not None:
        merged_metadata = _load_task_metadata(task_id)
        if metadata is not None:
            merged_metadata.update(metadata)
        if name is not None:
            merged_metadata["name"] = name
        if description is not None:
            merged_metadata["description"] = description

        # Always enforce immutable identity fields.
        merged_metadata["task_id"] = task_id
        merged_metadata["owner"] = user_email

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=f"{task_id}/metadata.txt",
            Body=json.dumps(merged_metadata),
            ContentType="text/plain",
        )
        updated_fields.append("metadata")

    return {
        "status": "updated",
        "task_id": task_id,
        "owner": user_email,
        "updated_fields": updated_fields,
    }


@app.get("/tasks/{task_id}")
def get_task(task_id: str, user_email: str = Depends(get_current_user)):
    """Return current task artifacts and metadata for the authenticated owner."""
    _assert_user_owns_task(task_id=task_id, user_email=user_email)

    code = _read_task_text(task_id=task_id, filename="code.py", required=True)
    requirements = _read_task_text(task_id=task_id, filename="requirements.txt", required=False)
    metadata = _load_task_metadata(task_id)

    # Normalize key identity fields in response.
    metadata["task_id"] = task_id
    metadata["owner"] = user_email

    try:
        job_ids = sorted(client.smembers(f"user:{user_email}:task:{task_id}:jobs"))
    except Exception:
        job_ids = []

    jobs = []
    for job_id in job_ids:
        job = q.fetch_job(job_id)
        jobs.append(_job_to_summary(job_id=job_id, job=job))

    return {
        "task_id": task_id,
        "owner": user_email,
        "code": code,
        "requirements": requirements,
        "metadata": metadata,
        "summary": _get_task_summary(user_email=user_email, task_id=task_id),
        "jobs": jobs,
    }


@app.get("/job/{job_id}")
def get_job_result(job_id: str, user_email: str = Depends(get_current_user)):
    """Retrieve the execution result of a queued job."""
    try:
        task_id = _assert_user_owns_job(job_id=job_id, user_email=user_email)
        job = q.fetch_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        
        return {
            "job_id": job_id,
            "task_id": task_id,
            "status": _effective_job_status(job),
            "rq_status": job.get_status(),
            "result": job.result if job.result else None,
            "is_finished": job.is_finished,
            "is_failed": job.is_failed,
            "exc_info": job.exc_info if job.exc_info else None,
            **_job_timing_fields(job),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/tasks/{task_id}/jobs")
def list_task_jobs(task_id: str, user_email: str = Depends(get_current_user)):
    """Return all job IDs and statuses recorded for a user task."""
    _assert_user_owns_task(task_id=task_id, user_email=user_email)

    try:
        job_ids = sorted(client.smembers(f"user:{user_email}:task:{task_id}:jobs"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    jobs = []
    for job_id in job_ids:
        job = q.fetch_job(job_id)
        jobs.append(_job_to_summary(job_id=job_id, job=job))

    return {
        "task_id": task_id,
        "job_count": len(job_ids),
        "summary": _get_task_summary(user_email=user_email, task_id=task_id),
        "jobs": jobs,
    }


@app.get("/tasks/{task_id}/job-times")
def list_task_job_times(task_id: str, user_email: str = Depends(get_current_user)):
    """Return timing-focused job metadata for a user task."""
    _assert_user_owns_task(task_id=task_id, user_email=user_email)

    try:
        job_ids = sorted(client.smembers(f"user:{user_email}:task:{task_id}:jobs"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    jobs = []
    for job_id in job_ids:
        job = q.fetch_job(job_id)
        jobs.append(_job_to_summary(job_id=job_id, job=job))

    return {
        "task_id": task_id,
        "job_count": len(job_ids),
        "summary": _get_task_summary(user_email=user_email, task_id=task_id),
        "jobs": jobs,
    }


@app.get("/functions")
def list_user_functions(user_email: str = Depends(get_current_user)):
    """Return user functions with a lightweight, performant execution summary."""
    results = []
    task_ids = _list_user_task_ids(user_email=user_email)

    # fetch metadata for each task_id and filter by owner
    for tid in task_ids:
        try:
            meta_obj = s3.get_object(Bucket=BUCKET_NAME, Key=f"{tid}/metadata.txt")
            meta_text = meta_obj["Body"].read().decode("utf-8")
            meta = json.loads(meta_text)
        except Exception:
            continue
        if meta.get("owner") == user_email:
            summary = _get_task_summary(user_email=user_email, task_id=tid)

            status = "ready"
            last_job_id = summary.get("last_job_id")
            if isinstance(last_job_id, str) and last_job_id:
                job = q.fetch_job(last_job_id)
                status = _job_status_to_function_status(
                    _effective_job_status(job) if job else "missing"
                )

            results.append(
                {
                    **meta,
                    "summary": summary,
                    "status": status,
                }
            )

    return {"functions": results}

