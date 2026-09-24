-- Core tenancy + idea model (Bible §26, §29)
create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id),
  plan text not null default 'free',           -- free | founder | pro | team | enterprise
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',         -- owner | admin | member | viewer
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by uuid not null references users(id),
  title text not null,
  raw_description text not null,
  category text,
  geography text[] not null default '{}',      -- ISO country/state codes; geography is first-class (Bible §38)
  stage text not null default 'exploring',      -- exploring | validating | building | live
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ideas (workspace_id);

-- Adaptive interview output (Bible §8)
create table research_briefs (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  version int not null default 1,
  problem text, customer text, geography text[], category text,
  alternatives text, business_model text, differentiation text,
  known_evidence jsonb not null default '[]',
  unknowns jsonb not null default '[]',
  research_questions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (idea_id, version)
);

create table interview_turns (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  turn_index int not null,
  role text not null,                           -- assistant | founder
  content text not null,
  extracted jsonb,                               -- variables this turn resolved
  created_at timestamptz not null default now()
);

alter table workspaces enable row level security;
alter table ideas enable row level security;
-- Defense in depth alongside the API's own authorization checks (see apps/api/src/lib/db.ts withWorkspace).
create policy workspace_isolation on ideas
  using (workspace_id::text = current_setting('app.workspace_id', true));
