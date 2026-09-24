"""Stage: fetch
robots.txt + per-domain rate limit + cache by URL hash/TTL; readability extraction; store snapshot + content_hash + accessed_at.
Owner: AI / Research Engine squad.
"""
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "fetch", "note": "stub"})
