from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from werkzeug.security import check_password_hash, generate_password_hash
import secrets

from webServer.connections import client

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


class AuthRequest(BaseModel):
    email: str
    password: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    email = client.get(f"session:{token}")
    if not email:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    return email


@router.post("/signup")
def signup(payload: AuthRequest):
    email = _normalize_email(payload.email)
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")

    key = f"user:{email}"
    if client.exists(key):
        raise HTTPException(status_code=400, detail="user already exists")

    hashed = generate_password_hash(password)
    client.hset(key, mapping={"password": hashed})
    return {"email": email, "status": "created"}


@router.post("/signin")
def signin(payload: AuthRequest):
    email = _normalize_email(payload.email)
    password = payload.password

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
    return {"access_token": token, "token_type": "bearer", "email": email}


@router.get("/me")
def me(user_email: str = Depends(get_current_user)):
    return {"email": user_email}


@router.post("/signout")
def signout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    client.delete(f"session:{token}")
    return {"status": "signed_out"}
