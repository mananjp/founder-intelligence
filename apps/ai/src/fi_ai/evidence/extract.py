"""Structured evidence extraction with the hard verbatim gate.

Converts an immutable source snapshot into verified evidence records:

1. Ask the model/provider (``fi_ai.llm.router.complete_structured``) for
   structured extractions and validate the output with Pydantic.
2. Verify every supporting quote against the *exact* snapshot used for
   extraction with ``fi_ai.evidence.verbatim.verify_quote``.
3. Generate embeddings only for evidence that passes the gate, using
   ``fi_ai.evidence.embedding.embed_text``.
4. Persist accepted evidence atomically in a single repository transaction.

Rejected evidence never reaches persistent storage. The extractor and the
persistence boundary both enforce the gate: evidence is persisted only
through ``insert_verified_evidence`` / ``extract_from_snapshot``, which
verify before delegating to the repository.

The core function ``extract_from_snapshot`` is independently testable: pass
fixture model responses and an in-memory repository.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from fi_ai.db.protocol import ResearchRepository
from fi_ai.db.records import EvidenceRecord
from fi_ai.evidence.embedding import EmbeddingError
from fi_ai.evidence.schemas import ExtractedEvidence
from fi_ai.evidence.verbatim import VerbatimRejectionError, verify_quote
from fi_ai.llm.router import LlmRouterError

__all__ = [
    "EmbeddingError",
    "ExtractionError",
    "ExtractionResult",
    "RejectedEvidence",
    "extract_from_snapshot",
    "insert_verified_evidence",
]


class ExtractionError(Exception):
    """Raised when the extraction stage cannot complete (gate, model, or
    embedding failures are surfaced explicitly, never swallowed)."""


@dataclass(frozen=True, slots=True)
class RejectedEvidence:
    """One extraction item that was rejected before persistence."""

    claim_text: str
    quote: str
    reason: str


@dataclass(frozen=True, slots=True)
class ExtractionResult:
    """Outcome of extracting evidence from one snapshot."""

    accepted: tuple[EvidenceRecord, ...]
    rejected: tuple[RejectedEvidence, ...]
    evaluated: int
    """Non-empty quotes evaluated by the verbatim gate (the metric
    denominator). Invalid quotes are counted here, never dropped."""

    @property
    def accepted_count(self) -> int:
        return len(self.accepted)

    @property
    def rejected_count(self) -> int:
        return len(self.rejected)

    @property
    def verbatim_rate(self) -> float | None:
        """``accepted / evaluated``, or ``None`` when nothing was evaluated.

        An empty dataset is explicitly *not* 1.0.
        """
        if self.evaluated == 0:
            return None
        return self.accepted_count / self.evaluated


def _extraction_messages(snapshot_text: str) -> list[dict[str, str]]:
    """Build the messages sent to the model for one snapshot.

    The snapshot is passed verbatim so the model can only quote from it; the
    system prompt makes the verbatim requirement explicit.
    """
    return [
        {
            "role": "system",
            "content": (
                "You extract verifiable research evidence from a source "
                "snapshot. Return a JSON object with an ``evidence`` array. "
                "Each item must have ``claim_text`` and ``quote``; every "
                "``quote`` must be copied word-for-word from the snapshot "
                "(verbatim). Do not paraphrase, do not invent wording, and do "
                "not add unsupported details to quotes. Omit claims that are "
                "not supported by the snapshot."
            ),
        },
        {
            "role": "user",
            "content": (
                "SOURCE SNAPSHOT (verbatim quotes must come from here only):\n"
                f"{snapshot_text}\n\n"
                "Return ONLY the JSON object."
            ),
        },
    ]


async def insert_verified_evidence(
    repo: ResearchRepository,
    *,
    run_id: UUID,
    source_id: UUID,
    snapshot_text: str,
    claim_text: str,
    quote: str,
    value: Any = None,
    unit: str | None = None,
    entity: str | None = None,
    observed_at: Any = None,
    stance: str | None = None,
    relevance: Any = None,
    kind: str | None = None,
    embedding: list[float] | None = None,
) -> EvidenceRecord:
    """Persistence-boundary gate: verify the quote, then persist.

    Verifies *quote* against *snapshot_text* before calling
    ``repo.insert_evidence``. Invalid evidence is rejected here and never
    reaches storage, so invoking this persistence path directly cannot bypass
    the gate.
    """
    verify_quote(snapshot_text, quote)  # raises VerbatimRejectionError on invalid
    return await repo.insert_evidence(
        run_id=run_id,
        source_id=source_id,
        claim_text=claim_text,
        quote=quote,
        value=value,
        unit=unit,
        entity=entity,
        observed_at=observed_at,
        stance=stance,
        relevance=relevance,
        kind=kind,
        embedding=embedding,
    )


async def extract_from_snapshot(
    *,
    run_id: UUID,
    source_id: UUID,
    snapshot_text: str,
    repo: ResearchRepository,
    complete_structured: Callable[..., Any] | None = None,
    embed_fn: Callable[[str], list[float]] | None = None,
) -> ExtractionResult:
    """Extract, verify, embed, and persist evidence for one immutable snapshot.

    Parameters
    ----------
    run_id:
        The research run the evidence belongs to.
    source_id:
        The source the snapshot was fetched from; evidence, snapshot and
        source all refer to the same source snapshot.
    snapshot_text:
        The immutable source snapshot text. Quotes are verified against this
        exact text after whitespace normalization.
    repo:
        Persistence repository. Evidence is written through
        ``insert_verified_evidence`` inside one atomic transaction.
    complete_structured:
        Model call seam; defaults to ``fi_ai.llm.router.complete_structured``.
        Tests inject a fixture-backed callable.
    embed_fn:
        Embedding seam; defaults to ``fi_ai.evidence.embedding.embed_text``.
        Embeddings are generated only for gate-accepted evidence.

    Returns
    -------
    ExtractionResult
        Accepted records (already persisted), rejected items, and the counts
        used by the ``quote_verbatim_rate`` metric.

    Raises
    ------
    ExtractionError
        If the model output is invalid, embedding configuration is missing,
        the embedding provider fails, or persistence fails. Nothing is
        persisted when extraction fails after acceptance begins.
    """
    if complete_structured is None:
        from fi_ai.llm.router import complete_structured as _default

        complete_structured = _default
    if embed_fn is None:
        from fi_ai.evidence.embedding import embed_text as _default_embed

        embed_fn = _default_embed

    # 1. Structured extraction via the model/provider abstraction, validated
    #    with Pydantic before anything else happens.
    try:
        output = complete_structured(
            task="extract_evidence",
            messages=_extraction_messages(snapshot_text),
            schema=_ExtractionOutput,
            run_id=str(run_id),
        )
    except LlmRouterError as exc:
        raise ExtractionError(f"evidence extraction failed: {exc}") from exc
    items: list[ExtractedEvidence] = list(output.evidence)

    # 2. Verbatim gate: verify every quote against the exact snapshot.
    #    Rejected items are counted in ``evaluated`` but never persisted.
    accepted_items: list[ExtractedEvidence] = []
    rejected: list[RejectedEvidence] = []
    evaluated = 0
    for item in items:
        quote = item.quote
        if not quote or not quote.strip():
            evaluated += 1
            rejected.append(
                RejectedEvidence(
                    claim_text=item.claim_text,
                    quote=quote,
                    reason="empty or whitespace-only quote",
                )
            )
            continue
        evaluated += 1
        try:
            verify_quote(snapshot_text, quote)
        except VerbatimRejectionError as exc:
            rejected.append(
                RejectedEvidence(
                    claim_text=item.claim_text,
                    quote=quote,
                    reason=str(exc),
                )
            )
            continue
        accepted_items.append(item)

    # 3. Embeddings only for accepted evidence. Generate all vectors before
    #    any write so a provider failure leaves nothing persisted.
    vectors: dict[int, list[float]] = {}
    for index, item in enumerate(accepted_items):
        try:
            vectors[index] = embed_fn(item.claim_text)
        except EmbeddingError as exc:
            raise ExtractionError(
                f"embedding generation failed for accepted evidence "
                f"(claim={item.claim_text!r}): {exc}"
            ) from exc

    # 4. Atomic batch persistence: all accepted evidence in one transaction;
    #    any failure rolls the whole batch back.
    accepted_records: list[EvidenceRecord] = []
    try:
        async with repo.transaction() as tx:
            for index, item in enumerate(accepted_items):
                record = await insert_verified_evidence(
                    tx,
                    run_id=run_id,
                    source_id=source_id,
                    snapshot_text=snapshot_text,
                    claim_text=item.claim_text,
                    quote=item.quote,
                    value=item.value,
                    unit=item.unit,
                    entity=item.entity,
                    observed_at=item.observed_at,
                    stance=item.stance,
                    relevance=item.relevance,
                    kind=item.kind,
                    embedding=vectors[index],
                )
                accepted_records.append(record)
    except VerbatimRejectionError as exc:  # defensive: gate is re-checked at persistence
        raise ExtractionError(f"persistence rejected accepted evidence: {exc}") from exc

    return ExtractionResult(
        accepted=tuple(accepted_records),
        rejected=tuple(rejected),
        evaluated=evaluated,
    )


# Pydantic wrapper so the model returns a list of evidence items in one call.
class _ExtractionOutput(BaseModel):
    evidence: list[ExtractedEvidence]
