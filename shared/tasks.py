import boto3
import os


def execute_function(code_string: str):
    # This is where your FaaS logic lives
    return exec(code_string)


def execute_task(task_id: str):
    """Worker-invoked task: fetch code from object storage and execute it."""
    BUCKET_NAME = os.getenv("BUCKET_NAME", "lambda-functions")
    s3 = boto3.client(
        "s3",
        endpoint_url=os.getenv("MINIO_ENDPOINT"),
        aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
        region_name="us-east-1",
    )
    key = f"{task_id}/code.py"
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        code_bytes = obj["Body"].read()
        code = code_bytes.decode("utf-8")
    except Exception as e:
        return {"error": "failed to fetch code", "details": str(e)}

    try:
        result = execute_function(code)
        return {"task_id": task_id, "result": result}
    except Exception as e:
        return {"task_id": task_id, "error": str(e)}