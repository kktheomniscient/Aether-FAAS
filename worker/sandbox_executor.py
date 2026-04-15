import io
import tarfile
import uuid
import time
from datetime import datetime, timezone
from typing import Any

import docker
from botocore.exceptions import ClientError

from worker.connections import (
    BUCKET_NAME,
    MEMORY_LIMIT,
    NANO_CPUS,
    RUNTIME_IMAGE,
    TIMEOUT_SECONDS,
    docker_client,
    s3,
)


def _read_minio_text(task_id: str, filename: str, required: bool = True) -> str:
    key = f"{task_id}/{filename}"
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return obj["Body"].read().decode("utf-8")
    except ClientError as exc:
        if not required and exc.response.get("Error", {}).get("Code") == "NoSuchKey":
            return ""
        raise


def _build_workspace_archive(code: str, requirements: str) -> bytes:
    archive_buffer = io.BytesIO()
    with tarfile.open(fileobj=archive_buffer, mode="w") as tar:
        files = {
            "workspace/code.py": code,
            "workspace/requirements.txt": requirements,
        }
        for path, text in files.items():
            content = text.encode("utf-8")
            info = tarfile.TarInfo(name=path)
            info.size = len(content)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(content))

    archive_buffer.seek(0)
    return archive_buffer.read()


def _ensure_runtime_image() -> None:
    try:
        docker_client.images.get(RUNTIME_IMAGE)
    except docker.errors.ImageNotFound:
        docker_client.images.pull(RUNTIME_IMAGE)


def execute_task_in_sandbox(task_id: str, job_id: str | None) -> dict[str, Any]:
    """Fetch task artifacts and run user code in a constrained, isolated container."""
    container = None
    logs = ""
    container_name = f"fn-run-{task_id[:8]}-{uuid.uuid4().hex[:6]}"

    try:
        code = _read_minio_text(task_id=task_id, filename="code.py", required=True)
        requirements = _read_minio_text(task_id=task_id, filename="requirements.txt", required=False)
    except Exception as exc:
        return {
            "job_id": job_id,
            "task_id": task_id,
            "status": "failed",
            "phase": "artifact-fetch",
            "error": str(exc),
        }

    try:
        _ensure_runtime_image()
        container = docker_client.containers.create(
            image=RUNTIME_IMAGE,
            name=container_name,
            command=(
                "sh -lc \""
                "if [ -s /workspace/requirements.txt ]; then "
                "python -m pip install --no-cache-dir -r /workspace/requirements.txt; "
                "fi; "
                "python /workspace/code.py"
                "\""
            ),
            working_dir="/workspace",
            # network_disabled=True,
            mem_limit=MEMORY_LIMIT,
            nano_cpus=NANO_CPUS,
            detach=True,
            auto_remove=False,
        )

        archive = _build_workspace_archive(code=code, requirements=requirements)
        container.put_archive("/", archive)
        started_at = datetime.now(timezone.utc)
        start_perf = time.perf_counter()
        container.start()
        wait_result = container.wait(timeout=TIMEOUT_SECONDS)
        end_perf = time.perf_counter()
        ended_at = datetime.now(timezone.utc)
        logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        exit_code = int(wait_result.get("StatusCode", 1))
        container_duration_seconds = max(end_perf - start_perf, 0.0)

        return {
            "job_id": job_id,
            "task_id": task_id,
            "status": "completed" if exit_code == 0 else "failed",
            "exit_code": exit_code,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "container_execution_duration_seconds": container_duration_seconds,
            "logs": logs,
            "container_name": container_name,
            "resource_limits": {
                "memory": MEMORY_LIMIT,
                "nano_cpus": NANO_CPUS,
                "timeout_seconds": TIMEOUT_SECONDS,
            },
        }
    except Exception as exc:
        return {
            "job_id": job_id,
            "task_id": task_id,
            "status": "failed",
            "phase": "sandbox-run",
            "logs": logs,
            "error": str(exc),
            "container_name": container_name,
        }
    finally:
        if container is not None:
            try:
                container.remove(force=True)
            except Exception:
                pass
