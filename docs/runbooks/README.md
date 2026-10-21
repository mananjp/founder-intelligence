# Operational Runbooks

This directory contains verified standard operating procedures (SOPs) and runbooks for Founder Intelligence infrastructure, operations, and incidents.

## Index of Runbooks

- [Database indexes — migration 006](./db-indexes.md): Catalog, verification queries, idempotency, and rollback procedure for indexes on `003` and `004` tables.
- [Security scan gate](./security-scan.md): PR-time and main-push security gates for secrets, dependency audit, and filesystem/container Trivy scans.
- [Stuck research run](./research-run-stuck.md): Diagnostics, queue inspection, cancellation, and worker recovery for halted AI research runs.
- [LLM provider outage & failover](./llm-provider-outage.md): Handling OpenAI / Anthropic outages, error spikes, and switching fallback providers.
- [Database backup & restore](./db-restore.md): Routine snapshot procedures and disaster recovery restore steps for PostgreSQL 16 + pgvector.
- [Cost & token spike mitigation](./cost-spike.md): Investigating runaway token usage, enforcing tier ceilings, and autoscaling controls.
- [Rate limiting operational guidance](./rate-limiting.md): Redis rate limiter store, thresholds, fail-open behavior, and tuning.
