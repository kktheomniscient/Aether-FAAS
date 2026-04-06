from typing import Any

from rq import get_current_job


def run_task_in_sandbox(task_id: str) -> dict[str, Any]:
    """RQ job entrypoint that delegates execution to the worker orchestrator."""
    job = get_current_job()
    job_id = job.id if job else None

    # Import lazily so the web server can enqueue without requiring docker SDK.
    from worker.sandbox_executor import execute_task_in_sandbox

    return execute_task_in_sandbox(task_id=task_id, job_id=job_id)
