# ADR-0003: Plain SQL migrations are the schema source of truth

- Status: proposed

## Decision

`db/migrations/*.sql` (Supabase CLI compatible). Node uses a typed query builder; Python uses SQLAlchemy Core. No ORM-owned migrations.
