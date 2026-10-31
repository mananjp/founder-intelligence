"""Unit tests for research fetch subsystem."""

import httpx

from fi_ai.research.fetch.cache import UrlCache, compute_url_hash
from fi_ai.research.fetch.client import FetchClient
from fi_ai.research.fetch.extractor import extract_readability
from fi_ai.research.fetch.rate_limiter import DomainRateLimiter
from fi_ai.research.fetch.robots import RobotsChecker
from fi_ai.research.fetch.storage import (
    InMemoryStorageAdapter,
    LocalStorageAdapter,
    compute_content_hash,
)
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline import fetch as fetch_stage


def test_url_hash_deterministic():
    url1 = "https://example.com/page"
    url2 = "  HTTPS://EXAMPLE.COM/PAGE  "
    assert compute_url_hash(url1) == compute_url_hash(url2)


def test_url_cache_ttl():
    cache = UrlCache(default_ttl_seconds=10)
    url_hash = compute_url_hash("https://example.com")
    cache.set(url_hash, content="Hello", content_hash="hash1")

    cached = cache.get(url_hash)
    assert cached is not None
    assert cached.content == "Hello"

    # Test expired item
    expired_cache = UrlCache(default_ttl_seconds=-1)
    expired_cache.set(url_hash, content="Hello", content_hash="hash1")
    assert expired_cache.get(url_hash) is None

    cache.clear()
    assert cache.get(url_hash) is None


def test_domain_rate_limiter():
    limiter = DomainRateLimiter(min_delay_seconds=0.01)
    assert limiter.extract_domain("https://sub.domain.com/path") == "sub.domain.com"
    assert limiter.extract_domain("invalid-url") == ""

    # Should not throw
    limiter.wait_if_needed("https://sub.domain.com/1")
    limiter.wait_if_needed("https://sub.domain.com/2")
    limiter.wait_if_needed("invalid")


def test_storage_adapters(tmp_path):
    mem = InMemoryStorageAdapter()
    uri = mem.put_snapshot("uhash", "chash", "content123")
    assert mem.get_snapshot(uri) == "content123"
    assert mem.get_snapshot("memory://unknown") is None

    local = LocalStorageAdapter(base_dir=tmp_path)
    uri_local = local.put_snapshot("uhash", "chash", "local_content")
    assert local.get_snapshot(uri_local) == "local_content"
    assert local.get_snapshot("file://nonexistent/path.txt") is None
    assert local.get_snapshot("http://invalid") is None

    assert compute_content_hash("hello") == compute_content_hash("hello")


def test_readability_extractor():
    html = """
    <html>
      <head><title>My Article</title></head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>My Article</h1>
          <p>Founder Intelligence builds AI agents for venture evaluation.</p>
        </article>
      </body>
    </html>
    """
    res = extract_readability(html, url="https://example.com/article")
    assert "Founder Intelligence" in res.text
    assert res.title == "My Article" or res.title is not None

    empty = extract_readability("", url="https://example.com")
    assert empty.text == ""

    # Non-standard HTML fallback
    plain = extract_readability("<div>Plain text snippet</div>", url="https://example.com")
    assert "Plain text snippet" in plain.text


def test_robots_checker():
    def mock_get(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "disallowed.com" in url:
            return httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
        elif "forbidden.com" in url:
            return httpx.Response(403)
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(mock_get))
    checker = RobotsChecker(http_client=mock_client)

    assert checker.is_allowed("https://allowed.com/public") is True
    assert checker.is_allowed("https://disallowed.com/public") is True
    assert checker.is_allowed("https://disallowed.com/private") is False
    assert checker.is_allowed("https://forbidden.com/anything") is False
    assert checker.is_allowed("not-a-valid-url") is True


def test_fetch_client_end_to_end():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "robots.txt" in url:
            return httpx.Response(200, text="User-agent: *\nDisallow: /blocked\n")
        if "/fail" in url:
            return httpx.Response(500, text="Internal Server Error")
        return httpx.Response(200, text="<html><body><p>Successful fetch content</p></body></html>")

    mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    client = FetchClient(http_client=mock_client)

    # 1. Successful fetch
    res_ok = client.fetch("https://test.com/ok")
    assert res_ok.success is True
    assert res_ok.status == "ok"
    assert "Successful fetch content" in (res_ok.readable_text or "")
    assert res_ok.content_hash is not None
    assert res_ok.snapshot_uri is not None

    # 2. Cached fetch
    res_cached = client.fetch("https://test.com/ok")
    assert res_cached.success is True
    assert res_cached.status == "cached"
    assert res_cached.content_hash == res_ok.content_hash

    # 3. Robots disallowed (non-fatal)
    res_disallowed = client.fetch("https://test.com/blocked")
    assert res_disallowed.success is False
    assert res_disallowed.status == "disallowed_by_robots"

    # 4. HTTP failure (non-fatal)
    res_fail = client.fetch("https://test.com/fail")
    assert res_fail.success is False
    assert res_fail.status == "failed"
    assert res_fail.error is not None


def test_fetch_pipeline_stage_run():
    ctx = RunContext("run-test")
    events = []
    ctx.publish = events.append

    # Empty URLs: publishes stub note
    fetch_stage.run(ctx)
    assert events[0] == {"type": "stage.progress", "stage": "fetch", "note": "stub"}

    # With discovered URLs
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html><body><p>Research text</p></body></html>")

    mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
    client = FetchClient(http_client=mock_client)

    ctx2 = RunContext("run-test-2")
    events2 = []
    ctx2.publish = events2.append
    ctx2.discovered_urls = ["https://test.com/1", "https://test.com/2"]
    ctx2.fetch_client = client

    fetch_stage.run(ctx2)
    assert len(events2) == 1
    assert events2[0] == {
        "type": "stage.progress",
        "stage": "fetch",
        "total": 2,
        "fetched": 2,
        "failed": 0,
    }
