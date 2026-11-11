"""Crosscheck extracted evidence into idempotent, status-derived claims."""

from __future__ import annotations

import math
from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import UUID, uuid5

import psycopg
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field

from fi_ai.config import settings
from fi_ai.evidence.status import EvidenceRef, derive_claim_status
from fi_ai.llm.router import complete_structured, model_for
from fi_ai.prompts.registry import load_prompt
from fi_ai.research.orchestrator import RunContext

_NAMESPACE = UUID("4f3c1a2e-5b7d-4c9f-8a1e-6d2f0b9c7a31")
_SIMILARITY_THRESHOLD = 0.86
_RELEVANCE_MIN = 0.5
_TTL_DAYS = 365


class NliResult(BaseModel):
    """NLI judgment for two evidence statements."""

    model_config = ConfigDict(extra="forbid")

    relation: Literal["same", "contradicts", "unrelated"]
    confidence: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=500)


class NliBatch(BaseModel):
    """Structured NLI result wrapper."""

    model_config = ConfigDict(extra="forbid")

    judgments: list[NliResult]


def _database_dsn() -> str:
    url = settings.database_url
    for prefix in ("postgresql+psycopg://", "postgresql+psycopg2://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql://" + url.removeprefix(prefix)
    return url


def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Create vectors with the configured embedding-tier model."""
    if not texts:
        return []
    import litellm

    response = litellm.embedding(model=model_for("embed_evidence"), input=texts)
    vectors = [list(item["embedding"]) for item in response.data]
    if len(vectors) != len(texts) or any(len(vector) != 1536 for vector in vectors):
        raise ValueError("Embedding provider returned an unexpected count or dimension")
    return vectors


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def _normalise_publisher(value: str | None, fallback: str) -> str:
    """Normalize publisher identity so syndicated copies count once."""
    normalized = " ".join((value or "").casefold().split())
    return normalized or fallback


def _module_for(text: str) -> str:
    """Map a claim to the closest supported research module."""
    value = text.casefold()
    rules = {
        "pricing": ("price", "pricing", "cost", "subscription", "arr", "revenue", "gross margin"),
        "customer": ("customer", "user", "buyer", "churn", "pain", "adoption", "enterprise"),
        "competitive": ("competitor", "market share", "leader", "alternative", "rival"),
        "demand": ("demand", "search interest", "growth", "trend", "demand for"),
        "gtm": ("sales", "distribution", "channel", "go-to-market", "acquisition"),
    }
    for module, terms in rules.items():
        if any(term in value for term in terms):
            return module
    return "market"


def _claim_id(run_id: UUID, module: str, statement: str) -> UUID:
    identity = f"{run_id}:{module}:{' '.join(statement.casefold().split())}"
    return uuid5(_NAMESPACE, identity)


def _load_evidence(cursor: Any, run_uuid: UUID) -> list[dict[str, Any]]:
    cursor.execute(
        """
        SELECT e.id, e.claim_text, e.quote, e.stance, e.relevance, e.kind,
               e.embedding, e.observed_at, s.publisher, s.source_type,
               s.published_at, s.url
        FROM evidence e
        JOIN sources s ON s.id = e.source_id
        WHERE e.run_id = %s
        ORDER BY e.created_at, e.id
        """,
        (run_uuid,),
    )
    return list(cursor.fetchall())


def _ensure_embeddings(cursor: Any, rows: list[dict[str, Any]]) -> None:
    missing = [row for row in rows if row["embedding"] is None]
    if not missing:
        return
    vectors = _embed_texts([row["claim_text"] for row in missing])
    for row, vector in zip(missing, vectors, strict=True):
        cursor.execute(
            "UPDATE evidence SET embedding = %s::vector WHERE id = %s",
            ("[" + ",".join(str(value) for value in vector) + "]", row["id"]),
        )
        row["embedding"] = vector


def _vector(value: Any) -> list[float]:
    if isinstance(value, list):
        return [float(item) for item in value]
    if isinstance(value, str):
        return [float(item) for item in value.strip("[]").split(",") if item]
    return [float(item) for item in value]


def _cluster_rows(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Greedy deterministic clustering using cosine similarity."""
    clusters: list[list[dict[str, Any]]] = []
    for row in rows:
        vector = _vector(row["embedding"])
        matching = next(
            (
                cluster
                for cluster in clusters
                if _cosine(vector, _vector(cluster[0]["embedding"])) >= _SIMILARITY_THRESHOLD
            ),
            None,
        )
        if matching is None:
            clusters.append([row])
        else:
            matching.append(row)
    return clusters


def _refine_clusters(
    run_id: str,
    clusters: list[list[dict[str, Any]]],
) -> list[list[dict[str, Any]]]:
    """Split embedding-near claims when NLI says they are not paraphrases.

    Embeddings are a candidate generator, not proof that two propositions are
    equivalent. Contradictory propositions must remain separate claim rows so
    they can be linked in ``claim_contradictions``.
    """
    refined: list[list[dict[str, Any]]] = []
    for cluster in clusters:
        for row in cluster:
            statement = str(row["claim_text"])
            matching = None
            for candidate in refined:
                if candidate[0] not in cluster:
                    continue
                judgment = _nli_judgment(
                    run_id, str(candidate[0]["claim_text"]), statement
                )
                if judgment.relation == "same" and judgment.confidence >= 0.7:
                    matching = candidate
                    break
            if matching is None:
                refined.append([row])
            else:
                matching.append(row)
    return refined


def _nli_judgment(run_id: str, left: str, right: str) -> NliResult:
    prompt = load_prompt("crosscheck_nli", 1)
    user_content = prompt.user_template.replace("{statement_a}", left).replace(
        "{statement_b}", right
    )
    messages = [
        {"role": "system", "content": prompt.system},
        {"role": "user", "content": user_content},
    ]
    result = complete_structured(
        task="crosscheck_nli", messages=messages, schema=NliResult, run_id=run_id
    )
    return result


def _age_days(published_at: date | None, observed_at: date | None) -> int | None:
    source_date = published_at or observed_at
    return (datetime.now(tz=UTC).date() - source_date).days if source_date else None


def _persist_claims(
    cursor: Any,
    run_uuid: UUID,
    idea_id: UUID,
    clusters: list[list[dict[str, Any]]],
) -> tuple[int, int, int]:
    claims_by_cluster: list[tuple[UUID, str, list[dict[str, Any]]]] = []
    evidence_links = 0
    for cluster in clusters:
        representative = max(cluster, key=lambda item: float(item["relevance"]))
        statement = str(representative["claim_text"]).strip()
        module = _module_for(statement)
        claim_id = _claim_id(run_uuid, module, statement)
        refs: list[EvidenceRef] = []
        for row in cluster:
            # NLI checks whether the source quote actually supports the extracted
            # proposition. Unrelated quotes remain linked for traceability but do
            # not contribute to the deterministic status calculation.
            stance_judgment = _nli_judgment(
                str(run_uuid), statement, str(row["quote"])
            )
            stance = {
                "same": "supports",
                "contradicts": "contradicts",
                "unrelated": "unrelated",
            }[stance_judgment.relation]
            refs.append(
                EvidenceRef(
                    evidence_id=str(row["id"]),
                    publisher=_normalise_publisher(row["publisher"], str(row["id"])),
                    source_type=str(row["source_type"]),
                    stance=stance,
                    relevance=float(row["relevance"]),
                    age_days=_age_days(row["published_at"], row["observed_at"]),
                )
            )
        kind = "signal" if any(row["kind"] == "signal" for row in cluster) else "fact"
        status = derive_claim_status("evidence", refs, kind=kind, ttl_days=_TTL_DAYS)
        cursor.execute(
            """
            INSERT INTO claims (id, idea_id, run_id, statement, module, origin, kind, status, status_computed_at)
            VALUES (%s, %s, %s, %s, %s, 'evidence', %s, %s, now())
            ON CONFLICT (id) DO UPDATE SET statement = EXCLUDED.statement,
              module = EXCLUDED.module, kind = EXCLUDED.kind, status = EXCLUDED.status,
              status_computed_at = now()
            """,
            (claim_id, idea_id, run_uuid, statement, module, kind, status.value),
        )
        for row in cluster:
            cursor.execute(
                "INSERT INTO claim_evidence (claim_id, evidence_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (claim_id, row["id"]),
            )
            evidence_links += cursor.rowcount
        claims_by_cluster.append((claim_id, statement, cluster))

    contradiction_count = 0
    for index, (left_id, left_statement, left_rows) in enumerate(claims_by_cluster):
        left_vector = _vector(left_rows[0]["embedding"])
        for right_id, right_statement, right_rows in claims_by_cluster[index + 1 :]:
            right_vector = _vector(right_rows[0]["embedding"])
            if _cosine(left_vector, right_vector) < 0.70:
                continue
            judgment = _nli_judgment(str(run_uuid), left_statement, right_statement)
            if judgment.relation == "contradicts" and judgment.confidence >= 0.7:
                cursor.execute(
                    """
                    INSERT INTO claim_contradictions (claim_id, contradicts_claim_id, note)
                    VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
                    """,
                    (left_id, right_id, judgment.explanation),
                )
                contradiction_count += cursor.rowcount
    return len(claims_by_cluster), evidence_links, contradiction_count


def run(ctx: RunContext) -> None:
    """Cluster evidence, derive claim statuses, and persist idempotently.

    Fetch results are attached by the fetch stage. When that stage had no input
    URLs, it intentionally does not create ``ctx.fetch_results``; in that case
    extraction had nothing to persist and this stage can safely finish without
    opening a database connection. When fetch results exist, persisted evidence
    is always reloaded from PostgreSQL (including on retries).
    """
    fetch_results = getattr(ctx, "fetch_results", None)
    if not fetch_results:
        ctx.publish(
            {
                "type": "stage.progress",
                "stage": "crosscheck",
                "note": "no_evidence",
                "claims": 0,
            }
        )
        return

    try:
        run_uuid = UUID(ctx.run_id)
    except ValueError as exc:
        raise ValueError(f"Invalid research run ID: {ctx.run_id}") from exc

    with psycopg.connect(_database_dsn(), row_factory=dict_row) as conn, conn.cursor() as cursor:
        cursor.execute("SELECT idea_id FROM research_runs WHERE id = %s", (run_uuid,))
        run_row = cursor.fetchone()
        if run_row is None:
            raise ValueError(f"Research run not found: {ctx.run_id}")
        rows = _load_evidence(cursor, run_uuid)
        if not rows:
            ctx.publish(
                {
                    "type": "stage.progress",
                    "stage": "crosscheck",
                    "note": "no_evidence",
                    "claims": 0,
                }
            )
            return
        _ensure_embeddings(cursor, rows)
        clusters = _refine_clusters(str(run_uuid), _cluster_rows(rows))
        claim_count, link_count, contradiction_count = _persist_claims(
            cursor, run_uuid, run_row["idea_id"], clusters
        )

    ctx.publish(
        {
            "type": "stage.progress",
            "stage": "crosscheck",
            "note": "crosscheck_completed",
            "evidence": len(rows),
            "clusters": len(clusters),
            "claims": claim_count,
            "claim_evidence_links": link_count,
            "contradictions": contradiction_count,
        }
    )
