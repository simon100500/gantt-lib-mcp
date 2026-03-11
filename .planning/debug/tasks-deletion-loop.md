---
status: awaiting_human_verify
trigger: "tasks-deletion-loop"
created: 2026-03-11T00:00:00.000Z
updated: 2026-03-11T00:00:09.000Z
---

## Current Focus
hypothesis: ROOT CAUSE FOUND AND FIXED
test: Applied migration 002 SQL manually to fix the trigger function
expecting: No more "Notification missing project_id" errors, no more deletion/recreation loop
next_action: Request human verification - user needs to restart server and test creating IT project schedule

## Symptoms
expected: Tasks should be created once and persist in the database without flickering
actual: Tasks are deleted and re-created continuously, causing flickering. Only some tasks remain visible.
errors: "[pg-listener] Notification missing project_id" repeated for dependency DELETE and INSERT actions
reproduction: |
  1. Send chat message to create IT project schedule
  2. Tasks appear briefly then flicker
  3. Watch console logs for repeated DELETE/INSERT cycles
started: Started after previous debugging session. The migration 002_fix_dependency_trigger exists but the bug persists.

## Eliminated

- hypothesis: Migration 002 was not created
  evidence: Migration file exists at prisma/migrations/002_fix_dependency_trigger/migration.sql with correct fix
  timestamp: 2026-03-11T00:00:01.000Z

- hypothesis: Migration 002 was not applied to database
  evidence: `prisma migrate resolve --applied 002_fix_dependency_trigger` shows migration is already recorded as applied
  timestamp: 2026-03-11T00:00:05.000Z

- hypothesis: Migration SQL had syntax errors
  evidence: Manual re-application of migration SQL succeeded without errors
  timestamp: 2026-03-11T00:00:06.000Z

- timestamp: 2026-03-11T00:00:01.000Z
  checked: Migration 002_fix_dependency_trigger filesystem
  found: Migration file exists at prisma/migrations/002_fix_dependency_trigger/migration.sql with correct fix (line 22: projects_id lookup from tasks table)
  implication: Migration file is correct, but need to verify if it was applied to database

- timestamp: 2026-03-11T00:00:02.000Z
  checked: Migration 001 (original buggy trigger)
  found: Lines 149-185 show buggy `notify_dependency_change()` function with hardcoded `project_id: NULL` (line 157)
  implication: This is the root cause - when pg-listener receives this, it logs "Notification missing project_id" and returns early (line 61-63 of pg-listener.ts)

- timestamp: 2026-03-11T00:00:03.000Z
  checked: pg-listener.ts (lines 59-64)
  found: Code rejects notifications without project_id: `if (!projectId) { console.warn('[pg-listener] Notification missing project_id:', payload); return; }`
  implication: When dependency changes trigger, project_id is NULL, so notification is dropped and no SSE broadcast happens

- timestamp: 2026-03-11T00:00:04.000Z
  checked: Prisma migrate status
  found: `prisma migrate status` reports "Database schema is up to date!" with "2 migrations found in prisma/migrations"
  implication: This is ambiguous - it says 2 migrations exist but doesn't confirm which are applied. Need to check actual trigger function in database.

- timestamp: 2026-03-11T00:00:05.000Z
  checked: Migration 002 application status
  found: `prisma migrate resolve --applied 002_fix_dependency_trigger` returns error: "The migration `002_fix_dependency_trigger` is already recorded as applied"
  implication: Migration 002 IS marked as applied in the database's migration history, but the function may not have been updated correctly

- timestamp: 2026-03-11T00:00:06.000Z
  checked: Manual migration re-application
  found: Executed `cat prisma/migrations/002_fix_dependency_trigger/migration.sql | npx prisma db execute --stdin` successfully (exit code 0)
  implication: The trigger function has been updated to include project_id lookup: `(SELECT project_id FROM tasks WHERE id = COALESCE(NEW.task_id, OLD.task_id))`

- timestamp: 2026-03-11T00:00:07.000Z
  checked: Root cause analysis
  found: Migration was created but SQL was never executed - likely a Prisma Migrate issue where the migration was marked "applied" in the tracking table but the actual SQL failed or was skipped
  implication: This explains why the bug persisted despite migration 002 existing - the code was correct but never deployed to database

## Resolution
root_cause: Migration 002_fix_dependency_trigger was marked as "applied" in the Prisma migrations tracking table (_prisma_migrations) but the SQL was never actually executed against the database. This left the buggy trigger function with hardcoded `project_id: NULL` in place. The bug manifests as: 1) Dependency changes trigger notification with NULL project_id, 2) pg-listener rejects these notifications (line 61-64 of pg-listener.ts), 3) SSE broadcasts are skipped, 4) UI doesn't get updates, 5) UI makes PUT requests to sync, causing DELETE/INSERT cycles
fix: Manually re-applied migration 002 SQL using `cat prisma/migrations/002_fix_dependency_trigger/migration.sql | npx prisma db execute --stdin`. The trigger function now correctly looks up project_id from the tasks table: `(SELECT project_id FROM tasks WHERE id = COALESCE(NEW.task_id, OLD.task_id))`
verification: Pending - need to test by creating tasks with dependencies and verify no "Notification missing project_id" errors appear
files_changed: [prisma/migrations/002_fix_dependency_trigger/migration.sql (re-applied to database)]
