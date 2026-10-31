"""Integrated FetchClient orchestrating robots.txt, rate limits, caching, and storage."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

import httpx
import structlog

from fi_ai.research.fetch.cache import UrlCache, compute_url_hash
from fi_ai.research.fetch.extractor import extract_readability
from fi_ai.research.fetch.rate_limiter import DomainRateLimiter
from fi_ai.research.fetch.robots import DEFAULT_USER_AGENT, RobotsChecker
from fi_ai.research.fetch.storage import InMemoryStorageAdapter, StorageAdapter, compute_content_hash

log = structlog.get_logger()


@dataclass(slots=True)
class FetchResult:
    """Result of fetching a single URL. Failures are captured here, not run-fatal."""

    url: str
    url_hash: str
    success: bool
    status: str  # "ok" | "cached" | "disallowed_by_robots" | "failed"
    content_hash: str | None = None
    readable_text: str | None = None
    title: str | None = None
    publisher: str | None = None
    published_at: date | None = None
    accessed_at: datetime | None = None
    snapshot_uri: str | None = None
    error: str | None = None


class FetchClient:
    """Orchestrates compliant, cached, rate-limited HTTP fetching."""

    def __init__(
        self,
        storage: StorageAdapter | None = None,
        cache: UrlCache | None = None,
        robots: RobotsChecker | None = None,
        rate_limiter: DomainRateLimiter | None = None,
        http_client: httpx.Client | None = None,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        self.storage = storage or InMemoryStorageAdapter()
        self.cache = cache or UrlCache()
        self.rate_limiter = rate_limiter or DomainRateLimiter()
        self.http_client = http_client or httpx.Client(timeout=10.0, follow_redirects=True)
        self.robots = robots or RobotsChecker(user_agent=user_agent, http_client=self.http_client)
        self.user_agent = user_agent

    def fetch(self, url: str) -> FetchResult:
        """Fetch a single URL respecting robots.txt, rate limit, and TTL cache."""
        url_hash = compute_url_hash(url)
        accessed_at = datetime.now(UTC)

        # 1. Check TTL cache
        cached = self.cache.get(url_hash)
        if cached is not None:
            log.info("fetch.cache_hit", url=url, url_hash=url_hash)
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=True,
                status="cached",
                content_hash=cached.content_hash,
                readable_text=cached.content,
                title=cached.title,
                publisher=cached.publisher,
                accessed_at=accessed_at,
                snapshot_uri=cached.snapshot_uri,
            )

        # 2. Check robots.txt
        if not self.robots.is_allowed(url):
            log.warning("fetch.robots_disallowed", url=url)
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=False,
                status="disallowed_by_robots",
                accessed_at=accessed_at,
                error="Disallowed by robots.txt",
            )

        # 3. Apply per-domain rate limit
        self.rate_limiter.wait_if_needed(url)

        # 4. HTTP Fetch (failures recorded per URL, never fatal)
        try:
            resp = self.http_client.get(url, headers={"User-Agent": self.user_agent})
            resp.raise_for_status()
            html = resp.text
        except Exception as exc:  # noqa: BLE001
            log.warning("fetch.http_failed", url=url, error=str(exc))
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=False,
                status="failed",
                accessed_at=accessed_at,
                error=str(exc),
            )

        # 5. Readability extraction via trafilatura
        extracted = extract_readability(html, url=url)
        readable_text = extracted.text
        content_hash = compute_content_hash(readable_text)

        # 6. Store snapshot via storage adapter
        snapshot_uri = self.storage.put_snapshot(url_hash, content_hash, readable_text)

        # 7. Write to TTL cache
        self.cache.set(
            url_hash=url_hash,
            content=readable_text,
            content_hash=content_hash,
            snapshot_uri=snapshot_uri,
            title=extracted.title,
            publisher=extracted.publisher,
        )

        log.info("fetch.success", url=url, content_hash=content_hash, snapshot_uri=snapshot_uri)
        return FetchResult(
            url=url,
            url_hash=url_hash,
            success=True,
            status="ok",
            content_hash=content_hash,
            readable_text=readable_text,
            title=extracted.title,
            publisher=extracted.publisher,
            published_at=extracted.published_at,
            accessed_at=accessed_at,
            snapshot_uri=snapshot_uri,
        )

    def fetch_all(self, urls: list[str]) -> list[FetchResult]:
        """Fetch multiple URLs sequentially, capturing errors per URL."""
        return [self.fetch(url) for url in urls]
