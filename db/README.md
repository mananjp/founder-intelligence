# Database migrations

Plain numbered SQL, applied in order (`make migrate`). This is the single source of truth for the
schema — both the Node API and the Python AI service read/write these same tables (ADR-0003).
Naming: `NNN_description.sql`. Never edit an already-merged migration; add a new one.
