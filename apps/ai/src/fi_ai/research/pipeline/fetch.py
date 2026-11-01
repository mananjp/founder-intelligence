"""Stage: fetch
robots.txt + per-domain rate limit + cache by URL hash/TTL; readability extraction; store snapshot + content_hash + accessed_at.
Owner: AI / Research Engine squad.
"""

from __future__ import annotations

from fi_ai.research.fetch import FetchClient
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    """Execute fetch stage. URLs are gathered from the context, fetched safely, and results recorded."""
    urls: list[str] = getattr(ctx, "discovered_urls", [])

    if not urls:
        # If no URLs to fetch, emit progress and return safely
        ctx.publish({"type": "stage.progress", "stage": "fetch", "note": "stub"})
        return

    client = getattr(ctx, "fetch_client", None) or FetchClient()
    results = client.fetch_all(urls)

    # Attach results to run context for downstream extraction stage
    ctx.fetch_results = results

    success_count = sum(1 for r in results if r.success)
    failed_count = len(results) - success_count

    ctx.publish(
        {
            "type": "stage.progress",
            "stage": "fetch",
            "total": len(results),
            "fetched": success_count,
            "failed": failed_count,
        }
    )
