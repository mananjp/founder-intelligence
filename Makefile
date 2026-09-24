.PHONY: bootstrap up down migrate dev eval test lint

bootstrap:
	pnpm install
	cd apps/ai && uv sync

up:
	docker compose up -d

down:
	docker compose down

migrate:
	@for f in db/migrations/*.sql; do echo "applying $$f"; psql "$$DATABASE_URL" -v ON_ERROR_STOP=1 -f $$f; done

dev:
	pnpm dev & (cd apps/ai && uv run uvicorn fi_ai.main:app --reload --port 8000) & (cd apps/ai && uv run celery -A fi_ai.worker worker -l info) & wait

eval:
	cd apps/ai && uv run python -m fi_ai.evals.run --suite golden

test:
	pnpm test && cd apps/ai && uv run pytest

lint:
	pnpm lint && cd apps/ai && uv run ruff check .
