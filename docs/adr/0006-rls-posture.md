# ADR-0006: Row-Level Security (RLS) Posture & Defense-In-Depth

- Status: Accepted
- Deciders: Core Backend Squad, Platform/Security Squad
- Date: 2026-10-21

## Context

In multi-tenant SaaS platforms, cross-workspace data leakage is a critical vulnerability.
Founder Intelligence supports multiple workspaces with owners, admins, members, and viewers.
Migration `001_core.sql` enabled Row-Level Security on `workspaces` and `ideas`, establishing a `workspace_isolation` policy that filters rows using `current_setting('app.workspace_id', true)`.

However, application queries running over standard pool connections may connect as a superuser or table-owning database role (e.g. `fi`), which by default can bypass RLS unless explicitly constrained or scoped.

## Decision

We adopt a two-tier defense-in-depth security model:

1. **Primary Layer — Application Authorization**:
   - Every workspace route requires `requireWorkspace` and (where applicable) `requireRole(...)`.
   - All database SQL queries must explicitly include `WHERE workspace_id = $1` in their WHERE clauses.
   - Application logic never relies solely on database RLS to prevent unauthorized access.

2. **Secondary Layer — Database Defense-In-Depth (RLS)**:
   - For sensitive workspace-scoped transactions, the backend provides the `withWorkspace(workspaceId, fn)` helper.
   - `withWorkspace` executes inside an isolated transaction and sets `app.workspace_id` via `SELECT set_config('app.workspace_id', $1, true)`.
   - In production environments, app connection pools connect using an unprivileged application role (`fi_app`) that has `NOBYPASSRLS`.
   - Future migrations (Sprint 2+) will enforce RLS policies across all child tables referencing `workspace_id`.

## Consequences

- Prevents catastrophic data leaks even if an API route handler inadvertently omits a workspace filter.
- Clean separation between tenant isolation (RLS tenant boundary) and RBAC roles (application middleware hierarchy: `owner > admin > member > viewer`).
- Requires all multi-tenant queries to coordinate workspace context via `withWorkspace` or explicit parameters.
