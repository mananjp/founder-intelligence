"""Stage: extract
LLM structured extraction into ExtractedEvidence. HARD GATE: quote must be a verbatim substring of the snapshot, else discard.
Owner: AI / Research Engine squad.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog
from pydantic import ValidationError

from fi_ai.db.protocol import ResearchRepository
from fi_ai.db.records import EvidenceRecord
from fi_ai.evidence.embedding import embed_quote
from fi_ai.evidence.schemas import ExtractedEvidence
from fi_ai.evidence.verbatim import check_verbatim
from fi_ai.research.orchestrator import RunContext

log = structlog.get_logger()


@dataclass(frozen=True)
class ExtractionCandidate:
    """One model-generated structured extraction paired with the snapshot it came from."""

    evidence: ExtractedEvidence
    source_id: UUID | None
    snapshot: str


def parse_extracted_evidence(raw: Any) -> ExtractedEvidence | None:
    """Safely coerce raw model output into ``ExtractedEvidence``.

    Accepts an ``ExtractedEvidence`` instance, a mapping of fields, or a JSON string
    containing such a mapping. Malformed output (non-object payloads, invalid JSON,
    missing or invalid fields) returns ``None`` instead of raising, so a single bad
    model response can never crash the stage; callers must treat ``None`` as a
    rejected candidate. The original quote text is preserved verbatim by Pydantic —
    no normalization or correction is applied here.
    """
    if isinstance(raw, ExtractedEvidence):
        return raw

    payload: Any = raw
    if isinstance(raw, str):
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None

    if not isinstance(payload, Mapping):
        return None

    try:
        return ExtractedEvidence.model_validate(dict(payload))
    except ValidationError:
        return None


def extract_valid_evidence(
    candidates: Sequence[ExtractionCandidate],
) -> tuple[list[ExtractionCandidate], list[ExtractionCandidate]]:
    """Run the verbatim hard gate over model-generated candidates.

    A candidate is valid only when its quote is a verbatim substring of the source
    snapshot after whitespace normalization and it carries a source reference to verify
    against. Invalid candidates are discarded and returned as ``rejected`` so callers can
    observe (and never persist, embed or score them); they are never part of ``valid``.

    Every rejection is logged with its reasons so validation failures are observable
    rather than silent.
    """
    valid: list[ExtractionCandidate] = []
    rejected: list[ExtractionCandidate] = []

    for candidate in candidates:
        check = check_verbatim(candidate.evidence.quote, candidate.snapshot)
        reasons = list(check.reasons)
        if candidate.source_id is None:
            reasons.append("missing source reference")
        if reasons:
            log.warning(
                "extract.quote_rejected",
                quote_verbatim=check.passed,
                reasons=reasons,
            )
            rejected.append(candidate)
            continue
        valid.append(candidate)

    return valid, rejected


async def persist_valid_evidence(
    repo: ResearchRepository,
    *,
    run_id: UUID,
    candidates: Sequence[ExtractionCandidate],
) -> tuple[list[EvidenceRecord], list[ExtractionCandidate]]:
    """Persist validated evidence, embedding each accepted quote.

    The verbatim gate runs first; only valid candidates are embedded and written through
    ``repo.insert_evidence``. Invalid candidates are discarded before any embedding is
    generated or any insert is attempted, so rejected quotes never acquire embeddings.
    """
    valid, rejected = extract_valid_evidence(candidates)

    persisted: list[EvidenceRecord] = []
    for candidate in valid:
        source_id = candidate.source_id
        if source_id is None:
            continue
        record = await repo.insert_evidence(
            run_id=run_id,
            source_id=source_id,
            claim_text=candidate.evidence.claim_text,
            quote=candidate.evidence.quote,
            embedding=embed_quote(candidate.evidence.quote),
        )
        persisted.append(record)

    return persisted, rejected


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "extract", "note": "stub"})
