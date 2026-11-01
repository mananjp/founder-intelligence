"""HTTP fetch, robots/rate-limit, readability, snapshot storage."""

from fi_ai.research.fetch.cache import UrlCache, compute_url_hash
from fi_ai.research.fetch.client import FetchClient, FetchResult
from fi_ai.research.fetch.extractor import ExtractedContent, extract_readability
from fi_ai.research.fetch.rate_limiter import DomainRateLimiter
from fi_ai.research.fetch.robots import RobotsChecker
from fi_ai.research.fetch.storage import (
    InMemoryStorageAdapter,
    LocalStorageAdapter,
    StorageAdapter,
    compute_content_hash,
)

__all__ = [
    "DomainRateLimiter",
    "ExtractedContent",
    "FetchClient",
    "FetchResult",
    "InMemoryStorageAdapter",
    "LocalStorageAdapter",
    "RobotsChecker",
    "StorageAdapter",
    "UrlCache",
    "compute_content_hash",
    "compute_url_hash",
    "extract_readability",
]
