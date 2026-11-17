.PHONY: bootstrap up down migrate seed dev eval test lint load-smoke

bootstrap:
	pnpm install
	cd apps/ai && uv sync

up:
	docker compose up -d

down:
	docker compose down

migrate:
	@for f in db/migrations/*.sql; do echo "applying $$f"; psql "$$DATABASE_URL" -v ON_ERROR_STOP=1 -f $$f; done

seed:
	pnpm db:seed

dev:
	pnpm dev & (cd apps/ai && uv run uvicorn fi_ai.main:app --reload --port 8000) & (cd apps/ai && uv run celery -A fi_ai.worker worker -l info) & wait

eval:
	cd apps/ai && uv run python -m fi_ai.evals.run --suite golden

test:
	pnpm test && cd apps/ai && uv run pytest

lint:
	pnpm lint && cd apps/ai && uv run ruff check .

# Staging load/soak smoke (Task #10). Pass BASE_URL/AUTH_TOKEN/WORKSPACE_ID/
# IDEA_ID/RUN_ID as make vars or export them first. See
# docs/runbooks/staging-load-smoke.md.
load-smoke:
	k6 run \
	  -e BASE_URL=$(BASE_URL) \
	  -e AUTH_TOKEN=$(AUTH_TOKEN) \
	  -e WORKSPACE_ID=$(WORKSPACE_ID) \
	  -e IDEA_ID=$(IDEA_ID) \
	  -e RUN_ID=$(RUN_ID) \
	  scripts/load/staging-load-smoke.js
