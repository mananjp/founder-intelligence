"""Verify the Core metadata against a database created from the real migrations."""

from __future__ import annotations

import re

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from fi_ai.db import tables
from fi_ai.db.types import Vector

pytestmark = pytest.mark.integration

SYNC_TABLES = tuple(tables.metadata.tables)


def _connect(url):
    import psycopg

    from tests.conftest import _sync_url

    return psycopg.connect(_sync_url(url))


def _normalize_type(value: str) -> str:
    return value.lower().replace(" ", "")


def _metadata_type(column) -> str:
    return _normalize_type(str(column.type.compile(dialect=postgresql.dialect())))


def _normalize_default(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.lower()
    value = re.sub(r"::[a-z_ ]+(\[\])?", "", value)
    return value.replace(" ", "")


def _metadata_default(column) -> str | None:
    if column.server_default is None or isinstance(column.server_default, sa.Identity):
        return None
    return _normalize_default(str(column.server_default.arg))


def test_core_metadata_matches_migrated_postgres(migrated_database):
    expected = {
        table_name: {
            column.name: (_metadata_type(column), not column.nullable, _metadata_default(column))
            for column in tables.metadata.tables[table_name].columns
        }
        for table_name in SYNC_TABLES
    }

    with _connect(migrated_database) as connection:
        rows = connection.execute(
            """
            select c.relname as table_name,
                   a.attname as column_name,
                   format_type(a.atttypid, a.atttypmod) as type_name,
                   a.attnotnull as not_null,
                   pg_get_expr(d.adbin, d.adrelid) as default_sql
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where n.nspname = 'public'
              and c.relkind = 'r'
              and a.attnum > 0
              and not a.attisdropped
            order by c.relname, a.attnum
            """
        ).fetchall()

    actual: dict[str, dict[str, tuple[str, bool, str | None]]] = {}
    for table_name, column_name, type_name, not_null, default_sql in rows:
        if table_name not in expected:
            continue
        actual.setdefault(table_name, {})[column_name] = (
            _normalize_type(type_name),
            bool(not_null),
            _normalize_default(default_sql),
        )

    for table_name, columns in expected.items():
        assert actual.get(table_name) == columns, f"live schema drift in {table_name}"


def test_live_primary_keys_match_metadata(migrated_database):
    with _connect(migrated_database) as connection:
        rows = connection.execute(
            """
            select c.relname as table_name, a.attname as column_name
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
            where n.nspname = 'public' and con.contype = 'p'
            order by c.relname, k.ord
            """
        ).fetchall()

    actual: dict[str, list[str]] = {}
    for table_name, column_name in rows:
        if table_name in SYNC_TABLES:
            actual.setdefault(table_name, []).append(column_name)

    for table_name in SYNC_TABLES:
        expected = [column.name for column in tables.metadata.tables[table_name].primary_key.columns]
        assert actual.get(table_name, []) == expected, table_name


def test_live_unique_constraints_match_metadata(migrated_database):
    with _connect(migrated_database) as connection:
        rows = connection.execute(
            """
            select c.relname as table_name,
                   array_agg(a.attname order by k.ord) as columns
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
            where n.nspname = 'public' and con.contype = 'u'
            group by c.relname, con.conname
            """
        ).fetchall()

    actual: dict[str, set[tuple[str, ...]]] = {}
    for table_name, columns in rows:
        if table_name in SYNC_TABLES:
            actual.setdefault(table_name, set()).add(tuple(columns))

    for table_name in SYNC_TABLES:
        expected = {
            tuple(column.name for column in constraint.columns)
            for constraint in tables.metadata.tables[table_name].constraints
            if isinstance(constraint, sa.UniqueConstraint)
        }
        assert actual.get(table_name, set()) == expected, table_name


def test_live_foreign_keys_match_metadata(migrated_database):
    action_codes = {"a": None, "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}
    with _connect(migrated_database) as connection:
        rows = connection.execute(
            """
            select c.relname as table_name,
                   ref.relname as referred_table,
                   con.confdeltype as on_delete,
                   array_agg(a.attname order by k.ord) as columns,
                   array_agg(ra.attname order by k.ord) as referred_columns
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_class ref on ref.oid = con.confrelid
            join pg_namespace n on n.oid = c.relnamespace
            join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
            join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
            join pg_attribute ra on ra.attrelid = ref.oid and ra.attnum = rk.attnum
            where n.nspname = 'public' and con.contype = 'f'
            group by c.relname, con.conname, ref.relname, con.confdeltype
            """
        ).fetchall()

    actual: dict[str, set[tuple[tuple[str, ...], str, tuple[str, ...], str | None]]] = {}
    for table_name, referred_table, on_delete, columns, referred_columns in rows:
        if table_name in SYNC_TABLES:
            actual.setdefault(table_name, set()).add(
                (tuple(columns), referred_table, tuple(referred_columns), action_codes[on_delete])
            )

    for table_name in SYNC_TABLES:
        expected = {
            (
                tuple(column.name for column in constraint.columns),
                constraint.referred_table.name,
                tuple(element.column.name for element in constraint.elements),
                constraint.ondelete,
            )
            for constraint in tables.metadata.tables[table_name].foreign_key_constraints
        }
        assert actual.get(table_name, set()) == expected, table_name


def test_live_indexes_match_metadata(migrated_database):
    with _connect(migrated_database) as connection:
        rows = connection.execute(
            """
            select t.relname as table_name,
                   i.relname as index_name,
                   am.amname as method,
                   array_agg(a.attname order by k.ord) as columns
            from pg_index ix
            join pg_class i on i.oid = ix.indexrelid
            join pg_class t on t.oid = ix.indrelid
            join pg_namespace n on n.oid = t.relnamespace
            join pg_am am on am.oid = i.relam
            join lateral unnest(ix.indkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
            where n.nspname = 'public'
              and not exists (
                select 1 from pg_constraint con
                where con.conindid = ix.indexrelid and con.contype in ('p', 'u')
              )
            group by t.relname, i.relname, am.amname
            """
        ).fetchall()

    actual: dict[str, set[tuple[str, tuple[str, ...], str]]] = {}
    for table_name, index_name, method, columns in rows:
        if table_name in SYNC_TABLES:
            actual.setdefault(table_name, set()).add((index_name, tuple(columns), method))

    for table_name in SYNC_TABLES:
        expected = {
            (
                index.name,
                tuple(
                    (
                        expression.element.name
                        if isinstance(expression, sa.sql.elements.UnaryExpression)
                        else expression.name
                    )
                    for expression in index.expressions
                ),
                "ivfflat" if index.name == "evidence_embedding_idx" else "btree",
            )
            for index in tables.metadata.tables[table_name].indexes
        }
        assert actual.get(table_name, set()) == expected, table_name


def test_vector_extension_is_available(migrated_database):
    with _connect(migrated_database) as connection:
        version = connection.execute(
            "select extversion from pg_extension where extname = 'vector'"
        ).fetchone()
    assert version is not None
    assert Vector(3).get_col_spec() == "vector(3)"


def test_metadata_does_not_create_schema_implicitly(migrated_database):
    """The metadata object must be declarative only (ADR-0003); tests apply migrations."""
    assert "alembic_version" not in tables.metadata.tables
    assert all(table.schema is None for table in tables.metadata.tables.values())
