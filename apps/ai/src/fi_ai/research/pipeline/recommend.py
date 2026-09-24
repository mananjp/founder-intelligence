"""Stage: recommend
Recommendations, assumptions, unknowns, risk register. Run quality_gate before persisting.
Owner: AI / Research Engine squad.
"""
from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "stub"})
