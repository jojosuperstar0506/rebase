"""
Auth utilities: JWT creation/verification and password hashing.
"""
import os
import hashlib
import hmac
import base64
import json
import time
from typing import Optional


JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days


# ── Password hashing (using hashlib — no bcrypt dependency needed) ─────────────

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256."""
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
    return base64.b64encode(salt + key).decode()


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash."""
    try:
        decoded = base64.b64decode(stored_hash.encode())
        salt = decoded[:32]
        stored_key = decoded[32:]
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
        return hmac.compare_digest(key, stored_key)
    except Exception:
        return False


# ── JWT (manual implementation — no PyJWT dependency needed) ──────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def create_token(payload: dict) -> str:
    """Create a signed JWT token."""
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = {**payload, "iat": int(time.time()), "exp": int(time.time()) + JWT_EXPIRY_SECONDS}
    body = _b64url_encode(json.dumps(payload).encode())
    signature = hmac.new(
        JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256
    ).digest()
    return f"{header}.{body}.{_b64url_encode(signature)}"


def verify_token(token: str) -> Optional[dict]:
    """Verify a JWT token and return its payload, or None if invalid/expired."""
    try:
        header, body, sig = token.split(".")
        expected_sig = hmac.new(
            JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64url_decode(sig), expected_sig):
            return None
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
