-- Cost accounting + tracing (Bible §31 model router, §41 research cost per project)
create table llm_calls (
  id bigint generated always as identity primary key,
  run_id uuid references research_runs(id) on delete set null,
  task text not null,
  model text not null,
  input_tokens int, output_tokens int,
  cost_usd numeric(10,4),
  latency_ms int,
  status text not null default 'ok',              -- ok|error|timeout
  created_at timestamptz not null default now()
);
create index on llm_calls (run_id);
