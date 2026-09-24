"""Stage: extract
LLM structured extraction into ExtractedEvidence. HARD GATE: quote must be a verbatim substring of the snapshot, else discard.
Owner: AI / Research Engine squad.
"""

from fi_ai.research.orchestrator import RunContext


def run(ctx: RunContext) -> None:
    # TODO: implement. Read inputs from DB rows written by the previous stage; write outputs idempotently.
    ctx.publish({"type": "stage.progress", "stage": "extract", "note": "stub"})
