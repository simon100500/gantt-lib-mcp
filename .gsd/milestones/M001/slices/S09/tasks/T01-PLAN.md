# T01: 09-session-control 01

**Slice:** S09 — **Milestone:** M001

## Description

Wipe the existing SQLite schema and replace it with the multi-user schema. Add users, projects, sessions, and otp_codes tables. Add project_id column to tasks and messages tables. Add corresponding TypeScript types to types.ts.

Purpose: Every downstream plan depends on this schema. Doing it first in Wave 1 means Plans 02 and 03 can run in parallel against a known schema.

Output: Updated db.ts with full schema, updated types.ts with auth-related interfaces.

## Must-Haves

- [ ] "Database schema has users, projects, sessions tables"
- [ ] "tasks table has project_id column (TEXT, nullable for migration)"
- [ ] "messages table has project_id column (TEXT, nullable for migration)"
- [ ] "Existing data is wiped — clean start with new schema"
- [ ] "DB initialization runs without errors on server start"

## Files

- `packages/mcp/src/db.ts`
- `packages/mcp/src/types.ts`
