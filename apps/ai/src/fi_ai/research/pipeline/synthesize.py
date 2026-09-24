"""Stage: synthesize
Per module (market, customer, competitive, demand, pricing, gtm) produce insights that cite claim_ids. Reject uncited statements.
Owner: AI / Research Engine squad.
"""

from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "synthesize", "note": "stub"})
