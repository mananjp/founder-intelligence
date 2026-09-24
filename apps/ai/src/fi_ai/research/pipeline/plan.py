"""Stage: plan
Questions -> tasks (search/fetch/extract) with geography-aware query templates and per-task budgets.
Owner: AI / Research Engine squad.
"""

from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "plan", "note": "stub"})
