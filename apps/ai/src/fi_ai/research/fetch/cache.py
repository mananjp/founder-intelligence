"""In-memory TTL cache keyed by URL hash."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


def compute_url_hash(url: str) -> str:
    """Deterministic SHA-256 hash of a normalized URL."""
    normalized = url.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class CachedEntry:
    content: str
    content_hash: str
    snapshot_uri: str | None
    title: str | None
    publisher: str | None
    expires_at: datetime


class UrlCache:
    """Thread-safe, TTL-based URL cache."""

    def __init__(self, default_ttl_seconds: int = 86400) -> None:
        self.default_ttl = timedelta(seconds=default_ttl_seconds)
        self._store: dict[str, CachedEntry] = {}

    def get(self, url_hash: str) -> CachedEntry | None:
        """Retrieve entry if present and not expired."""
        entry = self._store.get(url_hash)
        if entry is None:
            return None

        if datetime.now(UTC) >= entry.expires_at:
            del self._store[url_hash]
            return None

        return entry

    def set(
        self,
        url_hash: str,
        content: str,
        content_hash: str,
        snapshot_uri: str | None = None,
        title: str | None = None,
        publisher: str | None = None,
        ttl_seconds: int | None = None,
    ) -> None:
        """Store content in cache with expiration."""
        ttl = timedelta(seconds=ttl_seconds) if ttl_seconds is not None else self.default_ttl
        expires_at = datetime.now(UTC) + ttl
        self._store[url_hash] = CachedEntry(
            content=content,
            content_hash=content_hash,
            snapshot_uri=snapshot_uri,
            title=title,
            publisher=publisher,
            expires_at=expires_at,
        )

    def clear(self) -> None:
        self._store.clear()
