"""Stage: scope
Brief -> ResearchQuestion[] with priority, required source classes and evidence targets.
Owner: AI / Research Engine squad.
"""

from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "scope", "note": "stub"})
