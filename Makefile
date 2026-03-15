.PHONY: dev test lint format up down build

dev:
	uvicorn gateway.main:app --reload

test:
	pytest tests/

lint:
	ruff check .

format:
	ruff format .

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down

build:
	docker compose -f infra/docker-compose.yml build
