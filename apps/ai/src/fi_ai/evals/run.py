"""Eval runner. `python -m fi_ai.evals.run --suite golden`
Metrics to implement first (Bible section 41):
  - unsupported_claim_rate   (claims with no valid evidence / all claims)      target < 5%
  - quote_verbatim_rate      (extracted quotes found verbatim in snapshot)     target 100%
  - citation_validity_rate   (cited claim_ids that exist)                      target 100%
  - contradiction_recall     (seeded contradictions surfaced)                  tracked
  - cost_per_run_usd, latency_p50/p95
"""

import argparse


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", default="golden")
    ap.add_argument("--fail-under-config", action="store_true")
    args = ap.parse_args()
    print(f"eval suite={args.suite}: harness not implemented yet")


if __name__ == "__main__":
    main()
