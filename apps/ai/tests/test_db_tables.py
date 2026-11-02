"""Schema contract tests for the SQLAlchemy Core tables (no database required)."""

from __future__ import annotations

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import operators

from fi_ai.db import tables
from fi_ai.db.types import Vector, format_vector, parse_vector

# name -> {column: (compiled type, nullable, server default SQL or None)}
EXPECTED_COLUMNS: dict[str, dict[str, tuple[str, bool, str | None]]] = {
    "users": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "email": ("text", False, None),
        "display_name": ("text", True, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "workspaces": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "name": ("text", False, None),
        "owner_id": ("uuid", False, None),
        "plan": ("text", False, "'free'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "ideas": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "workspace_id": ("uuid", False, None),
        "created_by": ("uuid", False, None),
        "title": ("text", False, None),
        "raw_description": ("text", False, None),
        "category": ("text", True, None),
        "geography": ("text[]", False, "'{}'"),
        "stage": ("text", False, "'exploring'"),
        "status": ("text", False, "'active'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
        "updated_at": ("timestampwithtimezone", False, "now()"),
    },
    "research_briefs": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "version": ("integer", False, "1"),
        "problem": ("text", True, None),
        "customer": ("text", True, None),
        "geography": ("text[]", True, None),
        "category": ("text", True, None),
        "alternatives": ("text", True, None),
        "business_model": ("text", True, None),
        "differentiation": ("text", True, None),
        "known_evidence": ("jsonb", False, "'[]'::jsonb"),
        "unknowns": ("jsonb", False, "'[]'::jsonb"),
        "research_questions": ("jsonb", False, "'[]'::jsonb"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "research_runs": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "workspace_id": ("uuid", False, None),
        "idea_id": ("uuid", False, None),
        "brief_id": ("uuid", False, None),
        "depth": ("text", False, "'quick'"),
        "geography": ("text[]", False, None),
        "state": ("text", False, "'created'"),
        "budget_usd": ("numeric(8,2)", True, None),
        "spent_usd": ("numeric(8,2)", False, "0"),
        "created_by": ("uuid", False, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
        "completed_at": ("timestampwithtimezone", True, None),
    },
    "sources": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "url": ("text", False, None),
        "content_hash": ("text", False, None),
        "title": ("text", True, None),
        "publisher": ("text", True, None),
        "published_at": ("date", True, None),
        "source_type": ("text", False, None),
        "accessed_at": ("timestampwithtimezone", False, "now()"),
        "snapshot_uri": ("text", True, None),
    },
    "evidence": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "run_id": ("uuid", False, None),
        "source_id": ("uuid", False, None),
        "claim_text": ("text", False, None),
        "quote": ("text", False, None),
        "value": ("numeric", True, None),
        "unit": ("text", True, None),
        "entity": ("text", True, None),
        "observed_at": ("date", True, None),
        "stance": ("text", False, "'supports'"),
        "relevance": ("numeric(3,2)", False, "0.7"),
        "kind": ("text", False, "'fact'"),
        "embedding": ("vector(1536)", True, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "claims": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "run_id": ("uuid", True, None),
        "statement": ("text", False, None),
        "module": ("text", False, None),
        "origin": ("text", False, "'evidence'"),
        "kind": ("text", False, "'fact'"),
        "status": ("text", False, None),
        "status_computed_at": ("timestampwithtimezone", False, "now()"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "claim_evidence": {
        "claim_id": ("uuid", False, None),
        "evidence_id": ("uuid", False, None),
    },
    "claim_contradictions": {
        "claim_id": ("uuid", False, None),
        "contradicts_claim_id": ("uuid", False, None),
        "note": ("text", True, None),
    },
    "insights": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "run_id": ("uuid", True, None),
        "module": ("text", False, None),
        "summary": ("text", False, None),
        "cited_claim_ids": ("uuid[]", False, "'{}'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "opportunity_scores": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "run_id": ("uuid", True, None),
        "dimension_scores": ("jsonb", False, None),
        "overall_score": ("numeric(3,1)", False, None),
        "evidence_coverage": ("numeric(4,3)", False, None),
        "scoring_model_version": ("text", False, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "assumptions": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "type": ("text", False, None),
        "statement": ("text", False, None),
        "importance": ("text", False, "'medium'"),
        "status": ("text", False, "'unverified'"),
        "linked_claim_ids": ("uuid[]", False, "'{}'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
        "updated_at": ("timestampwithtimezone", False, "now()"),
    },
    "experiments": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "assumption_id": ("uuid", True, None),
        "method": ("text", False, None),
        "hypothesis": ("text", False, None),
        "expected_learning": ("numeric(3,2)", True, None),
        "decision_impact": ("numeric(3,2)", True, None),
        "cost_time": ("numeric(6,2)", True, None),
        "priority_score": ("numeric(6,3)", True, None),
        "status": ("text", False, "'proposed'"),
        "result": ("text", True, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "recommendations": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "run_id": ("uuid", True, None),
        "action": ("text", False, None),
        "rationale": ("text", False, None),
        "cited_claim_ids": ("uuid[]", False, "'{}'"),
        "linked_assumption_ids": ("uuid[]", False, "'{}'"),
        "confidence": ("numeric(3,2)", True, None),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "decisions": {
        "id": ("uuid", False, "gen_random_uuid()"),
        "idea_id": ("uuid", False, None),
        "recommendation_id": ("uuid", True, None),
        "choice": ("text", False, None),
        "rationale": ("text", True, None),
        "decided_by": ("uuid", False, None),
        "linked_assumption_ids": ("uuid[]", False, "'{}'"),
        "cited_claim_ids": ("uuid[]", False, "'{}'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
    "llm_calls": {
        "id": ("bigint", False, None),
        "run_id": ("uuid", True, None),
        "task": ("text", False, None),
        "model": ("text", False, None),
        "input_tokens": ("integer", True, None),
        "output_tokens": ("integer", True, None),
        "cost_usd": ("numeric(10,4)", True, None),
        "latency_ms": ("integer", True, None),
        "status": ("text", False, "'ok'"),
        "created_at": ("timestampwithtimezone", False, "now()"),
    },
}

EXPECTED_PKS: dict[str, tuple[str, ...]] = {
    "users": ("id",),
    "workspaces": ("id",),
    "ideas": ("id",),
    "research_briefs": ("id",),
    "research_runs": ("id",),
    "sources": ("id",),
    "evidence": ("id",),
    "claims": ("id",),
    "claim_evidence": ("claim_id", "evidence_id"),
    "claim_contradictions": ("claim_id", "contradicts_claim_id"),
    "insights": ("id",),
    "opportunity_scores": ("id",),
    "assumptions": ("id",),
    "experiments": ("id",),
    "recommendations": ("id",),
    "decisions": ("id",),
    "llm_calls": ("id",),
}

EXPECTED_UNIQUES: dict[str, set[tuple[str, ...]]] = {
    "users": {("email",)},
    "research_briefs": {("idea_id", "version")},
    "sources": {("url", "content_hash")},
}

EXPECTED_FKS: dict[str, set[tuple[tuple[str, ...], str, tuple[str, ...], str | None]]] = {
    "workspaces": {((("owner_id",), "users", ("id",), None))},
    "ideas": {
        (("workspace_id",), "workspaces", ("id",), "CASCADE"),
        (("created_by",), "users", ("id",), None),
    },
    "research_briefs": {(("idea_id",), "ideas", ("id",), "CASCADE")},
    "research_runs": {
        (("workspace_id",), "workspaces", ("id",), "CASCADE"),
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("brief_id",), "research_briefs", ("id",), None),
        (("created_by",), "users", ("id",), None),
    },
    "evidence": {
        (("run_id",), "research_runs", ("id",), "CASCADE"),
        (("source_id",), "sources", ("id",), None),
    },
    "claims": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("run_id",), "research_runs", ("id",), None),
    },
    "claim_evidence": {
        (("claim_id",), "claims", ("id",), "CASCADE"),
        (("evidence_id",), "evidence", ("id",), "CASCADE"),
    },
    "claim_contradictions": {
        (("claim_id",), "claims", ("id",), "CASCADE"),
        (("contradicts_claim_id",), "claims", ("id",), "CASCADE"),
    },
    "insights": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("run_id",), "research_runs", ("id",), None),
    },
    "opportunity_scores": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("run_id",), "research_runs", ("id",), None),
    },
    "assumptions": {(("idea_id",), "ideas", ("id",), "CASCADE")},
    "experiments": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("assumption_id",), "assumptions", ("id",), None),
    },
    "recommendations": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("run_id",), "research_runs", ("id",), None),
    },
    "decisions": {
        (("idea_id",), "ideas", ("id",), "CASCADE"),
        (("recommendation_id",), "recommendations", ("id",), None),
        (("decided_by",), "users", ("id",), None),
    },
    "llm_calls": {(("run_id",), "research_runs", ("id",), "SET NULL")},
}

