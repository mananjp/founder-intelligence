"""Robots.txt compliance checker with per-domain caching."""

from __future__ import annotations

from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
import structlog

log = structlog.get_logger()

DEFAULT_USER_AGENT = "FounderIntelligenceBot/1.0 (+https://founderintelligence.com)"


class RobotsChecker:
    """Checks whether a URL is permitted by the domain's robots.txt."""

    def __init__(self, user_agent: str = DEFAULT_USER_AGENT, http_client: httpx.Client | None = None) -> None:
        self.user_agent = user_agent
        self._client = http_client or httpx.Client(timeout=5.0, follow_redirects=True)
        self._cache: dict[str, RobotFileParser] = {}

    def is_allowed(self, url: str) -> bool:
        """Return True if robots.txt permits fetching the URL, or if robots.txt is unavailable."""
        parsed = urlparse(url)
        domain = f"{parsed.scheme}://{parsed.netloc}"

        if not domain or not parsed.netloc:
            return True

        parser = self._cache.get(domain)
        if parser is None:
            parser = self._load_robots(domain)
            self._cache[domain] = parser

        try:
            return parser.can_fetch(self.user_agent, url)
        except Exception as exc:  # noqa: BLE001
            log.warning("robots.check_error", url=url, error=str(exc))
            return True

    def _load_robots(self, domain: str) -> RobotFileParser:
        parser = RobotFileParser()
        robots_url = f"{domain}/robots.txt"
        try:
            resp = self._client.get(robots_url, headers={"User-Agent": self.user_agent})
            if resp.status_code == 200:
                parser.parse(resp.text.splitlines())
            elif resp.status_code in (401, 403):
                # Site explicitly blocks robot reading
                parser.disallow_all = True
            else:
                # 404 or other status code defaults to allow all
                parser.allow_all = True
        except Exception as exc:  # noqa: BLE001
            log.debug("robots.fetch_failed", domain=domain, error=str(exc))
            parser.allow_all = True

        return parser
