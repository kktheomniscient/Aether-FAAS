from fastapi import FastAPI, Body, HTTPException, Depends
import json
from typing import Any
from shared.rq_jobs import run_task_in_sandbox
import uuid
from webServer.auth import router as auth_router, get_current_user
from webServer.connections import BUCKET_NAME, client, q, s3

app = FastAPI()
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
        if job is None:
            jobs.append({"job_id": job_id, "status": "missing"})
            continue
        jobs.append(
            {
                "job_id": job_id,
                "status": job.get_status(),
                "is_finished": job.is_finished,
                "is_failed": job.is_failed,
            }
        )

    return {
        "task_id": task_id,
        "owner": user_email,
        "code": code,
        "requirements": requirements,
        "metadata": metadata,
        "jobs": jobs,
    }


@app.get("/job/{job_id}")
def get_job_result(job_id: str, user_email: str = Depends(get_current_user)):
    """Retrieve the execution result of a queued job."""
    try:
        job = q.fetch_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        
        return {
            "job_id": job_id,
            "status": job.get_status(),
            "result": job.result if job.result else None,
            "is_finished": job.is_finished,
            "is_failed": job.is_failed,
            "exc_info": job.exc_info if job.exc_info else None,
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
        if job is None:
            jobs.append({"job_id": job_id, "status": "missing"})
            continue
        jobs.append(
            {
                "job_id": job_id,
                "status": job.get_status(),
                "is_finished": job.is_finished,
                "is_failed": job.is_failed,
            }
        )

    return {"task_id": task_id, "job_count": len(job_ids), "jobs": jobs}


@app.get("/functions")
def list_user_functions(user_email: str = Depends(get_current_user)):
    """Return a list of metadata for functions uploaded by the authenticated user."""
    results = []
    BUCKET = BUCKET_NAME
    kwargs = {"Bucket": BUCKET, "Prefix": ""}
    # paginate through objects and gather unique task_ids
    task_ids = set()
    try:
        while True:
            resp = s3.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                key = obj.get("Key", "")
                if not key:
                    continue
                # extract task id from keys like '{task_id}/file'
                parts = key.split("/", 1)
                if parts:
                    task_ids.add(parts[0])
            if resp.get("IsTruncated"):
                kwargs["ContinuationToken"] = resp.get("NextContinuationToken")
            else:
                break
    except Exception:
        # if bucket doesn't exist or other error, return empty list
        return {"functions": []}

    # fetch metadata for each task_id and filter by owner
    for tid in task_ids:
        try:
            meta_obj = s3.get_object(Bucket=BUCKET, Key=f"{tid}/metadata.txt")
            meta_text = meta_obj["Body"].read().decode("utf-8")
            meta = json.loads(meta_text)
        except Exception:
            continue
        if meta.get("owner") == user_email:
            results.append(meta)

    return {"functions": results}

