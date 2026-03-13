# Phase 16: Services Layer - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

All database operations use Prisma-backed services instead of direct SQL. Replacement of @libsql/client (SQLite) with Prisma Client for all database access through a services layer shared between packages/mcp and packages/server.

**Что входит:**
- TaskService: create, update, delete, list, get, exportTasks, importTasks, recalculateDates
- ProjectService: create, get, update, delete, list
- AuthService: OTP lifecycle, user/project/session management
- MessageService: create, list
- DependencyService: create, delete, listByTask
- Services exported from packages/mcp for packages/server to use
- All services use Prisma Client (no raw SQL)

**Не входит:**
- Интеграция с существующим кодом (Phase 17)
- Удаление SQLite кода (Phase 17)
- Деплой настройки (Phase 18)

</domain>

<decisions>
## Implementation Decisions

### Организация Services Layer
- **Services location:** `packages/mcp/src/services/` directory
- **Service pattern:** Class-based with singleton instances (matching current TaskStore/AuthStore pattern)
- **Each service:**
  - Accepts Prisma Client via constructor (injected from getPrisma())
  - Provides async CRUD methods matching current store.ts/auth-store.ts APIs
  - Returns domain types (Task, Project, User, Session, Message) from packages/mcp/src/types.ts
  - Uses Prisma-generated types internally but converts to domain types for public API

### Service API Design
- **Backward compatible:** Method signatures match current TaskStore/AuthStore where possible
- **Type safety:** Use Prisma-generated types internally, convert to domain types on return
- **Transaction support:** Use prisma.$transaction for multi-step operations (e.g., task with dependencies)
- **Error handling:** Convert Prisma errors to application errors (e.g., Prisma.PrismaClientKnownRequestError → Error)

### Prisma Client Usage
- **Singleton:** Import getPrisma() from packages/mcp/src/prisma.ts
- **Connection pooling:** Already configured in getPrisma() via DATABASE_URL
- **Graceful shutdown:** Already handled in prisma.ts (SIGTERM/beforeExit handlers)
- **Type imports:** Use generated types from `@gantt/mcp/prisma` (packages/mcp/dist/prisma-client)

### Services to Create

| Service | File | Responsibilities |
|---------|------|-------------------|
| TaskService | services/task.service.ts | Task CRUD, dependencies, mutations, revisions, import/export |
| ProjectService | services/project.service.ts | Project CRUD, list by user, task count |
| AuthService | services/auth.service.ts | OTP, users, sessions, share links |
| MessageService | services/message.service.ts | Message CRUD, list by project |
| DependencyService | services/dependency.service.ts | Dependency CRUD (delegated from TaskService) |

### TypeScript Type Mapping

| Domain Type | Prisma Model | Conversion Required |
|-------------|--------------|---------------------|
| Task | Task | startDate/endDate: DateTime → string (YYYY-MM-DD) |
| TaskDependency | Dependency | taskId: depTaskId, lag: Float |
| Project | Project | userId: String, createdAt: DateTime → string |
| User | User | createdAt: DateTime → string |
| Session | Session | All fields map directly |
| Message | Message | createdAt: DateTime → string |

### Claude's Discretion
- Exact service class structure (constructor injection vs direct getPrisma() import)
- Whether to create base service class with shared utilities
- Transaction boundary granularity (per-method vs per-operation)
- Error handling detail level (Prisma error codes vs generic errors)

</decisions>

<specifics>
## Specific Ideas

**Current SQLite implementations to replace:**

### packages/mcp/src/store.ts (TaskStore - 736 lines)
- Methods: create, update, delete, deleteAll, list, get, exportTasks, importTasks
- Helpers: loadSnapshot, runScheduler, getNextSortOrder, bumpTaskRevision, recordMutation
- Messages: addMessage, getMessages (move to MessageService)

