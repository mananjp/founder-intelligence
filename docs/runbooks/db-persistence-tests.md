# Database persistence integration tests

The SQLAlchemy Core tables and repositories added for Sprint 2 (`fi_ai/db`) are verified
against a **real PostgreSQL 16 + pgvector** database. SQLite and mocked connections are
not accepted substitutes.

## Prerequisites

- PostgreSQL 16 with the `vector` extension (the repo's `pgvector/pgvector:pg16` image).
- A disposable database whose name contains `test`, for example `fi_test`.

The test fixture refuses to reset any database whose name does not contain `test`.

## Local run

```bash
docker compose up -d postgres
docker compose exec postgres createdb -U fi fi_test

export TEST_DATABASE_URL=postgresql://fi:fi@localhost:5432/fi_test
cd apps/ai
uv run pytest -m integration
uv run pytest                     # unit + integration + coverage gate
```

If Docker is unavailable, any disposable PostgreSQL 16 service with pgvector works. The
fixture applies `db/migrations/*.sql` to the target database before the session, then
truncates rows before each test.

> `pgserver` (pip) can provide an embedded PG16 + pgvector instance for developer
> machines without Docker. It does not bundle the optional `pgcrypto` contrib files;
> PostgreSQL 16 ships `gen_random_uuid()` in core, which is what migration `001` needs,
> so the fixture tolerates only that missing extension.

## What is covered

- Metadata ↔ migrated database equivalence: columns, types, nullability, defaults, PKs,
  unique constraints, foreign keys, and indexes.
- Idempotent `sources` upsert on the `(url, content_hash)` unique constraint, including
  immutable/mutable field semantics and concurrent writers.
- Evidence, claims, claim links, insights, recommendations, assumptions, scores, and
  `llm_calls` inserts; missing-record and foreign-key failure behavior.
- Transaction commit/rollback and connection cleanup.

## CI

The `python` job in `.github/workflows/ci.yml` starts the `pgvector/pgvector:pg16` service
and exports `TEST_DATABASE_URL`. A run without that variable skips the integration tests
and will not satisfy the 85% coverage gate, because the repository code requires a real
database.
