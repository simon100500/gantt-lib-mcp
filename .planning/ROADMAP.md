# ROADMAP: gantt-lib MCP Server

**Created:** 2026-02-23
**Depth:** Quick
**Phases:** 9
**Coverage:** 17/17 v1 requirements + Web UI enhancements + Session control

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Server Foundation | 1/1 | Complete | 01-01 |
| 2. Task CRUD + Data Model | 1/1 | Complete    | 2026-02-22 |
| 3. Auto-schedule Engine | 2/2 | Complete | 03-01, 03-02 |
| 4. Testing & Validation | 1/1 | Complete | 2026-02-25 |
| 5. Batch Tasks | 1/1 | Complete | 2026-02-25 |
| 6. qwen-agent | 2/2 | Complete | 2026-03-04 |
| 7. Web UI with real-time Gantt editing | 6/6 | Complete   | 2026-03-04 |
| 8. Integrate gantt-lib library | 2/2 | Complete | 2026-03-04 |
| 9. session-control | 5/6 | Active | 09-01, 09-02, 09-03, 09-04, 09-05 |
| 10. work-stability | 2/2 | Complete    | 2026-03-07 |

## Phases

- [x] **Phase 1: MCP Server Foundation** - Initialize TypeScript MCP server with stdio transport
- [x] **Phase 2: Task CRUD + Data Model** - Complete task management with gantt-lib compatible types
- [x] **Phase 3: Auto-schedule Engine** - Cascading date recalculation with dependency validation
- [x] **Phase 4: Testing & Validation** - Claude Code CLI integration verification
- [x] **Phase 5: Batch Tasks** - Batch task creation with streams and sequential dependencies
- [x] **Phase 6: qwen-agent** - CLI agent using @qwen-code/sdk with Z.AI integration
- [x] **Phase 7: Web UI with real-time Gantt editing via AI dialogue** - React + Fastify + WebSocket + SQLite monorepo, CapRover deploy (completed 2026-03-04)
- [x] **Phase 8: Integrate gantt-lib library** - Replace placeholder Gantt component with gantt-lib React library (completed 2026-03-04)
- [ ] **Phase 9: session-control** - Multi-user OTP auth, project isolation, targeted WebSocket broadcast
- [x] **Phase 10: work-stability** - Fix 6 stability bugs: token refresh, WS reconnect, MCP project scope, streaming dedup, system prompt, chat history (completed 2026-03-07)

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

**Plans:** 1/1 plans complete

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

**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Implement auto-schedule engine with TDD (FS/SS/FF/SF dependencies, cycle detection, validation) (Complete)
- [x] 03-02-PLAN.md — Integrate scheduler into TaskStore and MCP tools for automatic recalculation (Complete)

---

### Phase 4: Testing & Validation

**Goal:** Server works end-to-end with Claude Code CLI

**Depends on:** Phase 3

**Requirements:** TEST-01, TEST-02

**Success Criteria** (what must be TRUE):
1. Claude Code CLI can connect to server via stdio transport
2. Each tool can be invoked from Claude Code CLI with example usage

**Plans:** 1/1 plans complete

Plans:
- [x] 04-01-PLAN.md — Claude Code CLI integration verification (Complete)

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
    |
    v
Phase 5 (Batch Tasks)
    |
    v
Phase 6 (qwen-agent)
    |
    v
Phase 7 (Web UI + CapRover deploy)
    |
    v
Phase 8 (Integrate gantt-lib library)
    |
    v
Phase 9 (session-control)
    |
    v
Phase 10 (work-stability)
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

### Phase 5: batch-tasks Сделать пакетное добавление работ (например, сразу на несколько этажей или секций), особенно связанных один за другим

**Goal:** Create MCP tool for batch task creation with repeat parameters and automatic sequential dependencies

**Depends on:** Phase 4

**Success Criteria** (what must be TRUE):
1. User can create multiple tasks from a single batch operation
2. Tasks are created with sequential FS dependencies within each stream
3. Task names are auto-generated from work type and repeat parameters
4. Task dates are calculated sequentially within each stream
5. Partial success returns both created and failed tasks
6. Different streams operate in parallel without dependencies

**Plans:** 1/1 plans complete

Plans:
- [x] 05-01-PLAN.md — Implement batch task creation tool with work types, repeat parameters, and streams (Complete)

### Phase 6: qwen-agent

**Goal:** TypeScript CLI agent using @qwen-code/sdk that accepts a project description and generates a Gantt schedule by calling the existing MCP server tools, writing the result to tasks.json
**Requirements:** AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Depends on:** Phase 5
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — Wave 0 scaffold: unit test stubs, system prompt, agent tsconfig (Complete)
- [x] 06-02-PLAN.md — Implement agent/agent.ts with @qwen-code/sdk + Z.AI integration (Complete)