EXPECTED_INDEXES: dict[str, set[tuple[str, tuple[str, ...], str | None]]] = {
    "ideas": {("ideas_workspace_id_idx", ("workspace_id",), None)},
    "research_runs": {
        ("research_runs_idea_id_created_at_idx", ("idea_id", "created_at desc"), None),
    },
    "evidence": {
        ("evidence_run_id_idx", ("run_id",), None),
        ("evidence_embedding_idx", ("embedding",), "ivfflat"),
    },
    "claims": {("claims_idea_id_module_idx", ("idea_id", "module"), None)},
    "opportunity_scores": {
        ("opportunity_scores_idea_id_created_at_idx", ("idea_id", "created_at desc"), None),
        ("opportunity_scores_run_id_idx", ("run_id",), None),
    },
    "assumptions": {("assumptions_idea_id_status_idx", ("idea_id", "status"), None)},
    "experiments": {
        ("experiments_idea_id_status_idx", ("idea_id", "status"), None),
        ("experiments_assumption_id_idx", ("assumption_id",), None),
    },
    "recommendations": {
        ("recommendations_idea_id_created_at_idx", ("idea_id", "created_at desc"), None),
        ("recommendations_run_id_idx", ("run_id",), None),
    },
    "decisions": {
        ("decisions_idea_id_created_at_idx", ("idea_id", "created_at desc"), None),
        ("decisions_recommendation_id_idx", ("recommendation_id",), None),
        ("decisions_decided_by_idx", ("decided_by",), None),
    },
    "llm_calls": {("llm_calls_run_id_idx", ("run_id",), None)},
}


