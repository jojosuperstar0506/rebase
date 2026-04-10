"""
Auth v2: Email/password signup and login for self-serve SaaS customers.

Endpoints:
  POST /api/v2/auth/signup  — create account (status: pending)
  POST /api/v2/auth/login   — email/password login → JWT
"""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone

from ..db import get_pool
from ..utils.auth import hash_password, verify_password, create_token

router = APIRouter(prefix="/api/v2/auth", tags=["auth-v2"])


class SignupRequest(BaseModel):
    email: str
    password: str
    brand_name: str
    brand_name_en: str = ""
    industry_slug: str = "bag"


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(req: SignupRequest):
    """
    Create a new customer account.
    Account starts with status='pending' and requires admin approval before login works.
    """
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not req.email or "@" not in req.email:
        raise HTTPException(400, "Valid email required")
    if not req.brand_name.strip():
        raise HTTPException(400, "Brand name required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check email not already taken
        existing = await conn.fetchrow(
            "SELECT id FROM customers WHERE email = $1", req.email.lower()
        )
        if existing:
            raise HTTPException(409, "An account with this email already exists")

        # Look up industry
        industry = await conn.fetchrow(
            "SELECT id FROM industries WHERE slug = $1", req.industry_slug
        )
        if not industry:
            raise HTTPException(400, f"Unknown industry: {req.industry_slug}")

        # Create customer
        await conn.execute(
            """
            INSERT INTO customers (email, password_hash, brand_name, brand_name_en, industry_id)
            VALUES ($1, $2, $3, $4, $5)
            """,
            req.email.lower(),
            hash_password(req.password),
            req.brand_name.strip(),
            req.brand_name_en.strip(),
            industry["id"],
        )

    return {
        "message": "Account created. Your application is pending admin approval. "
                   "You will be able to log in once approved.",
        "email": req.email.lower(),
    }


@router.post("/login")
async def login(req: LoginRequest):
    """
    Email/password login for approved customers.
    Returns a JWT token valid for 7 days.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        customer = await conn.fetchrow(
            """
            SELECT id, email, password_hash, brand_name, status, role, industry_id
            FROM customers WHERE email = $1
            """,
            req.email.lower(),
        )

    if not customer:
        raise HTTPException(401, "Invalid email or password")

    if not verify_password(req.password, customer["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    if customer["status"] == "pending":
        raise HTTPException(403, "Your account is pending admin approval. You will receive access shortly.")

    if customer["status"] == "rejected":
        raise HTTPException(403, "Your account application was not approved. Please contact us for more information.")

    # Update last login
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE customers SET last_login = NOW() WHERE id = $1", customer["id"]
        )

    token = create_token({
        "sub": customer["id"],
        "email": customer["email"],
        "brand_name": customer["brand_name"],
        "role": customer["role"],
        "industry_id": customer["industry_id"],
    })

    return {
        "token": token,
        "customer": {
            "id": customer["id"],
            "email": customer["email"],
            "brand_name": customer["brand_name"],
            "status": customer["status"],
            "role": customer["role"],
        },
    }
