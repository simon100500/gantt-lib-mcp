# Phase 19: Task Hierarchy - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** MCP Refactoring Plan Phase 3

<domain>
## Phase Boundary

Give the agent the ability to work with nested tasks via `parentId` in MCP tools. Services already support `parentId` — this phase only exposes it through the MCP API and adds filtering.

**Already complete (from prior phases):**
- `create_task` accepts `parentId?: string` in schema
- `update_task` accepts `parentId?: string | null` in schema
- TaskService validates parent exists and prevents self-parent
- TaskService automatically recalculates parent dates from children range

**What this phase adds:**
- `get_tasks` filter by `parentId?: string | null`
- Circular hierarchy validation (prevent task from becoming its own ancestor)

</domain>

<decisions>
## Implementation Decisions

### get_tasks parentId Filter (LOCKED — from refactoring plan)

**Parameter behavior:**
- `parentId: null` — return only root tasks (tasks without a parent)
- `parentId: "task-id"` — return only direct children of that parent
- `parentId` not provided — return all tasks (current behavior)

**Schema addition to `get_tasks`:**
```typescript
parentId: {
  type: 'string',
  description: 'Optional parent task ID to filter by. null = root tasks only, string = direct children of parent, omitted = all tasks.',
}
```

**Service layer changes:**
- `TaskService.list()` already accepts `projectId`
- Add new optional parameter `parentId?: string | null`
- Prisma query: `where: { projectId, parentId: parentIdFilter }`
- When `parentId === null`, filter for `parentId: { equals: null }` (Prisma null handling)

### Circular Hierarchy Validation (LOCKED — from refactoring plan)

**Prevent:** A task cannot become its own ancestor through `parentId` assignment.

**Validation approach:**
1. When `parentId` is set in `create_task` or `update_task`
2. Walk up the ancestor chain from the proposed parent
3. If we encounter the task being updated → circular hierarchy → error

**Error message format:**
```
Circular hierarchy detected: task '{childName}' cannot be a child of '{parentName}' because '{parentName}' is already a descendant of '{childName}'.
```

**Implementation location:**
- Add helper method `TaskService.detectCircularHierarchy(childId: string, proposedParentId: string): Promise<boolean>`
- Call in `create()` before transaction
- Call in `update()` before transaction

### Claude's Discretion
- Implementation details of the ancestor traversal (recursive vs iterative)
- Performance optimization for deep hierarchies (depth limit, caching)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Specification
- `.planning/reference/MCP-reafctoring-plan.md` — Phase 3 (Иерархия задач) — complete specification with examples

### Requirements
- `.planning/REQUIREMENTS.md` — HIER-01, HIER-02, HIER-03 (task hierarchy support)

### Implementation Files
- `packages/mcp/src/index.ts` — MCP tool schemas and handlers (get_tasks needs parentId filter)
- `packages/mcp/src/services/task.service.ts` — TaskService with existing parentId support
- `packages/mcp/src/types.ts` — Task, CreateTaskInput, UpdateTaskInput types (already have parentId)

### Verification
- `.planning/reference/MCP-reafctoring-plan.md` — Section "Верификация" → "Phase 3"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/src/index.ts` lines 76-138 — `create_task` already has `parentId` in schema
- `packages/mcp/src/index.ts` lines 188-250 — `update_task` already has `parentId` in schema
- `packages/mcp/src/index.ts` lines 141-166 — `get_tasks` needs `parentId` filter added
- `packages/mcp/src/services/task.service.ts` lines 140-150 — Parent validation already exists
- `packages/mcp/src/services/task.service.ts` lines 333-344 — Update parent validation already exists
- `packages/mcp/src/services/task.service.ts` lines 19-36 — `computeParentDates()` for automatic recalculation

### Established Patterns
- MCP tools use `inputSchema.properties` for parameters
- Prisma queries use `where: { field: value }` pattern
- Null handling in Prisma: `{ equals: null }` for filtering null values
- Transactional updates in TaskService using `$transaction`

### Integration Points
- `packages/mcp/src/index.ts` — Add `parentId` property to `get_tasks` inputSchema
- `packages/mcp/src/index.ts` — Pass `parentId` parameter to `taskService.list()`
- `packages/mcp/src/services/task.service.ts` — Add `parentId` parameter to `list()` method
- `packages/mcp/src/services/task.service.ts` — Add `detectCircularHierarchy()` helper method

### Current State
```typescript
// get_tasks сейчас (lines 141-166)
{
  name: 'get_tasks',
  description: 'Get a list of Gantt chart tasks...',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {...},
      limit: {...},
      offset: {...},
      full: {...},
      // ← добавить parentId сюда
    },
  },
}

// TaskService.list() сейчас (lines 215-227)
async list(
  projectId?: string,
  limit: number = 100,
  offset: number = 0,
  full: boolean = false
): Promise<{ tasks: Task[]; hasMore: boolean; total: number }> {
  // ← добавить parentId?: string | null параметр
  // ← добавить parentId в Prisma where clause
}
```

</code_context>

<specifics>
## Specific Ideas

**From refactoring plan — exact behaviors:**

### 3.3 `get_tasks` — фильтр по `parentId?: string | null`
- `null` = только корневые задачи (без родителя)
- `"id"` = только прямые дети конкретного родителя
- Не передан = все задачи (текущее поведение)

### Verification test case (from refactoring plan):
"Создать задачу с `parentId` → родитель получает правильные даты. Фильтр `parentId=null` → только корневые."

</specifics>

<deferred>
## Deferred Ideas

None — Phase 19 is fully specified by the MCP refactoring plan. All decisions are locked.

</deferred>

---

*Phase: 19-task-hierarchy*
*Context gathered: 2026-03-18 from MCP Refactoring Plan Phase 3*
