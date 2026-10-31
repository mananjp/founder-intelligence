"""Custom SQLAlchemy types for PostgreSQL types not covered by the core dialect."""

from __future__ import annotations

from typing import Any

from sqlalchemy.types import UserDefinedType


def format_vector(values: list[float] | tuple[float, ...]) -> str:
    """Render a Python sequence as the text form PostgreSQL's ``vector`` input accepts."""
    return "[" + ",".join(format(float(value), ".17g") for value in values) + "]"


def parse_vector(value: str) -> list[float]:
    """Parse PostgreSQL's ``vector`` text representation into floats."""
    inner = value.strip()
    if inner.startswith("[") and inner.endswith("]"):
        inner = inner[1:-1]
    if not inner.strip():
        return []
    return [float(part) for part in inner.split(",")]


class Vector(UserDefinedType):
    """``vector(n)`` from the pgvector extension.

    SQLAlchemy has no first-party pgvector type and the project intentionally does not
    depend on the ``pgvector`` Python package. The type binds/receives the textual
    representation (``"[0.1,0.2]"``) so it works with both psycopg sync and async.
    """

    cache_ok = True

    def __init__(self, dimensions: int) -> None:
        if dimensions <= 0:
            raise ValueError("vector dimensions must be positive")
        self.dimensions = dimensions

    def get_col_spec(self, **kw: Any) -> str:
        return f"vector({self.dimensions})"

    def bind_processor(self, dialect: Any):
        def process(value: Any) -> str | None:
            if value is None:
                return None
            if isinstance(value, str):
                return value
            return format_vector(value)

        return process

    def result_processor(self, dialect: Any, coltype: Any):
        def process(value: Any) -> list[float] | None:
            if value is None:
                return None
            if isinstance(value, str):
                return parse_vector(value)
            return list(value)

        return process

    def __repr__(self) -> str:
        return f"Vector({self.dimensions})"
