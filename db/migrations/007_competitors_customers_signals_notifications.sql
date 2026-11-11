-- Migration 007: competitors, customer segments, signals, notifications and
-- workspace-scoped research-run state.
--
-- Idempotent: tables, columns and indexes use IF NOT EXISTS; RLS policies are
-- created conditionally because PostgreSQL has no CREATE POLICY IF NOT EXISTS.

-- Composite unique indexes support tenant-consistent foreign keys. The primary
-- keys remain the canonical identifiers; these indexes qualify them by tenant.
create unique index if not exists ideas_workspace_id_id_uidx
  on ideas (workspace_id, id);
create unique index if not exists research_runs_workspace_id_id_uidx
  on research_runs (workspace_id, id);

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  idea_id uuid not null,
  name text not null,
  website text,
  kind text not null default 'direct',
  description text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitors_workspace_idea_fkey
    foreign key (workspace_id, idea_id)
    references ideas (workspace_id, id) on delete cascade
);

create table if not exists customer_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  idea_id uuid not null,
  name text not null,
  description text,
  industry text,
  company_size text,
  buyer_persona text,
  user_persona text,
  jobs_to_be_done jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_segments_workspace_idea_fkey
    foreign key (workspace_id, idea_id)
    references ideas (workspace_id, id) on delete cascade
);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  idea_id uuid not null,
  run_id uuid,
  source_id uuid references sources(id) on delete set null,
  signal_type text not null,
  title text not null,
  description text not null,
  strength text not null default 'medium',
  observed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint signals_workspace_idea_fkey
    foreign key (workspace_id, idea_id)
    references ideas (workspace_id, id) on delete cascade,
  constraint signals_workspace_run_fkey
    foreign key (workspace_id, run_id)
    references research_runs (workspace_id, id)
    on delete set null (run_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_workspace_user_fkey
    foreign key (workspace_id, user_id)
    references workspace_members (workspace_id, user_id) on delete cascade
);

alter table research_runs
  add column if not exists last_completed_stage text;

alter table research_runs
  add column if not exists cancel_requested_at timestamptz;

-- Competitor lists per idea and workspace-scoped access.
create index if not exists competitors_idea_id_created_at_idx
  on competitors (idea_id, created_at desc);
create index if not exists competitors_workspace_id_idx
  on competitors (workspace_id);

-- Customer segment lists per idea and workspace-scoped access.
create index if not exists customer_segments_idea_id_created_at_idx
  on customer_segments (idea_id, created_at desc);
create index if not exists customer_segments_workspace_id_idx
  on customer_segments (workspace_id);

-- Signal feeds per idea, run traceability, type filtering and workspace access.
create index if not exists signals_idea_id_created_at_idx
  on signals (idea_id, created_at desc);
create index if not exists signals_run_id_idx
  on signals (run_id);
create index if not exists signals_workspace_id_idx
  on signals (workspace_id);
create index if not exists signals_type_created_at_idx
  on signals (signal_type, created_at desc);

-- User notification inboxes and workspace notification feeds.
create index if not exists notifications_user_id_read_at_created_at_idx
  on notifications (user_id, read_at, created_at desc);
create index if not exists notifications_workspace_id_created_at_idx
  on notifications (workspace_id, created_at desc);

-- Workspace-level research-run listings; the existing idea index remains in place.
create index if not exists research_runs_workspace_id_created_at_idx
  on research_runs (workspace_id, created_at desc);

-- Upgrade a database where an earlier, pre-integrity version of this
-- migration created the tables with single-column foreign keys.
alter table competitors drop constraint if exists competitors_workspace_id_fkey;
alter table competitors drop constraint if exists competitors_idea_id_fkey;
alter table customer_segments drop constraint if exists customer_segments_workspace_id_fkey;
alter table customer_segments drop constraint if exists customer_segments_idea_id_fkey;
alter table signals drop constraint if exists signals_workspace_id_fkey;
alter table signals drop constraint if exists signals_idea_id_fkey;
alter table signals drop constraint if exists signals_run_id_fkey;
alter table notifications drop constraint if exists notifications_workspace_id_fkey;
alter table notifications drop constraint if exists notifications_user_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'competitors'::regclass
      and conname = 'competitors_workspace_idea_fkey'
  ) then
    alter table competitors
      add constraint competitors_workspace_idea_fkey
      foreign key (workspace_id, idea_id)
      references ideas (workspace_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'customer_segments'::regclass
      and conname = 'customer_segments_workspace_idea_fkey'
  ) then
    alter table customer_segments
      add constraint customer_segments_workspace_idea_fkey
      foreign key (workspace_id, idea_id)
      references ideas (workspace_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'signals'::regclass
      and conname = 'signals_workspace_idea_fkey'
  ) then
    alter table signals
      add constraint signals_workspace_idea_fkey
      foreign key (workspace_id, idea_id)
      references ideas (workspace_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'signals'::regclass
      and conname = 'signals_workspace_run_fkey'
  ) then
    alter table signals
      add constraint signals_workspace_run_fkey
      foreign key (workspace_id, run_id)
      references research_runs (workspace_id, id)
      on delete set null (run_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'notifications'::regclass
      and conname = 'notifications_workspace_user_fkey'
  ) then
    alter table notifications
      add constraint notifications_workspace_user_fkey
      foreign key (workspace_id, user_id)
      references workspace_members (workspace_id, user_id) on delete cascade;
  end if;
end
$$;

alter table competitors enable row level security;
alter table customer_segments enable row level security;
alter table signals enable row level security;
alter table notifications enable row level security;
alter table research_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'competitors'
      and policyname = 'workspace_isolation'
  ) then
    create policy workspace_isolation on competitors
      using (workspace_id::text = current_setting('app.workspace_id', true))
      with check (workspace_id::text = current_setting('app.workspace_id', true));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_segments'
      and policyname = 'workspace_isolation'
  ) then
    create policy workspace_isolation on customer_segments
      using (workspace_id::text = current_setting('app.workspace_id', true))
      with check (workspace_id::text = current_setting('app.workspace_id', true));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signals'
      and policyname = 'workspace_isolation'
  ) then
    create policy workspace_isolation on signals
      using (workspace_id::text = current_setting('app.workspace_id', true))
      with check (workspace_id::text = current_setting('app.workspace_id', true));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'workspace_isolation'
  ) then
    create policy workspace_isolation on notifications
      using (workspace_id::text = current_setting('app.workspace_id', true))
      with check (workspace_id::text = current_setting('app.workspace_id', true));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'research_runs'
      and policyname = 'workspace_isolation'
  ) then
    create policy workspace_isolation on research_runs
      using (workspace_id::text = current_setting('app.workspace_id', true))
      with check (workspace_id::text = current_setting('app.workspace_id', true));
  end if;
end
$$;