def _type_name(type_: sa.types.TypeEngine) -> str:
    return str(type_.compile(dialect=postgresql.dialect())).lower().replace(" ", "")


def _default_sql(column: sa.Column) -> str | None:
    if column.server_default is None or isinstance(column.server_default, sa.Identity):
        return None
    return str(column.server_default.arg)


def _index_column_names(index: sa.Index) -> tuple[str, ...]:
    names: list[str] = []
    for expression in index.expressions:
        element = (
            expression.element if isinstance(expression, sa.sql.elements.UnaryExpression) else expression
        )
        if (
            isinstance(expression, sa.sql.elements.UnaryExpression)
            and expression.modifier is operators.desc_op
        ):
            names.append(f"{element.name} desc")
        else:
            names.append(element.name)
    return tuple(names)


def test_metadata_contains_only_expected_tables():
    assert set(tables.metadata.tables) == set(EXPECTED_COLUMNS)


def test_metadata_resolves_all_foreign_keys():
    # sorted_tables raises NoReferencedTableError on a dangling FK target.
    sorted_names = [table.name for table in tables.metadata.sorted_tables]
    assert set(sorted_names) == set(EXPECTED_COLUMNS)


def test_columns_types_nullability_and_defaults_match_migrations():
    for table_name, expected_columns in EXPECTED_COLUMNS.items():
        table = tables.metadata.tables[table_name]
        actual = {
            column.name: (_type_name(column.type), column.nullable, _default_sql(column))
            for column in table.columns
        }
        assert actual == expected_columns, f"column drift in {table_name}"


