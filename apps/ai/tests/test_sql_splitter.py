"""Unit tests for the migration statement splitter (no database required)."""

from __future__ import annotations

from tests.conftest import _iter_statements


def test_iter_statements_handles_dollar_quoted_blocks() -> None:
    sql = """create table t (id int);
do $$
begin
  insert into t values (1);
  insert into t values (2);
end
$$;
create index i on t (id);
"""
    statements = list(_iter_statements(sql))

    assert len(statements) == 3
    assert statements[0].startswith("create table")
    assert statements[1].startswith("do $$")
    assert statements[1].endswith("$$")
    assert "insert into t values (1);" in statements[1]
    assert statements[2].startswith("create index")


def test_iter_statements_handles_tagged_dollar_quotes() -> None:
    sql = "select $fn$; not a separator; $fn$; select 1;"
    statements = list(_iter_statements(sql))

    assert statements == ["select $fn$; not a separator; $fn$", "select 1"]
