# Sprint 2 — Feature Build-Out + Staging Deploy

S2-20: Structured Evidence Extraction and Verbatim Gate
=========================================================

Issue: https://github.com/mananjp/founder-intelligence/issues/59
Branch: `feat/s2-20-evidence-extraction-verbatim-gate`
Status: implemented (see PR), not yet merged

## Objective

Add an **extract stage** that converts research/source snapshot content into
structured evidence records, guarded by a **hard deterministic verbatim gate**
that rejects any quote that is not a verbatim (whitespace-normalized) substring
of the exact source snapshot. Rejected evidence never reaches persistent
storage. Gate enforcement exists at both the extraction boundary and the
persistence boundary, so a caller cannot bypass verification by invoking the
repository directly.

## Acceptance criteria (S2-20)

| Criterion | Status | Notes |
|---|---|---|
| Structured extraction | Done | `apps/ai/src/fi_ai/evidence/extract.py` — `extract_from_snapshot`, `insert_verified_evidence` |
| Evidence records | Done | Reuses existing `evidence` table (`db/migrations/002_research_pipeline.sql`) and `EvidenceRecord` |
| Snapshot-based quote verification | Done | `fi_ai.evidence.verbatim.verify_quote` / `is_verbatim_quote` |
| Whitespace normalization | Done | `fi_ai.evidence.verbatim.normalize` — collapses spaces/tabs/CRLF/newlines to single space, trims ends |
| Invalid quote rejection | Done | Paraphrase, fabricated, extra-word, empty quotes rejected; raised as `VerbatimRejectionError` |
| Embedding generation | Done | `fi_ai.evidence.embedding.embed_text` via `embedding` tier (`${LLM_EMBED_MODEL}`) |
| Embedding persistence | Done | Existing `evidence.embedding vector(1536)` column; pgvector type reused; round-trip tested |
| `quote_verbatim_rate` metric | Done | `fi_ai.metrics.quote_verbatim_rate` / `record_quote_verbatim_rate` + Prometheus gauges/counters |
| Evaluation score | Done | `fi_ai.evals.run` computes `quote_verbatim_rate` from actual gate outcomes; fail-closed on missing metric |
| 100% golden target | Done | `--min-quote-verbatim-rate` default 1.0; golden extraction suite achieves exactly 1.0 |
| Persistence-level enforcement | Done | `insert_verified_evidence` verifies before `repo.insert_evidence`; batch is atomic via `repo.transaction()` |
| Atomic batch behavior | Done | All accepted evidence written in one transaction; any failure rolls back the whole batch |

## Files added

- `apps/ai/src/fi_ai/evidence/verbatim.py` — deterministic verbatim gate (`normalize`, `is_verbatim_quote`, `verify_quote`, `VerbatimRejectionError`)
- `apps/ai/src/fi_ai/evidence/embedding.py` — embedding generation seam (`embed_text`, `set_embedding_backend`, `reset_embedding_backend`, `EmbeddingError`, `MissingEmbeddingConfigError`, `EmbeddingProviderError`)
- `apps/ai/src/fi_ai/evidence/extract.py` — extraction stage (`extract_from_snapshot`, `insert_verified_evidence`, `ExtractionResult`, `RejectedEvidence`, `ExtractionError`)
- `apps/ai/src/fi_ai/evidence/__init__.py` — public evidence API re-exports
- `apps/ai/tests/test_verbatim_gate.py` — 12 verbatim gate tests
- `apps/ai/tests/test_embedding.py` — 8 embedding tests
- `apps/ai/tests/test_extract.py` — 14 extraction tests (fixture model + in-memory repo)
- `apps/ai/tests/test_eval_metrics.py` — verbatim rate + evaluation report tests
- `apps/ai/tests/test_evidence_extraction_integration.py` — PostgreSQL integration tests (requires `TEST_DATABASE_URL`; skipped otherwise)

## Files modified

- `apps/ai/src/fi_ai/research/pipeline/extract.py` — extract stage now runs the async extraction core and emits `quote_verbatim_rate`
- `apps/ai/src/fi_ai/metrics.py` — added `QUOTE_VERBATIM_EVALUATED_TOTAL`, `QUOTE_VERBATIM_ACCEPTED_TOTAL`, `QUOTE_VERBATIM_RATE` Prometheus instruments and `quote_verbatim_rate()` / `record_quote_verbatim_rate()`
- `apps/ai/src/fi_ai/evals/run.py` — `quote_verbatim` now uses `fi_ai.evidence.verbatim.is_verbatim_quote`; missing metric fails closed; never reports missing as 100%
- `apps/ai/src/fi_ai/llm/models.yaml` — added `embed_evidence` task → `embedding` tier
- `apps/ai/tests/test_pipeline_stages.py` — extract stage no longer a stub; safe no-op when no snapshot

## Database / schema changes

None. The feature reuses the existing `evidence` table (migration `002_research_pipeline.sql`), its `embedding vector(1536)` column (pgvector via `fi_ai.db.types.Vector`), and the `ResearchRepository` persistence contract (`fi_ai/db/protocol.py`, `repositories.py`). No new tables or migrations.

## Metrics

`quote_verbatim_rate = accepted_verbatim_quotes / total_non_empty_quotes_evaluated`

- Emitted from the extract pipeline stage via `record_quote_verbatim_rate`.
- Included in the evaluation report (`build_report`) with default threshold `min_quote_verbatim_rate = 1.0`.
- Empty dataset → metric is `None`, never `1.0`; missing metric fails the evaluation closed.
- Invalid quotes count in the denominator (they are evaluated, then rejected).
- Calculated from actual verification outcomes, never model-reported values.

## Verbatim gate rules

A quote is valid iff `normalize(quote)` is a substring of `normalize(snapshot)`. Normalization collapses runs of whitespace (spaces, tabs, CRLF, newlines) into a single space and trims leading/trailing whitespace. Rejected: paraphrase, fabricated quote, quote with extra unsupported words, empty/whitespace-only quote, missing snapshot, wrong source/snapshot pairing. No fuzzy matching, embeddings, or LLM judgment.

Enforced at:
1. Extraction boundary (`extract_from_snapshot` — quotes verified before any write).
2. Persistence boundary (`insert_verified_evidence` — verifies again before delegating to `repo.insert_evidence`).

## Testing

- Unit: `uv run pytest tests/ -m "not integration"` (60 new S2-20 tests pass; full non-integration suite green)
- Integration: `TEST_DATABASE_URL=postgresql://.../fi_test uv run pytest -m integration` — real PostgreSQL 16 + pgvector, migrations applied from `db/migrations/*.sql` (never `metadata.create_all()`). Skipped locally when no Postgres is available; runs in CI.
- `uv lock --check` passes; `uv run ruff check .` passes.

## Runbooks

- `docs/runbooks/ai-metrics.md` — updated with `quote_verbatim_rate` metric catalogue entry.
- `docs/runbooks/db-persistence-tests.md` — already documents migration-based PostgreSQL integration tests; applies unchanged.

## Remaining limitations

- PostgreSQL integration tests require a live `TEST_DATABASE_URL`; they are skipped in environments without PostgreSQL (e.g. this Windows dev machine without Docker). They run in CI against `pgvector/pgvector:pg16`.
- `test_llm_router.py` tests that exercise `complete_structured` without patching `_emit_tracking` hang on Windows when PostgreSQL is unavailable (pre-existing environmental issue, present on `main` before this PR; unaffected by S2-20 changes).
- The extract stage reads `ctx.snapshot_text` / `ctx.fetch_results` set by the fetch stage; wiring the full run-context population end-to-end is tracked separately.
