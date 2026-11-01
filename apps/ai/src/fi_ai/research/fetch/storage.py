"""Storage adapters for persisting raw/extracted source snapshots."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Protocol


def compute_content_hash(text: str) -> str:
    """SHA-256 hash of snapshot content."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class StorageAdapter(Protocol):
    """Protocol for storing snapshot payloads."""

    def put_snapshot(self, url_hash: str, content_hash: str, payload: str) -> str:
        """Persist snapshot and return its URI."""
        ...

    def get_snapshot(self, uri: str) -> str | None:
        """Retrieve snapshot text by URI."""
        ...


class InMemoryStorageAdapter:
    """Fast in-memory storage adapter for testing and lightweight runs."""

    def __init__(self) -> None:
        self._storage: dict[str, str] = {}

    def put_snapshot(self, url_hash: str, content_hash: str, payload: str) -> str:
        uri = f"memory://snapshots/{url_hash}/{content_hash}.txt"
        self._storage[uri] = payload
        return uri

    def get_snapshot(self, uri: str) -> str | None:
        return self._storage.get(uri)


class LocalStorageAdapter:
    """Local filesystem snapshot adapter."""

    def __init__(self, base_dir: Path | str = ".snapshots") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def put_snapshot(self, url_hash: str, content_hash: str, payload: str) -> str:
        dest_dir = self.base_dir / url_hash
        dest_dir.mkdir(parents=True, exist_ok=True)
        file_path = dest_dir / f"{content_hash}.txt"
        file_path.write_text(payload, encoding="utf-8")
        return f"file://{file_path.resolve().as_posix()}"

    def get_snapshot(self, uri: str) -> str | None:
        if not uri.startswith("file://"):
            return None
        path = Path(uri[len("file://") :])
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")