### packages/mcp/src/auth-store.ts (AuthStore - 505 lines)
- Methods: createOtp, consumeOtp, findOrCreateUser, createDefaultProject, listProjects, createProject, findProjectById, createShareLink, findShareLinkById, updateProject, createSession, findSessionByAccessToken, findSessionByRefreshToken, updateSessionTokens, deleteSession, updateSessionProject
- Cache: sessionCache (5-minute TTL for access token lookups)

**Prisma equivalents:**

```typescript
// Task service patterns
prisma.task.create({ include: { dependencies: true } })
prisma.task.findMany({ where: { projectId }, include: { dependencies: true } })
prisma.task.update({ where: { id }, data: {...} })
prisma.task.delete({ where: { id } })
prisma.$transaction([
  prisma.task.create({...}),
  prisma.dependency.createMany({...})
])

// Project service patterns
prisma.project.findMany({
  where: { userId },
  include: { _count: { select: { tasks: true } } }
})

// Auth service patterns
prisma.otpCode.findFirst({ where: { email, code, used: false, expiresAt: { gt: now } } })
prisma.user.upsert({ where: { email }, create: {...}, update: {...} })
```

**Date conversion utilities needed:**
```typescript
// Domain types use YYYY-MM-DD strings
// Prisma uses DateTime objects
function dateToDomain(date: Date): string {
  return date.toISOString().split('T')[0];
}
function domainToDate(dateStr: string): Date {
  return new Date(dateStr);
}
```

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/src/prisma.ts`: getPrisma() singleton — use for all service initialization
- `packages/mcp/src/scheduler.ts`: TaskScheduler class — unchanged, works with in-memory snapshots
- `packages/mcp/src/types.ts`: Domain types — unchanged, services convert to/from these
- `packages/mcp/src/debug-log.ts`: writeMcpDebugLog() — unchanged, use for debugging

### Established Patterns
- **Singleton pattern:** taskStore, authStore — export singleton instances from services/*.ts
- **Async methods:** All database operations are async
- **Project filtering:** Most operations accept optional projectId parameter
- **Date format:** YYYY-MM-DD strings throughout domain layer

### Integration Points
- `packages/mcp/src/index.ts`: Exports taskStore, authStore — will export services instead
- `packages/server/src/index.ts`: Imports getDb from @gantt/mcp/db — will import services from @gantt/mcp/services
- `packages/server/src/agent.ts`: Uses taskStore indirectly — no changes needed in Phase 16

### Что менять в Phase 16
- Create packages/mcp/src/services/ directory
- Create task.service.ts, project.service.ts, auth.service.ts, message.service.ts, dependency.service.ts
- Each service uses getPrisma() for database access
- Services export singleton instances
- Add service exports to packages/mcp/package.json

### Что НЕ менять в Phase 16
- Не трогать packages/server/* (это Phase 17 — Integration)
- Не удалять store.ts и auth-store.ts (это Phase 17 — Cleanup)
- Не обновлять Dockerfile (это Phase 18 — Deployment)

</code_context>

<deferred>
## Deferred Ideas

- Database connection retry logic — не требуется для v2.0
- Query result caching — OpCache/Redis для будущих оптимизаций
- Read replica support — нет требований
- Soft delete pattern — не входит в v2.0 scope
- Audit log UI — TaskMutationEvent существует в схеме, но UI отложен

</deferred>

---

**Phase:** 16-services-layer
**Context gathered:** 2026-03-13
**Source files read:**
- packages/mcp/src/db.ts (SQLite implementation)
- packages/mcp/src/auth-store.ts (AuthStore implementation)
- packages/mcp/src/store.ts (TaskStore implementation)
- packages/mcp/src/prisma.ts (Prisma Client singleton)
- packages/mcp/prisma/schema.prisma (Database schema)
- packages/mcp/src/types.ts (Domain types)
- .planning/phases/15-prisma-setup/15-CONTEXT.md
- .planning/phases/15-prisma-setup/15-01-SUMMARY.md
- .planning/phases/15-prisma-setup/15-02-SUMMARY.md
