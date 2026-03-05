---
phase: 09-session-control
plan: 01
subsystem: database-schema
tags: [database, sqlite, multi-user, typescript, types]
wave: 1
dependency_graph:
  requires: []
  provides:
    - id: "09-01"
      subsystem: "database-schema"
      description: "Multi-user SQLite schema with users, projects, sessions, and OTP support"
    - id: "09-01"
      subsystem: "types"
      description: "TypeScript types for auth: User, Project, Session, OtpEntry, AuthToken"
  affects:
    - subsystem: "store"
      description: "Store layer will use new tables for data persistence"
    - subsystem: "auth"
      description: "Plans 02-05 will build on this schema for authentication"
tech_stack:
  added:
    - "@libsql/client (existing)"
  patterns:
    - "SQLite FK constraints for referential integrity"
    - "CASCADE delete for data cleanup"
    - "TEXT columns for ISO date storage"
    - "Singleton DB client pattern"
key_files:
  created: []
  modified:
    - path: "packages/mcp/src/db.ts"
      description: "Multi-user schema with 7 tables (users, projects, sessions, otp_codes, tasks, dependencies, messages)"
    - path: "packages/mcp/src/types.ts"
      description: "Added User, Project, Session, OtpEntry, AuthToken types; Message.projectId field"
decisions:
  - "Drop all tables on every getDb() call during Phase 9 development (WIPE decision)"
  - "Use TEXT for IDs and dates (ISO format YYYY-MM-DD)"
  - "FK constraints with CASCADE delete for automatic cleanup"
  - "project_id nullable in tasks/messages for migration compatibility"
metrics:
  duration: "85s"
  completed_date: "2026-03-05T14:12:37Z"
  total_tasks: 2
  completed_tasks: 2
  total_files: 2
  modified_files: 2
  created_files: 0
---

# Phase 09 Plan 01: Multi-User Database Schema Summary

**One-liner:** SQLite multi-user schema with 7 tables (users, projects, sessions, otp_codes, tasks, dependencies, messages) using FK constraints and CASCADE deletes.

## Objective

Replace the single-user in-memory schema with a multi-user SQLite schema that supports authentication, project isolation, and session management. This foundational work enables all downstream plans (02-06) to build on top of a known database structure.

## Artifacts Created

### Database Schema (`packages/mcp/src/db.ts`)
- 7 tables created in FK-safe order: users, projects, sessions, otp_codes, tasks, dependencies, messages
- Foreign key constraints with CASCADE delete for automatic cleanup
- DROP TABLE IF EXISTS statements for clean slate during Phase 9 development

### TypeScript Types (`packages/mcp/src/types.ts`)
- New interfaces: `User`, `Project`, `Session`, `OtpEntry`, `AuthToken`
- Enhanced `Message` interface with optional `projectId` field
- All types exported from `@gantt/mcp/types`

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Authentication Gates

None - no authentication required for database schema changes.

## Technical Details

### Foreign Key Relationships
```
users (parent)
  └─> projects.user_id (CASCADE)
       └─> sessions.project_id (CASCADE)
       └─> tasks.project_id (CASCADE)
       └─> messages.project_id (CASCADE)

tasks (parent)
  └─> dependencies.task_id (CASCADE)
```

### Key Schema Decisions
- **TEXT for IDs:** Simple string IDs (UUID-friendly)
- **TEXT for dates:** ISO format YYYY-MM-DD per existing convention
- **CASCADE delete:** Removing a user removes all their projects, sessions, and tasks
- **project_id nullable:** Allows migration path from single-user data

## Verification Results

- [x] `sqlite3 gantt.db ".tables"` shows all 7 tables
- [x] `PRAGMA table_info(tasks)` confirms `project_id TEXT` column exists
- [x] `npx tsc --project packages/mcp/tsconfig.json --noEmit` passes
- [x] `npx tsc --project packages/server/tsconfig.json --noEmit` passes
- [x] `getDb()` executes without errors
- [x] All new types exported from `@gantt/mcp/types`

## Commits

- `f317f34`: feat(09-01): rewrite db.ts with multi-user schema
- `985d860`: feat(09-01): add auth types to types.ts

## Next Steps

Plan 02 (OTP Service) can now use the `otp_codes` table for authentication. Plan 03 (User Store) will use the `users` table. Plans 04-06 will build the complete authentication flow on top of this foundation.
