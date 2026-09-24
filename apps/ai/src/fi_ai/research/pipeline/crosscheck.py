"""Stage: crosscheck
Cluster claims (embeddings), detect agreement/contradiction, dedupe syndicated copies, compute independence; derive claim status via evidence.status.
Owner: AI / Research Engine squad.
"""
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "crosscheck", "note": "stub"})
