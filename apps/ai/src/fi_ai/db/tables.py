"""SQLAlchemy Core metadata mirroring the SQL migrations.

The schema source of truth is ``db/migrations/*.sql`` (ADR-0003). These tables exist so
the Python service can compose Core statements; they are never used to create or migrate
the production schema.

Covered migrations:
- ``001_core.sql``: only the tables referenced by later foreign keys (users, workspaces,
  ideas, research_briefs).
- ``002_research_pipeline.sql``: research_runs, sources, evidence, claims,
  claim_evidence, claim_contradictions, insights.
- ``003_decision_layer.sql``: opportunity_scores, assumptions, experiments,
  recommendations, decisions.
- ``005_llm_observability.sql``: llm_calls.
- ``006_indexes.sql``: indexes added for the 003 FK/query columns.

``007`` is not present on this branch, so its tables/columns are intentionally absent.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from fi_ai.db.types import Vector

metadata = sa.MetaData()


def _uuid_pk(name: str = "id") -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _uuid(name: str, *, nullable: bool = False) -> sa.Column:
    return sa.Column(name, postgresql.UUID(as_uuid=True), nullable=nullable)


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


# --- 001_core.sql: FK targets -------------------------------------------------

users = sa.Table(
    "users",
    metadata,
    _uuid_pk(),
    sa.Column("email", sa.Text, nullable=False),
    sa.Column("display_name", sa.Text),
    _created_at(),
    sa.UniqueConstraint("email", name="users_email_key"),
)

workspaces = sa.Table(
    "workspaces",
    metadata,
    _uuid_pk(),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("plan", sa.Text, nullable=False, server_default=sa.text("'free'")),
    _created_at(),
)

ideas = sa.Table(
    "ideas",
    metadata,
    _uuid_pk(),
    sa.Column(
        "workspace_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("raw_description", sa.Text, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column(
        "geography",
        postgresql.ARRAY(sa.Text),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    sa.Column("stage", sa.Text, nullable=False, server_default=sa.text("'exploring'")),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'active'")),
    _created_at(),
    sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    ),
)
sa.Index("ideas_workspace_id_idx", ideas.c.workspace_id)

research_briefs = sa.Table(
    "research_briefs",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")),
    sa.Column("problem", sa.Text),
    sa.Column("customer", sa.Text),
    sa.Column("geography", postgresql.ARRAY(sa.Text)),
    sa.Column("category", sa.Text),
    sa.Column("alternatives", sa.Text),
    sa.Column("business_model", sa.Text),
    sa.Column("differentiation", sa.Text),
    sa.Column(
        "known_evidence",
        postgresql.JSONB,
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    ),
    sa.Column("unknowns", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    sa.Column(
        "research_questions",
        postgresql.JSONB,
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    ),
    _created_at(),
    sa.UniqueConstraint("idea_id", "version", name="research_briefs_idea_id_version_key"),
)


# --- 002_research_pipeline.sql ------------------------------------------------

research_runs = sa.Table(
    "research_runs",
    metadata,
    _uuid_pk(),
    sa.Column(
        "workspace_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "brief_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_briefs.id"),
        nullable=False,
    ),
    sa.Column("depth", sa.Text, nullable=False, server_default=sa.text("'quick'")),
    sa.Column("geography", postgresql.ARRAY(sa.Text), nullable=False),
    sa.Column("state", sa.Text, nullable=False, server_default=sa.text("'created'")),
    sa.Column("budget_usd", sa.Numeric(8, 2)),
    sa.Column("spent_usd", sa.Numeric(8, 2), nullable=False, server_default=sa.text("0")),
    sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    _created_at(),
    sa.Column("completed_at", sa.DateTime(timezone=True)),
)
sa.Index(
    "research_runs_idea_id_created_at_idx",
    research_runs.c.idea_id,
    research_runs.c.created_at.desc(),
)

sources = sa.Table(
    "sources",
    metadata,
    _uuid_pk(),
    sa.Column("url", sa.Text, nullable=False),
    sa.Column("content_hash", sa.Text, nullable=False),
    sa.Column("title", sa.Text),
    sa.Column("publisher", sa.Text),
    sa.Column("published_at", sa.Date),
    sa.Column("source_type", sa.Text, nullable=False),
    sa.Column(
        "accessed_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    ),
    sa.Column("snapshot_uri", sa.Text),
    sa.UniqueConstraint("url", "content_hash", name="sources_url_content_hash_key"),
)

evidence = sa.Table(
    "evidence",
    metadata,
    _uuid_pk(),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "source_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("sources.id"),
        nullable=False,
    ),
    sa.Column("claim_text", sa.Text, nullable=False),
    sa.Column("quote", sa.Text, nullable=False),
    sa.Column("value", sa.Numeric),
    sa.Column("unit", sa.Text),
    sa.Column("entity", sa.Text),
    sa.Column("observed_at", sa.Date),
    sa.Column("stance", sa.Text, nullable=False, server_default=sa.text("'supports'")),
    sa.Column("relevance", sa.Numeric(3, 2), nullable=False, server_default=sa.text("0.7")),
    sa.Column("kind", sa.Text, nullable=False, server_default=sa.text("'fact'")),
    sa.Column("embedding", Vector(1536)),
    _created_at(),
)
sa.Index("evidence_run_id_idx", evidence.c.run_id)
sa.Index(
    "evidence_embedding_idx",
    evidence.c.embedding,
    postgresql_using="ivfflat",
    postgresql_ops={"embedding": "vector_cosine_ops"},
)

claims = sa.Table(
    "claims",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id"),
    ),
    sa.Column("statement", sa.Text, nullable=False),
    sa.Column("module", sa.Text, nullable=False),
    sa.Column("origin", sa.Text, nullable=False, server_default=sa.text("'evidence'")),
    sa.Column("kind", sa.Text, nullable=False, server_default=sa.text("'fact'")),
    sa.Column("status", sa.Text, nullable=False),
    sa.Column(
        "status_computed_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    ),
    _created_at(),
)
sa.Index("claims_idea_id_module_idx", claims.c.idea_id, claims.c.module)

claim_evidence = sa.Table(
    "claim_evidence",
    metadata,
    sa.Column(
        "claim_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("claims.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "evidence_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("evidence.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

claim_contradictions = sa.Table(
    "claim_contradictions",
    metadata,
    sa.Column(
        "claim_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("claims.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "contradicts_claim_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("claims.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column("note", sa.Text),
)

insights = sa.Table(
    "insights",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id"),
    ),
    sa.Column("module", sa.Text, nullable=False),
    sa.Column("summary", sa.Text, nullable=False),
    sa.Column(
        "cited_claim_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    _created_at(),
)


# --- 003_decision_layer.sql (+ 006 indexes) -----------------------------------

opportunity_scores = sa.Table(
    "opportunity_scores",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id"),
    ),
    sa.Column("dimension_scores", postgresql.JSONB, nullable=False),
    sa.Column("overall_score", sa.Numeric(3, 1), nullable=False),
    sa.Column("evidence_coverage", sa.Numeric(4, 3), nullable=False),
    sa.Column("scoring_model_version", sa.Text, nullable=False),
    _created_at(),
)
sa.Index(
    "opportunity_scores_idea_id_created_at_idx",
    opportunity_scores.c.idea_id,
    opportunity_scores.c.created_at.desc(),
)
sa.Index("opportunity_scores_run_id_idx", opportunity_scores.c.run_id)

assumptions = sa.Table(
    "assumptions",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("type", sa.Text, nullable=False),
    sa.Column("statement", sa.Text, nullable=False),
    sa.Column("importance", sa.Text, nullable=False, server_default=sa.text("'medium'")),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'unverified'")),
    sa.Column(
        "linked_claim_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    _created_at(),
    sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    ),
)
sa.Index("assumptions_idea_id_status_idx", assumptions.c.idea_id, assumptions.c.status)

experiments = sa.Table(
    "experiments",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "assumption_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("assumptions.id"),
    ),
    sa.Column("method", sa.Text, nullable=False),
    sa.Column("hypothesis", sa.Text, nullable=False),
    sa.Column("expected_learning", sa.Numeric(3, 2)),
    sa.Column("decision_impact", sa.Numeric(3, 2)),
    sa.Column("cost_time", sa.Numeric(6, 2)),
    sa.Column("priority_score", sa.Numeric(6, 3)),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'proposed'")),
    sa.Column("result", sa.Text),
    _created_at(),
)
sa.Index("experiments_idea_id_status_idx", experiments.c.idea_id, experiments.c.status)
sa.Index("experiments_assumption_id_idx", experiments.c.assumption_id)

recommendations = sa.Table(
    "recommendations",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id"),
    ),
    sa.Column("action", sa.Text, nullable=False),
    sa.Column("rationale", sa.Text, nullable=False),
    sa.Column(
        "cited_claim_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    sa.Column(
        "linked_assumption_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    sa.Column("confidence", sa.Numeric(3, 2)),
    _created_at(),
)
sa.Index(
    "recommendations_idea_id_created_at_idx",
    recommendations.c.idea_id,
    recommendations.c.created_at.desc(),
)
sa.Index("recommendations_run_id_idx", recommendations.c.run_id)

decisions = sa.Table(
    "decisions",
    metadata,
    _uuid_pk(),
    sa.Column(
        "idea_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("ideas.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column(
        "recommendation_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("recommendations.id"),
    ),
    sa.Column("choice", sa.Text, nullable=False),
    sa.Column("rationale", sa.Text),
    sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    sa.Column(
        "linked_assumption_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    sa.Column(
        "cited_claim_ids",
        postgresql.ARRAY(sa.Uuid),
        nullable=False,
        server_default=sa.text("'{}'"),
    ),
    _created_at(),
)
sa.Index(
    "decisions_idea_id_created_at_idx",
    decisions.c.idea_id,
    decisions.c.created_at.desc(),
)
sa.Index("decisions_recommendation_id_idx", decisions.c.recommendation_id)
sa.Index("decisions_decided_by_idx", decisions.c.decided_by)


# --- 005_llm_observability.sql ------------------------------------------------

llm_calls = sa.Table(
    "llm_calls",
    metadata,
    sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
    sa.Column(
        "run_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("research_runs.id", ondelete="SET NULL"),
    ),
    sa.Column("task", sa.Text, nullable=False),
    sa.Column("model", sa.Text, nullable=False),
    sa.Column("input_tokens", sa.Integer),
    sa.Column("output_tokens", sa.Integer),
    sa.Column("cost_usd", sa.Numeric(10, 4)),
    sa.Column("latency_ms", sa.Integer),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'ok'")),
    _created_at(),
)
sa.Index("llm_calls_run_id_idx", llm_calls.c.run_id)


TABLES_002 = (
    research_runs,
    sources,
    evidence,
    claims,
    claim_evidence,
    claim_contradictions,
    insights,
)
TABLES_003 = (
    opportunity_scores,
    assumptions,
    experiments,
    recommendations,
    decisions,
)
TABLES_005 = (llm_calls,)

__all__ = [
    "TABLES_002",
    "TABLES_003",
    "TABLES_005",
    "assumptions",
    "claim_contradictions",
    "claim_evidence",
    "claims",
    "decisions",
    "evidence",
    "experiments",
    "ideas",
    "insights",
    "llm_calls",
    "metadata",
    "opportunity_scores",
    "recommendations",
    "research_briefs",
    "research_runs",
    "sources",
    "users",
    "workspaces",
]
