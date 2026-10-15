-- Migration 006: indexes for FK/query columns on 003/004 tables (Sprint 1 WS1 #5, issue #5).
--
-- Postgres indexes primary/unique keys but never foreign keys, so every FK in
-- 003_decision_layer.sql and 004_radar_reports_billing.sql previously fell back to a
-- sequential scan on joins and on ON DELETE CASCADE. Composite indexes lead with the
-- FK column and add the column used by the table's primary list/filter query.
--
-- Idempotent: create index if not exists, so this migration is safe to re-apply.
-- See docs/runbooks/db-indexes.md for the index catalog, verification and rollback.

-- opportunity_scores: latest score per idea; lookup by producing run
create index if not exists opportunity_scores_idea_id_created_at_idx
  on opportunity_scores (idea_id, created_at desc);
create index if not exists opportunity_scores_run_id_idx
  on opportunity_scores (run_id);

-- assumptions: assumption board per idea, grouped by status
create index if not exists assumptions_idea_id_status_idx
  on assumptions (idea_id, status);

-- experiments: experiment list per idea by status; lab grouped by assumption
create index if not exists experiments_idea_id_status_idx
  on experiments (idea_id, status);
create index if not exists experiments_assumption_id_idx
  on experiments (assumption_id);

-- recommendations: recommendations per idea (newest first); trace back to the run
create index if not exists recommendations_idea_id_created_at_idx
  on recommendations (idea_id, created_at desc);
create index if not exists recommendations_run_id_idx
  on recommendations (run_id);

-- decisions: decision ledger per idea (newest first); source recommendation; who decided
create index if not exists decisions_idea_id_created_at_idx
  on decisions (idea_id, created_at desc);
create index if not exists decisions_recommendation_id_idx
  on decisions (recommendation_id);
create index if not exists decisions_decided_by_idx
  on decisions (decided_by);

-- watch_items: watches per idea; radar scheduler selects items due by last_checked_at
create index if not exists watch_items_idea_id_idx
  on watch_items (idea_id);
create index if not exists watch_items_last_checked_at_idx
  on watch_items (last_checked_at);

-- alerts: alert inbox per idea (newest first); drill-down to the firing watch item
create index if not exists alerts_idea_id_created_at_idx
  on alerts (idea_id, created_at desc);
create index if not exists alerts_watch_item_id_idx
  on alerts (watch_item_id);

-- reports: reports per idea (newest first); reports produced by a research run
create index if not exists reports_idea_id_created_at_idx
  on reports (idea_id, created_at desc);
create index if not exists reports_run_id_idx
  on reports (run_id);

-- activity_log: workspace activity feed (newest first); per-user audit trail
create index if not exists activity_log_workspace_id_created_at_idx
  on activity_log (workspace_id, created_at desc);
create index if not exists activity_log_user_id_idx
  on activity_log (user_id);
