"""
Admin customer management endpoints.

All endpoints require X-Admin-Password header matching ADMIN_SECRET env var.

Endpoints:
  GET    /api/v2/customers         — list all customers
  PATCH  /api/v2/customers/{id}    — approve or reject a customer
  DELETE /api/v2/customers/{id}    — delete a customer
"""
import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from ..db import get_pool

router = APIRouter(prefix="/api/v2/customers", tags=["customers-admin"])

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", os.environ.get("VITE_ADMIN_PASSWORD", "rebase-admin-2026"))


def check_admin(x_admin_password: Optional[str]):
    if not x_admin_password or x_admin_password != ADMIN_SECRET:
        raise HTTPException(401, "Unauthorized")


class UpdateCustomerRequest(BaseModel):
    status: str  # approved | rejected | pending
    notes: Optional[str] = None


@router.get("")
async def list_customers(x_admin_password: Optional[str] = Header(None)):
    """List all customers with their status."""
    check_admin(x_admin_password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.email, c.brand_name, c.brand_name_en, c.status, c.role,
                   c.notes, c.created_at, c.approved_at, c.last_login,
                   i.slug as industry_slug, i.name_en as industry_name
            FROM customers c
            LEFT JOIN industries i ON c.industry_id = i.id
            ORDER BY c.created_at DESC
            """
        )
    return {
        "customers": [
            {
                "id": r["id"],
                "email": r["email"],
                "brand_name": r["brand_name"],
                "brand_name_en": r["brand_name_en"],
                "status": r["status"],
                "role": r["role"],
                "notes": r["notes"],
                "industry": r["industry_slug"],
                "industry_name": r["industry_name"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "approved_at": r["approved_at"].isoformat() if r["approved_at"] else None,
                "last_login": r["last_login"].isoformat() if r["last_login"] else None,
            }
            for r in rows
        ]
    }


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: int,
    req: UpdateCustomerRequest,
    x_admin_password: Optional[str] = Header(None),
):
    """Approve, reject, or update a customer."""
    check_admin(x_admin_password)
    if req.status not in ("approved", "rejected", "pending"):
        raise HTTPException(400, "status must be approved, rejected, or pending")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE customers
            SET status = $1,
                notes = COALESCE($2, notes),
                approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END
            WHERE id = $3
            RETURNING id, email, brand_name, status, approved_at
            """,
            req.status, req.notes, customer_id,
        )
        if not row:
            raise HTTPException(404, "Customer not found")

    return {
        "customer": {
            "id": row["id"],
            "email": row["email"],
            "brand_name": row["brand_name"],
            "status": row["status"],
            "approved_at": row["approved_at"].isoformat() if row["approved_at"] else None,
        }
    }


@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: int,
    x_admin_password: Optional[str] = Header(None),
):
    """Delete a customer account."""
    check_admin(x_admin_password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM customers WHERE id = $1", customer_id)
    if result == "DELETE 0":
        raise HTTPException(404, "Customer not found")
    return {"message": "Customer deleted"}
