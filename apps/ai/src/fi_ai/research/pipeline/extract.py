"""Stage: extract -- structured evidence extraction with the hard verbatim gate.

Reads an immutable source snapshot, asks the model/provider for structured
extractions, verifies every quote against the exact snapshot used for
extraction, generates embeddings only for accepted evidence, and persists
accepted evidence atomically. Rejected evidence never reaches storage.

The orchestrator calls stages synchronously, so this entry point runs the
async extraction core (``fi_ai.evidence.extract.extract_from_snapshot``)
with ``asyncio.run``. The core is independently testable with fixture model
responses and an in-memory repository.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from uuid import UUID

from fi_ai.db import repository as build_repository
from fi_ai.evidence.extract import ExtractionResult, extract_from_snapshot
from fi_ai.llm.router import complete_structured
from fi_ai.metrics import record_quote_verbatim_rate
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    """Execute the extract stage for *ctx*.

    Resolves the snapshot from ``ctx.snapshot_text`` or the fetch stage's
    results, upserts the source, extracts and verifies evidence, emits the
    ``quote_verbatim_rate`` metric, and publishes a progress event.
    """
    asyncio.run(_run(ctx))


async def _run(ctx: RunContext) -> None:
    snapshot_text = getattr(ctx, "snapshot_text", None)
    source = getattr(ctx, "source", None)

    if snapshot_text is None:
        for result in getattr(ctx, "fetch_results", None) or []:
            text = getattr(result, "readable_text", None)
            if text:
                snapshot_text = text
                source = result
                break

    if not snapshot_text:
        ctx.publish({"type": "stage.progress", "stage": "extract", "note": "no snapshot available"})
        return

    run_id = _coerce_run_id(ctx.run_id)
    repo = getattr(ctx, "repo", None) or build_repository()

    # Preserve source/snapshot provenance: the evidence row's source_id links
    # to the sources row whose content_hash/snapshot_uri identify this exact
    # snapshot.
    source_id = await _resolve_source_id_async(repo, source)

    result: ExtractionResult = await extract_from_snapshot(
        run_id=run_id,
        source_id=source_id,
        snapshot_text=snapshot_text,
        repo=repo,
        complete_structured=getattr(ctx, "complete_structured", complete_structured),
    )

    record_quote_verbatim_rate(
        accepted=result.accepted_count,
        evaluated=result.evaluated,
        stage="extract",
    )

    ctx.publish(
        {
            "type": "stage.progress",
            "stage": "extract",
            "accepted": result.accepted_count,
            "rejected": result.rejected_count,
            "evaluated": result.evaluated,
            "quote_verbatim_rate": result.verbatim_rate,
        }
    )


def _coerce_run_id(run_id: Any) -> UUID:
    if isinstance(run_id, UUID):
        return run_id
    try:
        return UUID(str(run_id))
    except (ValueError, AttributeError, TypeError):
        return uuid.uuid4()


async def _resolve_source_id_async(repo, source: Any) -> UUID:
    source_id = getattr(source, "id", None) if source is not None else None
    if isinstance(source_id, UUID):
        return source_id
    url = getattr(source, "url", None)
    content_hash = getattr(source, "content_hash", None)
    source_type = getattr(source, "source_type", "other")
    title = getattr(source, "title", None)
    snapshot_uri = getattr(source, "snapshot_uri", None)
    if url and content_hash:
        record = await repo.upsert_source(
            url=url,
            content_hash=content_hash,
            source_type=source_type,
            title=title,
            snapshot_uri=snapshot_uri,
        )
        return record.id
    return uuid.uuid4()
