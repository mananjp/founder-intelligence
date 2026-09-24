-- Continuous radar, reports, billing (Bible §24-25, §36)
create table watch_items (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  kind text not null,                             -- competitor|customer|demand|technology|regulatory|funding|category
  target text not null,                           -- URL, entity name or query
  frequency_hours int not null default 168,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  watch_item_id uuid references watch_items(id),
  what_changed text not null,
  why_it_matters text not null,
  suggested_action text not null,
  cited_claim_ids uuid[] not null default '{}',
  severity text not null default 'info',          -- info|notable|significant
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  run_id uuid references research_runs(id),
  kind text not null default 'standard',          -- quick_brief|standard|deep_dossier|investor
  sections jsonb not null,
  export_uri text,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table subscriptions (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  provider text,                                   -- stripe
  provider_customer_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table activity_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  entity_type text, entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
