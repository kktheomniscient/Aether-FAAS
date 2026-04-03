from fastapi import FastAPI, Body, HTTPException
from redis import Redis
from rq import Queue
from shared.tasks import execute_function
import boto3
import os
import secrets
from werkzeug.security import generate_password_hash, check_password_hash

s3 = boto3.client(
    's3',
    endpoint_url=os.getenv("MINIO_ENDPOINT"),
    aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    region_name='us-east-1'
)

BUCKET_NAME = "lambda-functions"

try:
    s3.create_bucket(Bucket=BUCKET_NAME)
except s3.exceptions.BucketAlreadyOwnedByYou:
    pass

app = FastAPI()
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
client = Redis.from_url(REDIS_URL, decode_responses=True)
q = Queue(connection=Redis.from_url(REDIS_URL))

@app.post("/deploy/{task_id}")
async def deploy(task_id: str, code: str = Body(...), requirements: str = Body("")):
    # 1. Upload code and requirements to MinIO
    s3.put_object(Bucket=BUCKET_NAME, Key=f"{task_id}/code.py", Body=code)
    s3.put_object(Bucket=BUCKET_NAME, Key=f"{task_id}/requirements.txt", Body=requirements)

    # 2. Push task ID to Redis Queue
    q.enqueue("task_queue", task_id)
    
    return {"status": "queued", "task_id": task_id}


@app.post("/auth/signup")
def signup(payload: dict = Body(...)):
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")
    key = f"user:{email}"
    if client.exists(key):
        raise HTTPException(status_code=400, detail="user already exists")
    hashed = generate_password_hash(password)
    client.hset(key, mapping={"password": hashed})
    return {"email": email, "status": "created"}


@app.post("/auth/signin")
def signin(payload: dict = Body(...)):
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")
    key = f"user:{email}"
    if not client.exists(key):
        raise HTTPException(status_code=404, detail="user not found")
    hashed = client.hget(key, "password")
    if not hashed or not check_password_hash(hashed, password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = secrets.token_urlsafe(32)
    client.setex(f"session:{token}", 60 * 60 * 24, email)
    return {"access_token": token, "token_type": "bearer"}