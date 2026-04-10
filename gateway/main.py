"""
Rebase API Gateway

FastAPI application that mounts all service routers.

NOTE on imports: Several service directories use hyphens in their names
(e.g., services/self-serve/). Python cannot import from hyphenated directory
names directly. Options:
  1. Use importlib.import_module("services.diagnostics.self-serve.api")
  2. Rename directories to use underscores (preferred for Python packages)
  3. Add sys.path manipulation

The imports below use underscore-based names as placeholders. Adjust paths
once the package structure is finalized.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.auth_v2 import router as auth_v2_router
from .routers.customers import router as customers_router
from .routers.dashboard_v2 import router as dashboard_v2_router
from .db import get_pool, close_pool

# ---------------------------------------------------------------------------
# Service router imports (placeholder — adjust paths to match actual layout)
# ---------------------------------------------------------------------------
# from services.diagnostics.api import router as diagnostics_router
# from services.diagnostics.self_serve.api import router as self_serve_router
# from services.workflow_engine.api import router as workflow_router
# from services.agent_executor.api import router as agent_executor_router
# from services.multi_agent.api import router as multi_agent_router
# from services.cost_engine.api import router as cost_engine_router

app = FastAPI(
    title="Rebase API",
    version="0.1.0",
    description="Unified gateway for Rebase platform services",
)


@app.on_event("startup")
async def startup():
    try:
        await get_pool()
    except Exception as e:
        import logging
        logging.warning(f"DB pool init failed (non-fatal): {e}")


@app.on_event("shutdown")
async def shutdown():
    await close_pool()

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Mount service routers
# ---------------------------------------------------------------------------
# app.include_router(diagnostics_router, prefix="/api/diagnostics", tags=["diagnostics"])
# app.include_router(self_serve_router, prefix="/api/diagnostics/self-serve", tags=["self-serve"])
# app.include_router(workflow_router, prefix="/api/workflows", tags=["workflows"])
# app.include_router(agent_executor_router, prefix="/api/tasks", tags=["tasks"])
# app.include_router(multi_agent_router, prefix="/api/agents", tags=["agents"])
# app.include_router(cost_engine_router, prefix="/api/costs", tags=["costs"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["infra"])
async def health_check():
    return {"status": "ok"}


# v2 routes — self-serve SaaS layer
app.include_router(auth_v2_router)
app.include_router(customers_router)
app.include_router(dashboard_v2_router)
