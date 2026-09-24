"""Stage: discover
Multi-provider search per source class; dedupe URLs; rank by source-quality prior; respect geography/language.
Owner: AI / Research Engine squad.
"""
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "discover", "note": "stub"})
