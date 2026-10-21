# Runbook: Database Backup & Point-In-Time Restore

## Overview

Founder Intelligence runs PostgreSQL 16 with `pgvector` (`pgvector/pgvector:pg16`). This runbook covers snapshot generation, logical backup (`pg_dump`), and disaster recovery restore procedures.

---

## 1. Routine Backups

### Automated Logical Backup (cron / script)
```bash
docker compose exec -T postgres pg_dump -U fi -d fi -F c -b -v -f /tmp/fi_backup_$(date +%Y%m%d_%H%M%S).dump
```

Copy the backup dump file from container to local host or off-site S3 storage:
```bash
docker compose cp postgres:/tmp/fi_backup_<timestamp>.dump ./backups/
```

---

## 2. Disaster Recovery: Full Restore Procedure

### Step 1: Drain Traffic & Put API in Maintenance Mode
To prevent writes during restoration:
```bash
docker compose stop fi-api fi-worker
```

### Step 2: Verify Target Database State
Ensure PostgreSQL container is running and reachable:
```bash
docker compose exec postgres pg_isready -U fi -d fi
```

### Step 3: Recreate Clean Database
```sql
-- Connect via psql
docker compose exec -i postgres psql -U fi -d postgres -c "DROP DATABASE IF EXISTS fi_restore_target;"
docker compose exec -i postgres psql -U fi -d postgres -c "CREATE DATABASE fi_restore_target OWNER fi;"
docker compose exec -i postgres psql -U fi -d fi_restore_target -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Step 4: Restore from Backup Dump
```bash
docker compose exec -i postgres pg_restore -U fi -d fi_restore_target -v -O < ./backups/fi_backup_<timestamp>.dump
```

### Step 5: Verify Row Counts & Indexes
Spot check key tables:
```sql
SELECT count(*) FROM workspaces;
SELECT count(*) FROM ideas;
SELECT count(*) FROM research_runs;
SELECT count(*) FROM opportunity_scores;
```
Check that indexes created in `006_indexes.sql` are valid:
```sql
SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_idx';
```

### Step 6: Atomic Swap & Service Restart
Rename databases or point `DATABASE_URL` to restored target:
```sql
ALTER DATABASE fi RENAME TO fi_old_backup;
ALTER DATABASE fi_restore_target RENAME TO fi;
```
Restart applications:
```bash
docker compose start fi-api fi-worker
curl -f http://localhost:4000/health/ready
```
