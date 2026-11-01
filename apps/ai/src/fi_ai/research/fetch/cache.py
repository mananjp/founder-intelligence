"""In-memory TTL cache keyed by URL hash."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import SplitResult, urlsplit, urlunsplit


def _normalized_netloc(parts: SplitResult) -> str:
    """Lowercase scheme/host, drop credentials, and omit default ports."""
    host = (parts.hostname or "").lower()
    if not host:
        return parts.netloc.lower()
    if ":" in host:  # IPv6 literal
        host = f"[{host}]"
    try:
        port = parts.port
    except ValueError:
        port = None
    scheme = parts.scheme.lower()
    is_default = port is None or (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    return host if is_default else f"{host}:{port}"


def compute_url_hash(url: str) -> str:
    """Deterministic SHA-256 hash of a normalized URL.

    Scheme and host are case-insensitive, but the path and query are preserved
    as-is because HTTP paths are case-sensitive. The fragment is dropped.
    """
    parts = urlsplit(url.strip())
    normalized = urlunsplit(
        (
            parts.scheme.lower(),
            _normalized_netloc(parts),
            parts.path or "/",
            parts.query,
            "",
        )
    )
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