### Phase 7: Web UI with real-time Gantt editing via AI dialogue

**Goal:** Full-stack web application — React Gantt editor with AI chat sidebar, real-time updates via WebSocket, SQLite persistence, deployable to CapRover as a single container
**Requirements:** WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06
**Depends on:** Phase 6
**Plans:** 6/6 plans complete

Plans:
- [x] 07-01-PLAN.md — Monorepo scaffold: npm workspaces with packages/mcp, packages/server, packages/web (Complete)
- [x] 07-02-PLAN.md — MCP DB migration: TaskStore to SQLite via @libsql/client (tasks, dependencies, messages tables) (Complete)
- [x] 07-03-PLAN.md — Server package: Fastify + WebSocket + agent runner with streaming (Complete)
- [x] 07-04-PLAN.md — Web package: React stub + useTasks hook (Complete)
- [x] 07-05-PLAN.md — Web package: Chat sidebar + WebSocket integration + real-time Gantt updates (Complete)
- [x] 07-06-PLAN.md — CapRover deploy: Dockerfile (multi-stage) + nginx.conf + captain-definition (Complete)

### Phase 8: Integrate gantt-lib library

**Goal:** Replace the placeholder GanttChart component with the actual gantt-lib React library, enabling interactive drag-to-edit functionality with real-time WebSocket sync

**Depends on:** Phase 7
**Requirements:** WEB-GANTT-01, WEB-GANTT-02, WEB-GANTT-03
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — Install gantt-lib package, add CSS import, replace placeholder component with gantt-lib integration
- [x] 08-02-PLAN.md — Wire onChange handler for drag-to-edit persistence, verify drag interactions and WebSocket sync

### Phase 9: session-control

**Goal:** Multi-user OTP email authentication with JWT tokens, project-scoped data isolation, and targeted WebSocket broadcast
**Requirements:** SESSION-DB-01, SESSION-DB-02, SESSION-DB-03, SESSION-AUTH-01, SESSION-AUTH-02, SESSION-AUTH-03, SESSION-AUTH-04, SESSION-STORE-01, SESSION-WS-01, SESSION-MIDDLEWARE-01, SESSION-AGENT-01, SESSION-UI-01, SESSION-UI-02, SESSION-UI-03
**Depends on:** Phase 8
**Plans:** 6 plans

Plans:
- [x] 09-01-PLAN.md — DB schema migration: users, projects, sessions, otp_codes tables + project_id on tasks/messages (Complete)
- [x] 09-02-PLAN.md — Auth API: OTP endpoints, JWT utilities, email service, AuthStore (Complete)
- [x] 09-03-PLAN.md — Store + WS refactor: project_id filtering, Map-based session registry, targeted broadcast (Complete)
- [x] 09-04-PLAN.md — Auth middleware + agent refactor: protected routes, project-scoped agent runs (Complete)
- [x] 09-05-PLAN.md — Tailwind CSS + shadcn/ui: install components with @/ path alias for Auth UI (Complete)
- [ ] 09-06-PLAN.md — Auth UI: OTP modal (email + 6-digit step), project switcher, useAuth hook

### Phase 10: work-stability

**Goal:** Stabilize the application after Phase 9 auth integration — fix 6 bugs causing 401 errors, WebSocket authentication failures, MCP project-id scoping, streaming duplicates, raw JSON in chat, and lost chat history
**Requirements:** Bug1, Bug2, Bug3, Bug4, Bug5, Bug6
**Depends on:** Phase 9
**Plans:** 2/2 plans complete

Plans:
- [ ] 10-01-PLAN.md — Server/MCP fixes: system prompt rewrite (Bug5), MCP PROJECT_ID env + includeGlobal broadcast (Bug3), streaming dedup (Bug4)
- [ ] 10-02-PLAN.md — Frontend/API fixes: useTasks 401 refresh retry (Bug1), useWebSocket accessToken reconnect (Bug2), GET /api/messages + history load (Bug6)

### Phase 11: complete-deisgn-system

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 10
**Plans:** 0/0 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 11 to break down) (completed 2026-03-08)

### Phase 12: fix-auto-save-infinite-loop

**Goal:** Fix infinite loop in auto-save mechanism that causes PUT /api/tasks requests every ~1 second even when user is not editing tasks
**Requirements**: None (bug fix phase)
**Depends on:** Phase 11
**Plans:** 1/1 plans complete

Plans:
- [ ] 12-01-PLAN.md — Add deep comparison to useAutoSave, add session cache to authStore, remove excessive console.log (Complete)

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-03-09 after planning Phase 12*
