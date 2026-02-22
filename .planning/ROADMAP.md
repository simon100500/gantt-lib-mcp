# ROADMAP: gantt-lib MCP Server

**Created:** 2026-02-23
**Depth:** Quick
**Phases:** 4
**Coverage:** 17/17 v1 requirements

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Server Foundation | 1/1 | Complete | 01-01 |
| 2. Task CRUD + Data Model | 1/1 | Complete | 02-01 |
| 3. Auto-schedule Engine | 0/1 | Not started | - |
| 4. Testing & Validation | 0/1 | Not started | - |

## Phases

- [x] **Phase 1: MCP Server Foundation** - Initialize TypeScript MCP server with stdio transport
- [x] **Phase 2: Task CRUD + Data Model** - Complete task management with gantt-lib compatible types
- [ ] **Phase 3: Auto-schedule Engine** - Cascading date recalculation with dependency validation
- [ ] **Phase 4: Testing & Validation** - Claude Code CLI integration verification

## Phase Details

### Phase 1: MCP Server Foundation

**Goal:** Working MCP server that can receive and respond to tool calls via stdio

**Depends on:** Nothing (first phase)

**Requirements:** MCP-01, MCP-02, MCP-03

**Success Criteria** (what must be TRUE):
1. Server starts without errors via stdio transport
2. Server registers at least one tool visible to MCP client
3. Server responds to tool calls with proper MCP response format

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Initialize TypeScript project with MCP SDK and stdio transport (Complete)

---

### Phase 2: Task CRUD + Data Model

**Goal:** Users can create, read, update, and delete tasks with gantt-lib compatible types

**Depends on:** Phase 1

**Requirements:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, DATA-01, DATA-02, DATA-03

**Success Criteria** (what must be TRUE):
1. User can create a task with name, startDate, endDate via MCP tool
2. User can create a task with dependencies array via MCP tool
3. User can retrieve list of all tasks via MCP tool
4. User can retrieve single task by ID via MCP tool
5. User can update task properties (dates, name, color) via MCP tool
6. User can delete task by ID via MCP tool
7. Task type structure matches gantt-lib (id, name, startDate, endDate, color, progress, dependencies)
8. TaskDependency type structure matches gantt-lib (taskId, type, lag)
9. Dates are stored and returned as ISO string format ('YYYY-MM-DD')

**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Implement task CRUD with gantt-lib compatible types and in-memory storage (Complete)

---

### Phase 3: Auto-schedule Engine

**Goal:** Task date changes automatically recalculate dependent tasks with validation

**Depends on:** Phase 2

**Requirements:** SCHED-01, SCHED-02, SCHED-03, SCHED-04

**Success Criteria** (what must be TRUE):
1. When a task's dates change, all dependent tasks recalculate automatically
2. All four dependency types work correctly: FS, SS, FF, SF
3. Creating circular dependencies is rejected with clear error message
4. Referencing non-existent task ID in dependency is rejected with clear error message

**Plans:** TBD

---

### Phase 4: Testing & Validation

**Goal:** Server works end-to-end with Claude Code CLI

**Depends on:** Phase 3

**Requirements:** TEST-01, TEST-02

**Success Criteria** (what must be TRUE):
1. Claude Code CLI can connect to server via stdio transport
2. Each tool can be invoked from Claude Code CLI with example usage

**Plans:** TBD

---

## Dependency Graph

```
Phase 1 (MCP Foundation)
    |
    v
Phase 2 (Task CRUD + Data Model)
    |
    v
Phase 3 (Auto-schedule Engine)
    |
    v
Phase 4 (Testing & Validation)
```

## Coverage

**v1 Requirements:** 17 total
**Mapped to phases:** 17 (100%)

| Category | Requirements | Phase |
|----------|--------------|-------|
| MCP Core | MCP-01, MCP-02, MCP-03 | 1 |
| Task Management | TASK-01 through TASK-06 | 2 |
| Data Model | DATA-01, DATA-02, DATA-03 | 2 |
| Auto-schedule | SCHED-01, SCHED-02, SCHED-03, SCHED-04 | 3 |
| Testing | TEST-01, TEST-02 | 4 |

**No orphaned requirements.**
**No duplicates.**

---
*Roadmap created: 2026-02-23*
