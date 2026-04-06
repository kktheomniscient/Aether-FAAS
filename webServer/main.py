from fastapi import FastAPI, Body, HTTPException, Depends
import json
from shared.rq_jobs import run_task_in_sandbox
import uuid
from webServer.auth import router as auth_router, get_current_user
from webServer.connections import BUCKET_NAME, client, q, s3

app = FastAPI()
app.include_router(auth_router)


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
    s3.put_object(Bucket=BUCKET_NAME, Key=f"{task_id}/code.py", Body=code)
    s3.put_object(Bucket=BUCKET_NAME, Key=f"{task_id}/requirements.txt", Body=requirements)
    # 1.b save metadata (name, description, owner)
    metadata = {
        "task_id": task_id,
        "owner": user_email,
        "name": name or "",
        "description": description or "",
    }
    s3.put_object(Bucket=BUCKET_NAME, Key=f"{task_id}/metadata.txt", Body=json.dumps(metadata))

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
    # quick check: verify task_id is registered under this user in Redis
    try:
        if not client.sismember(f"user:{user_email}:tasks", task_id):
            raise HTTPException(status_code=403, detail="not allowed to enqueue this task")
    except HTTPException:
        raise
    except Exception:
        # if Redis is unavailable, fall back to checking metadata ownership in MinIO
        try:
            meta_obj = s3.get_object(Bucket=BUCKET_NAME, Key=f"{task_id}/metadata.txt")
            meta_text = meta_obj["Body"].read().decode("utf-8")
            meta = json.loads(meta_text)
            if meta.get("owner") != user_email:
                raise HTTPException(status_code=403, detail="not allowed to enqueue this task")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="task metadata not found")

    # enqueue the task for worker processing
    job = q.enqueue(run_task_in_sandbox, task_id)
    return {"status": "queued", "task_id": task_id, "job_id": job.id}


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

