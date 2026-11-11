-- Migration 008: persistent research tasks for the Scope -> Plan pipeline.
-- Additive and safe to re-apply.

create table if not exists research_tasks (
  id uuid primary key default gen_random_uuid(),

  run_id uuid not null
    references research_runs(id) on delete cascade,

  question_id text not null,
  research_question text not null,
  task_key text not null,

  task_type text not null
    check (task_type in ('search', 'fetch', 'extract')),

  query text not null,
  source_class text not null,

  priority smallint not null default 3
    check (priority between 1 and 5),

  required_source_classes text[] not null default '{}',

  budget_usd numeric(8,2) not null
    check (budget_usd > 0),

  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'completed',
      'failed',
      'skipped'
    )),

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint research_tasks_run_task_key_unique
    unique (run_id, task_key)
);

create index if not exists research_tasks_run_status_idx
  on research_tasks (run_id, status);

create index if not exists research_tasks_run_priority_idx
  on research_tasks (run_id, priority);

create index if not exists research_tasks_question_id_idx
  on research_tasks (question_id);
