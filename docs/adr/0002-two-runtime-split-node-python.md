# ADR-0002: Node/Express control plane + Python AI service
- Status: proposed
## Decision
Express (TS) owns auth, tenancy, CRUD, billing, exports, SSE. Python owns interview, research pipeline, evidence, copilot, radar. They communicate via HTTP (sync, small) and Redis jobs (async, long-running); both read/write Postgres.
## Consequences
Play to each team's strengths; needs contract discipline and a single migration source (db/migrations).
