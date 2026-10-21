# ADR-0005: API role enforcement and database RLS posture

- Status: proposed

## Context

Workspace membership and authorization roles are stored in `workspace_members`.
The existing roles are `owner`, `admin`, `member`, and `viewer`. API
authorization must enforce role requirements without adding a separate role
table.

## Decision

- `workspace_members.role` is the source of truth for a user's role in a
  workspace.
- `requireWorkspace` verifies membership and attaches the resolved role to the
  request. `requireRole` applies the role hierarchy `owner > admin > member >
viewer`; a route requiring a role accepts that role or a higher one.
- `PATCH /v1/workspaces/:id/members/:userId` is restricted to the current
  workspace owner and promotes an existing workspace member to `owner`.
  It does not provide arbitrary role assignment.
- API role-based access control and database row-level security are separate
  layers. The API enforces the role hierarchy; RLS is defense in depth and is
  not treated as enforcing that hierarchy.

## RLS posture

Migration `001_core.sql` enables RLS on `workspaces` and `ideas`. The visible
`ideas` policy, `workspace_isolation`, scopes rows by the
`app.workspace_id` setting, which `withWorkspace` sets for a transaction. It
provides workspace isolation, not owner/admin/member/viewer authorization. The
migration does not define a corresponding policy for `workspaces`, and the API
database connection currently uses a table-owning role, which can bypass RLS.
Accordingly, API authorization remains mandatory; database role and policy
hardening remain separate work.
