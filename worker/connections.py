import os

import boto3
import docker
from redis import Redis


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
BUCKET_NAME = os.getenv("BUCKET_NAME", "lambda-functions")
RUNTIME_IMAGE = os.getenv("SANDBOX_RUNTIME_IMAGE", "python:3.11-slim")
MEMORY_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "256m")
TIMEOUT_SECONDS = int(os.getenv("SANDBOX_TIMEOUT_SECONDS", "120"))
CPU_LIMIT = float(os.getenv("SANDBOX_CPU_LIMIT", "0.50"))
NANO_CPUS = int(CPU_LIMIT * 1_000_000_000)

redis_connection = Redis.from_url(REDIS_URL)

s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("MINIO_ENDPOINT"),
    aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    region_name="us-east-1",
)

docker_client = docker.from_env()
