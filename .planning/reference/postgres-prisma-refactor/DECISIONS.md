# Architecture Decisions

## Accepted decisions

### 1. Keep project as the graph aggregate root
- A project owns exactly one task graph.
- A project can have many chats.
- Tasks belong to projects, not chats.
- Messages belong to chats, not projects directly.

Reason:
- This cleanly supports "multiple chats over one graph" without duplicating task data.

### 2. Remove `task_revisions` table
- Replace it with fields on `Project`:
  - `tasksRevision`
  - `tasksUpdatedAt`

Reason:
- Revision is aggregate metadata of a project graph.
- A separate table is unnecessary overhead for a 1:1 relationship.

### 3. Do not keep permanent mutation logs in OLTP tables
- Replace `task_mutations` with `TaskChangeEvent`.
- `TaskChangeEvent` is operational, not business data.
- It must have retention, for example 14-30 days.

Reason:
- The current mutation table is useful for AI verification and debugging, but not as permanent source-of-truth history.
- Infinite growth is unjustified unless the product explicitly needs long-term audit trails.

### 4. Keep CRUD as the source of truth
- `Task`, `TaskDependency`, `Project`, `Chat`, `Message` remain canonical data.
- Change events are secondary telemetry/operational data only.

Reason:
- The current system is not event-sourced.
- For this app, CRUD with a revision counter is simpler and easier to reason about.

### 5. Support soft delete in the relational model
- `Project.deletedAt`
- `Task.deletedAt`
- `Chat.archivedAt` or `deletedAt`
- `Message.deletedAt` only if product needs message restore or moderation workflows
- `TaskDependency.deletedAt` to avoid live edges pointing into hidden tasks

Reason:
- Soft delete is a product requirement.
- If tasks are soft-deleted, dependency rows also need lifecycle handling.

### 6. Make project scoping explicit and mandatory
- `Task.projectId` is required.
- `Chat.projectId` is required.
- Drop nullable project scoping for tasks.

Reason:
- The current nullable `tasks.project_id` complicates every query and weakens integrity.
- Global tasks are not aligned with the current product direction.

### 7. Hash OTP codes
- OTP values must not be stored in plaintext.

Reason:
- Plaintext OTP storage is acceptable only for temporary local development.

### 8. Centralize Prisma access behind repositories/services
- Do not scatter direct `prisma.*` queries across the app.
- Use service methods or repositories that enforce:
  - soft delete filtering
  - project scoping
  - revision bumps
  - transactional writes

Reason:
- Prisma does not automatically enforce a global "not deleted" filter.
- Without a controlled access layer, deleted rows will leak into product behavior.

## Rejected options

### 1. Keep `task_revisions` as a separate table
Rejected because:
- it duplicates project ownership
- it adds unnecessary joins and maintenance
- the aggregate root already exists as `Project`

### 2. Keep `task_mutations` forever
Rejected because:
- growth is unbounded
- most entries have short operational value
- it mixes audit/telemetry concerns into primary application storage

### 3. Move tasks under chats
Rejected because:
- it breaks the requirement of multiple chats sharing one graph
- it would duplicate or fragment task state

### 4. Use event sourcing as the main model
Rejected for now because:
- it is a much larger architectural shift than the product currently needs
- the current app logic is CRUD-based
- restore/audit can be added later in a narrower way if needed

## Retention recommendation

For `TaskChangeEvent`:
- default retention: 30 days
- minimum practical retention: 14 days
- purge with a scheduled job

If later the product needs long-term audit:
- add a separate append-only audit stream
- do not overload the operational change-events table
