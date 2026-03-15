# Rebase Platform — Development Guidelines

## Environment Variables — NEVER Hardcode

All external service URLs, API keys, and region-specific config MUST come from environment variables (`.env` file), never hardcoded in source code.

**Before writing any code that connects to an external service, check `.env.example` for the variable name.**

Examples of what MUST be an env var:
- Database host/port/credentials
- AI model API keys and base URLs (DeepSeek, Qwen, GLM)
- Object storage endpoints (OSS)
- Dify API URL and key
- Redis connection
- Neo4j connection
- Cloud region identifier

This ensures we can switch from Alibaba Cloud Hong Kong to Guangzhou (or any other region) by changing `.env` only — zero code changes.

## Quick Reference

- **`.env.example`** — template with all variable names and comments. Copy to `.env` for local dev.
- **`.env`** — your actual secrets. NEVER commit this (it's in `.gitignore`).
- **`ROADMAP.md`** — single source of truth for what we're building and who owns what.

## Cloud Strategy

- Phase 1: Alibaba Cloud Hong Kong (no ICP needed, fast launch)
- Phase 2: Add Guangzhou for mainland compliance
- All config is region-agnostic via env vars

## AI Models

Use env vars for model selection. Default stack:
- DeepSeek V3 — primary (production analysis, classification)
- Qwen — backup (Chinese language tasks)
- GLM-4-Flash — free tier (dev/testing)
