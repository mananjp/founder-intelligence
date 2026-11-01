"""Integrated FetchClient orchestrating robots.txt, rate limits, caching, and storage."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from urllib.parse import urljoin

import httpx
import structlog

from fi_ai.research.fetch.cache import UrlCache, compute_url_hash
from fi_ai.research.fetch.extractor import extract_readability
from fi_ai.research.fetch.rate_limiter import DomainRateLimiter
from fi_ai.research.fetch.robots import DEFAULT_USER_AGENT, RobotsChecker
from fi_ai.research.fetch.ssrf import UnsafeUrlError, validate_outbound_url
from fi_ai.research.fetch.storage import InMemoryStorageAdapter, StorageAdapter, compute_content_hash

log = structlog.get_logger()

DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024
DEFAULT_MAX_REDIRECTS = 5
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
ALLOWED_CONTENT_TYPES = frozenset({"text/html", "application/xhtml+xml", "text/plain"})


class ResponseTooLargeError(ValueError):
    """Raised when a response body exceeds the configured byte cap."""


class UnsupportedContentTypeError(ValueError):
    """Raised when a response is not one of the supported readable content types."""


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
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        max_redirects: int = DEFAULT_MAX_REDIRECTS,
        resolve_dns: bool = True,
    ) -> None:
        self.storage = storage or InMemoryStorageAdapter()
        self.cache = cache or UrlCache()
        self.rate_limiter = rate_limiter or DomainRateLimiter()
        self.http_client = http_client or httpx.Client(timeout=10.0, follow_redirects=False)
        self.robots = robots or RobotsChecker(
            user_agent=user_agent, http_client=self.http_client, resolve_dns=resolve_dns
        )
        self.user_agent = user_agent
        self.max_response_bytes = max_response_bytes
        self.max_redirects = max_redirects
        self.resolve_dns = resolve_dns

    def fetch(self, url: str) -> FetchResult:
        """Fetch a single URL respecting robots.txt, rate limit, and TTL cache."""
        url_hash = compute_url_hash(url)
        accessed_at = datetime.now(UTC)

        # 1. Reject SSRF targets (non-HTTP schemes, credentials, internal IPs)
        try:
            validate_outbound_url(url, resolve_dns=self.resolve_dns)
        except UnsafeUrlError as exc:
            log.warning("fetch.unsafe_url", url=url, error=str(exc))
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=False,
                status="failed",
                accessed_at=accessed_at,
                error=str(exc),
            )

        # 2. Check TTL cache
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

        # 3. HTTP fetch with validated redirects, robots and per-domain limits
        try:
            html, final_url = self._fetch_html(url)
        except UnsafeUrlError as exc:
            log.warning("fetch.unsafe_redirect", url=url, error=str(exc))
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=False,
                status="failed",
                accessed_at=accessed_at,
                error=str(exc),
            )
        except _RobotsDisallowed:
            log.warning("fetch.robots_disallowed", url=url)
            return FetchResult(
                url=url,
                url_hash=url_hash,
                success=False,
                status="disallowed_by_robots",
                accessed_at=accessed_at,
                error="Disallowed by robots.txt",
            )
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

        # 4. Readability extraction via trafilatura
        extracted = extract_readability(html, url=final_url)
        readable_text = extracted.text
        content_hash = compute_content_hash(readable_text)

        # 5. Store snapshot via storage adapter
        snapshot_uri = self.storage.put_snapshot(url_hash, content_hash, readable_text)

        # 6. Write to TTL cache
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

    def _fetch_html(self, url: str) -> tuple[str, str]:
        """Fetch HTML, following only validated, robots-permitted redirects."""
        current = url
        for _ in range(self.max_redirects + 1):
            if not self.robots.is_allowed(current):
                raise _RobotsDisallowed

            self.rate_limiter.wait_if_needed(current)
            html, location = self._request_once(current)
            if location is None:
                return html, current

            current = urljoin(current, location)
            validate_outbound_url(current, resolve_dns=self.resolve_dns)

        raise httpx.TooManyRedirects(
            f"Exceeded {self.max_redirects} redirects fetching {url}"
        )

    def _request_once(self, url: str) -> tuple[str, str | None]:
        """Perform one hop, streaming the body so oversized responses stop early."""
        with self.http_client.stream(
            "GET", url, headers={"User-Agent": self.user_agent}, follow_redirects=False
        ) as resp:
            if resp.status_code in REDIRECT_STATUSES:
                location = resp.headers.get("location")
                resp.read()
                return "", location

            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if content_type:
                media_type = content_type.split(";", 1)[0].strip().lower()
                if media_type not in ALLOWED_CONTENT_TYPES:
                    raise UnsupportedContentTypeError(
                        f"Unsupported content type {media_type!r} from {url}"
                    )

            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_bytes():
                total += len(chunk)
                if total > self.max_response_bytes:
                    raise ResponseTooLargeError(
                        f"Response from {url} exceeded {self.max_response_bytes} bytes"
                    )
                chunks.append(chunk)

            body = b"".join(chunks)
            encoding = resp.charset_encoding or "utf-8"
            return body.decode(encoding, errors="replace"), None

    def fetch_all(self, urls: list[str]) -> list[FetchResult]:
        """Fetch multiple URLs sequentially, capturing errors per URL."""
        return [self.fetch(url) for url in urls]


class _RobotsDisallowed(Exception):
    """Internal signal that robots.txt disallows the (redirect) target."""
