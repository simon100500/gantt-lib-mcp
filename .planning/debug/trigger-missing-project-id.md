---
status: verifying
trigger: "CRITICAL: Trigger shows project_id: null in notifications - need to check actual database trigger function"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:10:00Z
---

## Current Focus
hypothesis: Dependencies are being deleted AFTER their tasks are deleted, causing the trigger query to return NULL
test: Verify trigger function logic when task_id doesn't exist in tasks table
expecting: Query (SELECT project_id FROM tasks WHERE id = task_id) returns NULL when task doesn't exist
next_action: Fix trigger to handle missing tasks gracefully (skip notification or use COALESCE)

## Symptoms
expected: Trigger notifications should include valid project_id from the related task
actual: Notifications show "project_id: null" causing errors in the application
errors: "Notification missing project_id: { action: 'DELETE', project_id: null }"
reproduction: Delete a dependency and observe the notification payload
started: Ongoing issue - trigger appears broken since deployment

## Evidence
- timestamp: 2026-03-11T00:00:00Z
  checked: Live server logs
  found: Error log showing "Notification missing project_id: { action: 'DELETE', project_id: null }"
  implication: The trigger is firing but not including project_id in the notification

- timestamp: 2026-03-11T00:01:00Z
  checked: Local database trigger function
  found: Trigger function is CORRECT - it queries project_id from tasks table
  implication: Local database has migration 002 applied, but is empty (no tasks)

- timestamp: 2026-03-11T00:02:00Z
  checked: Local database migration status
  found: Migration '002_fix_dependency_trigger' applied at 2026-03-10T22:22:51.742Z
  implication: Local schema is up to date but has no data

- timestamp: 2026-03-11T00:03:00Z
  checked: Local database data
  found: NO tasks in database (empty result set)
  implication: The error is NOT from local database - must be from production

- timestamp: 2026-03-11T00:04:00Z
  checked: Production database
  found: Project 'c2ed8ef7-4218-47ae-b891-925157251483' exists but has 0 tasks and 0 dependencies
  implication: Database is empty - errors are from stale logs or different environment

- timestamp: 2026-03-11T00:05:00Z
  checked: pg-listener.ts source code
  found: Line 62: console.warn('[pg-listener] Notification missing project_id:', payload);
  implication: This is the EXACT error message from logs - confirms the issue

- timestamp: 2026-03-11T00:06:00Z
  checked: Trigger function logic
  found: Query (SELECT project_id FROM tasks WHERE id = task_id) returns NULL when task doesn't exist
  implication: ROOT CAUSE - Dependencies are deleted after tasks, causing NULL project_id

## Eliminated
## Resolution
root_cause: When a dependency is deleted AFTER its task is deleted (cascade), the trigger query (SELECT project_id FROM tasks WHERE id = task_id) returns NULL because the task no longer exists. This causes pg-listener to log "Notification missing project_id" warnings and skip broadcasting updates.

fix: Created migration 003_handle_orphaned_dependencies that modifies the trigger function to:
1. Check if the task exists before querying project_id
2. Skip notification if task doesn't exist (logs instead)
3. Only send notification when project_id is successfully retrieved

verification:
- Created and deployed migration 003_handle_orphaned_dependencies
- Verified trigger function updated correctly in database
- Tested normal dependency operations (INSERT/DELETE) - all send notifications with project_id
- Tested orphaned dependency scenario (task deleted, cascade deletes dependency) - notification is skipped as expected
- No more "project_id: null" warnings in logs

files_changed:
- prisma/migrations/003_handle_orphaned_dependencies/migration.sql (new)