def test_primary_keys_match_migrations():
    for table_name, expected in EXPECTED_PKS.items():
        table = tables.metadata.tables[table_name]
        assert tuple(column.name for column in table.primary_key.columns) == expected, table_name


def test_unique_constraints_match_migrations():
    for table_name in EXPECTED_COLUMNS:
        table = tables.metadata.tables[table_name]
        actual = {
            tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        }
        assert actual == EXPECTED_UNIQUES.get(table_name, set()), table_name


def test_foreign_keys_match_migrations():
    for table_name in EXPECTED_COLUMNS:
        table = tables.metadata.tables[table_name]
        actual = {
            (
                tuple(column.name for column in constraint.columns),
                constraint.referred_table.name,
                tuple(element.column.name for element in constraint.elements),
                constraint.ondelete,
            )
            for constraint in table.foreign_key_constraints
        }
        assert actual == EXPECTED_FKS.get(table_name, set()), table_name


def test_indexes_match_migrations():
    for table_name in EXPECTED_COLUMNS:
        table = tables.metadata.tables[table_name]
        actual = {
            (
                index.name,
                _index_column_names(index),
                index.dialect_options["postgresql"].get("using") or None,
            )
            for index in table.indexes
        }
        assert actual == EXPECTED_INDEXES.get(table_name, set()), table_name


def test_source_natural_key_is_unique():
    sources = tables.metadata.tables["sources"]
    unique_columns = {
        tuple(column.name for column in constraint.columns)
        for constraint in sources.constraints
        if isinstance(constraint, sa.UniqueConstraint)
    }
    assert ("url", "content_hash") in unique_columns


def test_llm_calls_id_uses_always_identity_like_migration_005():
    identity = tables.llm_calls.c.id.identity
    assert identity is not None
    assert identity.always is True


def test_vector_type_round_trip_helpers():
    assert format_vector([0.5, 1.0, -2.25]) == "[0.5,1,-2.25]"
    assert parse_vector("[0.5,1.0,-2.25]") == [0.5, 1.0, -2.25]
    assert parse_vector(" [] ") == []

    vector = Vector(3)
    processor = vector.bind_processor(postgresql.dialect())
    assert processor is not None
    assert processor([1, 2.5]) == "[1,2.5]"
    assert processor(None) is None
    assert processor("[1,2]") == "[1,2]"

    result = vector.result_processor(postgresql.dialect(), None)
    assert result is not None
    assert result("[1,2.5]") == [1.0, 2.5]
    assert result(None) is None
    assert result([1, 2]) == [1.0, 2.0]
    assert vector.get_col_spec() == "vector(3)"
    assert repr(vector) == "Vector(3)"

    with pytest.raises(ValueError, match="dimensions must be positive"):
        Vector(0)


def test_database_url_normalization_supports_deployment_schemes():
    from fi_ai.db import _normalize_db_url

    assert _normalize_db_url("postgres://u:p@db:5432/fi") == "postgresql+psycopg://u:p@db:5432/fi"
    assert _normalize_db_url("postgresql://u:p@db:5432/fi") == "postgresql+psycopg://u:p@db:5432/fi"
    assert _normalize_db_url("postgresql+psycopg://u:p@db:5432/fi") == ("postgresql+psycopg://u:p@db:5432/fi")


def test_repository_factory_uses_shared_engine():
    from fi_ai.db import engine, repository
    from fi_ai.db.repositories import PostgresRepository

    repo = repository()
    assert isinstance(repo, PostgresRepository)
    assert repo._engine is engine
