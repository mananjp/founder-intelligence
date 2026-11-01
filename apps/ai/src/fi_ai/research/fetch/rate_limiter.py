"""Per-domain rate limiter to avoid overwhelming source hosts."""

from __future__ import annotations

import time
from urllib.parse import urlparse

import structlog

log = structlog.get_logger()


class DomainRateLimiter:
    """Enforces a minimum interval between consecutive requests to the same domain."""

    def __init__(self, min_delay_seconds: float = 0.5) -> None:
        self.min_delay_seconds = min_delay_seconds
        self._last_access: dict[str, float] = {}

    def extract_domain(self, url: str) -> str:
        """Extract lowercase netloc domain from URL."""
        return urlparse(url).netloc.lower()

    def wait_if_needed(self, url: str) -> None:
        """Sleep if required to satisfy per-domain rate limits."""
        domain = self.extract_domain(url)
        if not domain:
            return

        now = time.monotonic()
        last = self._last_access.get(domain)
        if last is not None:
            elapsed = now - last
            remaining = self.min_delay_seconds - elapsed
            if remaining > 0:
                log.debug("rate_limit.wait", domain=domain, seconds=round(remaining, 3))
                time.sleep(remaining)
                now = time.monotonic()

        self._last_access[domain] = now
