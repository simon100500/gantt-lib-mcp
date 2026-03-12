# PostgreSQL + Prisma Migration Plan

## Goal

Replace the current SQLite + raw SQL persistence layer with PostgreSQL + Prisma, while also introducing:
- multiple chats per project
- soft delete for projects and tasks
- project-level task revision tracking
- short-lived operational change events instead of permanent mutation logging

## Scope summary

In scope:
- new relational schema in PostgreSQL
- Prisma schema and migrations
- repository/service layer
- migration from project-scoped messages to chat-scoped messages
- soft delete semantics
- agent verification refactor

Out of scope for this migration:
- collaborative multi-user project membership
- full audit/replay history
- undo/redo
- event sourcing

## Current pain points to eliminate

- raw SQL is spread across the codebase
- `task_revisions` is a separate table despite being project metadata
- `task_mutations` grows forever without a retention model
- `messages` are project-scoped, which blocks multiple chats per graph
- nullable `tasks.project_id` weakens integrity and complicates queries
- soft delete is absent
- some referential constraints are incomplete

## Target end state

- PostgreSQL is the only primary database
- Prisma is the only data access mechanism for app code
- every task belongs to a project
- every message belongs to a chat
- project graph version lives on `Project.tasksRevision`
- task change events are retained temporarily
- reads exclude soft-deleted records by default

## Proposed execution phases

### Phase 1. Prepare schema and infrastructure
Deliverables:
- add Prisma to the repo
- add PostgreSQL connection configuration
- create initial `schema.prisma`
- create first Prisma migration

Tasks:
- add `prisma` and `@prisma/client`
- create `prisma/schema.prisma`
- define local/dev/prod `DATABASE_URL`
- decide whether server and MCP share the same Prisma client package or one package owns it

Exit criteria:
- `prisma migrate dev` creates the target schema on PostgreSQL
- generated client is usable from Node services

### Phase 2. Introduce new domain model
Deliverables:
- tables/models for `Project`, `Chat`, `Message`, `Task`, `TaskDependency`, `TaskChangeEvent`
- revision fields on `Project`
- soft delete fields

Tasks:
- implement target schema from `TARGET-SCHEMA.prisma`
- ensure all main FKs and indexes exist
- add retention-ready `TaskChangeEvent`

Exit criteria:
- schema supports one project with multiple chats
- soft delete columns exist and are indexed where needed

### Phase 3. Build repository/service layer
Deliverables:
- Prisma-backed repositories/services
- no direct raw SQL in new code paths

Tasks:
- `ProjectService`
- `ChatService`
- `MessageService`
- `TaskService`
- `AuthService`
- transactional helpers for graph mutations

Important rules:
- all task write operations must run in transactions
- all task write operations must bump `Project.tasksRevision`
- reads must filter soft-deleted entities by default

Exit criteria:
- all CRUD behavior can be executed through Prisma services

### Phase 4. Refactor chat model
Deliverables:
- messages now belong to chats
- server agent runs in `projectId + chatId` context

Tasks:
- create chat on first conversation if needed
- migrate existing project-level messages into a default chat per project
- update API and WebSocket payloads to include chat identity
- update UI state shape to support chat switching

Exit criteria:
- one project can contain multiple independent chat histories
- all chats operate on the same project graph

### Phase 5. Refactor task graph logic
Deliverables:
- Prisma-backed graph CRUD
- dependency lifecycle compatible with soft delete

Tasks:
- make `Task.projectId` required
- rewrite task listing and graph snapshot queries in Prisma
- rewrite create/update/delete/import flows
- on task soft delete:
  - either soft delete its dependency rows
  - or recompute effective dependency visibility so deleted tasks do not participate in scheduling

Recommended implementation:
- soft delete matching dependency rows explicitly for clarity

Exit criteria:
- scheduler never sees soft-deleted tasks or deleted edges in normal flows

### Phase 6. Replace revision and mutation tracking
Deliverables:
- remove `task_revisions`
- replace `task_mutations` with short-lived `TaskChangeEvent`

Tasks:
- add `tasksRevision` and `tasksUpdatedAt` to `Project`
- update all task write paths to increment revision atomically
- keep `TaskChangeEvent` only for operational verification and diagnostics
- add purge job for old change events

Exit criteria:
- task version checks work using `Project.tasksRevision`
- change-event retention is enforced

### Phase 7. Refactor agent verification
Deliverables:
- agent no longer depends on legacy tables

Tasks:
- replace `getTaskRevision(projectId)` implementation with `Project.tasksRevision`
- replace legacy mutation lookup with `TaskChangeEvent`
- verify:
  - task graph actually changed
  - revision moved forward
  - no external change event conflicted during the attempt

Exit criteria:
- AI mutation verification works against the new schema

### Phase 8. Data migration
Deliverables:
- one-time migration scripts from SQLite to PostgreSQL

Migration order:
1. users
2. projects
3. create default chat per project
4. messages into default chat
5. sessions
6. share links
7. tasks
8. task dependencies
9. optional carry-over of recent mutation data only if still needed

Notes:
- do not migrate `task_revisions`; derive from project state or initialize to `0`
- do not migrate unbounded historical mutations unless there is a real need
- convert plaintext OTP storage to the new model, or choose not to migrate stale OTP rows at all

Exit criteria:
- PostgreSQL contains all live production data
- old SQLite is needed only for rollback window

### Phase 9. Cutover
Deliverables:
- production app reads/writes PostgreSQL only
- raw SQL legacy paths are removed or disabled

Tasks:
- enable Prisma-backed implementation behind a feature flag first
- test read parity and write parity in staging
- perform cutover
- freeze old SQLite writes
- remove legacy bootstrap and SQL schema init after stabilization

Exit criteria:
- no runtime dependency on SQLite remains in main flows

## Recommended file-level worklist

### New files/modules
- `prisma/schema.prisma`
- Prisma migration files
- `packages/server/src/db/prisma.ts`
- `packages/server/src/services/*.ts`
- `packages/mcp/src/services/*.ts` or shared package if service ownership is centralized
- migration script for SQLite -> PostgreSQL
- retention/purge job for `TaskChangeEvent`

### Legacy modules to replace gradually
- `packages/mcp/src/db.ts`
- `packages/mcp/src/store.ts`
- `packages/mcp/src/auth-store.ts`
- `packages/server/src/agent.ts`

## Risk controls

### 1. Do not combine schema redesign and product behavior rewrites in one step
- First establish schema and repositories.
- Then move chat model.
- Then cut over task writes.

### 2. Use transactional graph writes
- create/update/delete/import of tasks and dependencies must be atomic

### 3. Enforce soft delete rules centrally
- never rely on developers remembering `where: { deletedAt: null }` everywhere manually

### 4. Keep a migration fallback window
- preserve old SQLite DB until the PostgreSQL cutover is verified

### 5. Add parity tests before cutover
- task CRUD
- dependency CRUD
- scheduler recalculation
- login/session flow
- project switching
- AI chat context and mutation verification

## Suggested implementation order for fastest value

1. Prisma schema
2. PostgreSQL bootstrapping
3. repositories/services
4. project + chat model
5. task model + dependencies
6. revision/change events
7. agent verification refactor
8. migration script
9. cutover

## Deletions after successful migration

Remove:
- legacy SQL schema bootstrap in current SQLite init
- `task_revisions` table and all callers
- old `task_mutations` table and callers
- raw SQL auth/task stores

Keep only if still required during transition:
- SQLite migration/export helpers
