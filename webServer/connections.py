import os

import boto3
from redis import Redis
from rq import Queue


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Text-oriented Redis client for auth/session/app metadata.
client = Redis.from_url(REDIS_URL, decode_responses=True)

# Binary-safe Redis connection for RQ payloads.
rq_redis = Redis.from_url(REDIS_URL)
q = Queue(connection=rq_redis)

BUCKET_NAME = os.getenv("BUCKET_NAME", "lambda-functions")
s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("MINIO_ENDPOINT"),
    aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    region_name="us-east-1",
)

try:
    s3.create_bucket(Bucket=BUCKET_NAME)
except s3.exceptions.BucketAlreadyOwnedByYou:
    pass