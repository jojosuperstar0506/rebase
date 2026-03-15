"""
Stub middleware classes for the Rebase API gateway.

All middleware follows the Starlette BaseHTTPMiddleware pattern.
Replace placeholder logic with real implementations as needed.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class AuthMiddleware(BaseHTTPMiddleware):
    """Placeholder for JWT / session-based authentication."""

    async def dispatch(self, request: Request, call_next):
        # TODO: Validate JWT or session token from Authorization header.
        # Reject unauthorized requests with 401.
        response: Response = await call_next(request)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Placeholder for per-client rate limiting."""

    async def dispatch(self, request: Request, call_next):
        # TODO: Check rate limit counters (e.g., in Redis).
        # Return 429 if limit exceeded.
        response: Response = await call_next(request)
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Placeholder for structured request / response logging."""

    async def dispatch(self, request: Request, call_next):
        # TODO: Log method, path, status code, latency, etc.
        response: Response = await call_next(request)
        return response
