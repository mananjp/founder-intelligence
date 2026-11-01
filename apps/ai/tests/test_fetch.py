"""Unit tests for research fetch subsystem."""

import httpx
import pytest

from fi_ai.research.fetch.cache import UrlCache, compute_url_hash
from fi_ai.research.fetch.client import FetchClient
from fi_ai.research.fetch.extractor import extract_readability
from fi_ai.research.fetch.rate_limiter import DomainRateLimiter
from fi_ai.research.fetch.robots import RobotsChecker
from fi_ai.research.fetch.ssrf import UnsafeUrlError, validate_outbound_url
from fi_ai.research.fetch.storage import (
    InMemoryStorageAdapter,
    LocalStorageAdapter,
    compute_content_hash,
)
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline import fetch as fetch_stage


def test_url_hash_deterministic():
    url1 = "https://example.com/page"
    url2 = "  HTTPS://EXAMPLE.COM/page  "
    assert compute_url_hash(url1) == compute_url_hash(url2)

    # Default ports and fragments are ignored
    assert compute_url_hash("https://example.com:443/page") == compute_url_hash(url1)
    assert compute_url_hash("https://example.com/page#section") == compute_url_hash(url1)

    # Paths are case-sensitive in HTTP and must not collide in the cache
    assert compute_url_hash("https://example.com/Page") != compute_url_hash(url1)
    assert compute_url_hash("https://example.com/page?q=A") != compute_url_hash(
        "https://example.com/page?q=a"
    )


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
    checker = RobotsChecker(http_client=mock_client, resolve_dns=False)

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
    client = FetchClient(http_client=mock_client, resolve_dns=False)

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
    client = FetchClient(http_client=mock_client, resolve_dns=False)

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


def test_validate_outbound_url_rejects_unsafe_targets():
    unsafe_urls = [
        "http://127.0.0.1/",
        "http://localhost:3000/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://[::1]/",
        "http://0.0.0.0/",
        "ftp://example.com/file",
        "file:///etc/passwd",
        "https://user:pass@example.com/",
    ]
    for url in unsafe_urls:
        with pytest.raises(UnsafeUrlError):
            validate_outbound_url(url, resolve_dns=False)

    assert validate_outbound_url("https://93.184.216.34/", resolve_dns=False) == "https://93.184.216.34/"


def test_fetch_client_rejects_ssrf_before_requesting():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, text="secret")

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    client = FetchClient(http_client=mock_client, resolve_dns=False)

    res = client.fetch("http://127.0.0.1:8080/admin")
    assert res.success is False
    assert res.status == "failed"
    assert "non-public" in (res.error or "")
    assert calls == []


def test_fetch_client_follows_validated_redirects_and_rejects_internal():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        calls.append(url)
        if url.endswith("/start"):
            return httpx.Response(302, headers={"location": "/final"})
        return httpx.Response(200, text="<html><body><p>Final content</p></body></html>")

    client = FetchClient(
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
        resolve_dns=False,
    )
    res = client.fetch("https://test.com/start")
    assert res.success is True
    assert "Final content" in (res.readable_text or "")
    assert "https://test.com/final" in calls

    def redirect_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest"})

    internal_client = FetchClient(
        http_client=httpx.Client(transport=httpx.MockTransport(redirect_handler)),
        resolve_dns=False,
    )
    internal = internal_client.fetch("https://test.com/start")
    assert internal.success is False
    assert "non-public" in (internal.error or "")


def test_fetch_client_caps_response_size():
    client = FetchClient(
        http_client=httpx.Client(
            transport=httpx.MockTransport(lambda _r: httpx.Response(200, text="x" * 64))
        ),
        resolve_dns=False,
        max_response_bytes=16,
    )
    res = client.fetch("https://test.com/big")
    assert res.success is False
    assert "exceeded" in (res.error or "")


def test_fetch_client_rejects_unsupported_content_type():
    client = FetchClient(
        http_client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _r: httpx.Response(
                    200,
                    headers={"content-type": "application/pdf"},
                    content=b"%PDF-1.7",
                )
            )
        ),
        resolve_dns=False,
    )
    res = client.fetch("https://test.com/file.pdf")
    assert res.success is False
    assert "Unsupported content type" in (res.error or "")


def test_robots_fail_closed_on_server_error():
    mock_client = httpx.Client(transport=httpx.MockTransport(lambda _r: httpx.Response(503)))
    checker = RobotsChecker(http_client=mock_client, resolve_dns=False)
    assert checker.is_allowed("https://broken.com/page") is False
