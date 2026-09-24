-- Research runs, sources, evidence, claims (Bible §9-10)
create table research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  idea_id uuid not null references ideas(id) on delete cascade,
  brief_id uuid not null references research_briefs(id),
  depth text not null default 'quick',          -- quick | standard | deep
  geography text[] not null,
  state text not null default 'created',        -- see fi_ai.research.state.RunState
  budget_usd numeric(8,2),
  spent_usd numeric(8,2) not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on research_runs (idea_id, created_at desc);

create table sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  content_hash text not null,
  title text, publisher text, published_at date,
  source_type text not null,
  accessed_at timestamptz not null default now(),
  snapshot_uri text,
  unique (url, content_hash)
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references research_runs(id) on delete cascade,
  source_id uuid not null references sources(id),
  claim_text text not null,
  quote text not null,                          -- must be verbatim substring of source snapshot (enforced in extract stage)
  value numeric, unit text, entity text, observed_at date,
  stance text not null default 'supports',      -- supports | contradicts
  relevance numeric(3,2) not null default 0.7,
  kind text not null default 'fact',            -- fact | signal
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on evidence (run_id);
create index evidence_embedding_idx on evidence using ivfflat (embedding vector_cosine_ops);

create table claims (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  run_id uuid references research_runs(id),
  statement text not null,
  module text not null,                          -- market | customer | competitive | demand | pricing | gtm
  origin text not null default 'evidence',       -- evidence | founder | fi_hypothesis | inferred
  kind text not null default 'fact',             -- fact | signal
  status text not null,                          -- derived by fi_ai.evidence.status.derive_claim_status
  status_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on claims (idea_id, module);

create table claim_evidence (
  claim_id uuid not null references claims(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  primary key (claim_id, evidence_id)
);

create table claim_contradictions (
  claim_id uuid not null references claims(id) on delete cascade,
  contradicts_claim_id uuid not null references claims(id) on delete cascade,
  note text,
  primary key (claim_id, contradicts_claim_id)
);

create table insights (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  run_id uuid references research_runs(id),
  module text not null,
  summary text not null,
  cited_claim_ids uuid[] not null default '{}', -- quality-gated: must be non-empty (fi_ai.evidence.quality_gate)
  created_at timestamptz not null default now()
);
