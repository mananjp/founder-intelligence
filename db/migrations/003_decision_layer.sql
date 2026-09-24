-- Opportunity score, assumptions, experiments, decisions, recommendations (Bible §18-20)
create table opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  run_id uuid references research_runs(id),
  dimension_scores jsonb not null,               -- {problem_severity: {score, evidence_coverage, citations:[...]}, ...}
  overall_score numeric(3,1) not null,
  evidence_coverage numeric(4,3) not null,        -- e.g. 0.62  -> shown as "62% evidence coverage"
  scoring_model_version text not null,
  created_at timestamptz not null default now()
);

create table assumptions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  type text not null,                             -- customer|problem|behavior|value|wtp|distribution|differentiation|retention|execution
  statement text not null,
  importance text not null default 'medium',      -- low | medium | high | critical
  status text not null default 'unverified',      -- unverified|testing|supported|weakened|rejected|accepted
  linked_claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  assumption_id uuid references assumptions(id),
  method text not null,                           -- interviews|landing_page|waitlist|price_test|concierge|prototype|switch_test|channel_test|preorder
  hypothesis text not null,
  expected_learning numeric(3,2), decision_impact numeric(3,2), cost_time numeric(6,2),
  priority_score numeric(6,3),                    -- expected_learning * decision_impact / cost_time (packages/scoring)
  status text not null default 'proposed',        -- proposed|running|completed|abandoned
  result text,
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  run_id uuid references research_runs(id),
  action text not null,
  rationale text not null,
  cited_claim_ids uuid[] not null default '{}',
  linked_assumption_ids uuid[] not null default '{}',
  confidence numeric(3,2),
  created_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  recommendation_id uuid references recommendations(id),
  choice text not null,
  rationale text,
  decided_by uuid not null references users(id),
  linked_assumption_ids uuid[] not null default '{}',
  cited_claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
