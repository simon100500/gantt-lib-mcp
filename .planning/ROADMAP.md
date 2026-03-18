# ROADMAP: gantt-lib MCP Server

**Created:** 2026-02-23
**Current milestone:** v3.0 MCP Server Refactoring
**Phase range:** 17-22

## Milestones

- ✅ **v1.0 MVP** — Phases 1-14 (shipped 2026-03-13)
- ✅ **v2.0 PostgreSQL Migration** — Phases 15-16 (shipped 2026-03-17)
- 🚧 **v3.0 MCP Server Refactoring** — Phases 17-21 (in progress)

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-14 | v1.0 | 26 | Complete | 2026-03-13 |
| 15-16 | v2.0 | 6 | Complete | 2026-03-17 |
| 17. Token Economy | v3.0 | 2 | Complete | 2026-03-17 |
| 18. Qwen SDK Hardening | v3.0 | 1 | Ready to execute | - |
| 19. Task Hierarchy | v3.0 | TBD | Not started | - |
| 20. Conversation History | v3.0 | TBD | Not started | - |
| 21. Tool Quality | v3.0 | 1 | Ready to execute | - |
| 22. Zustand Frontend Refactor | 4/4 | Complete   | 2026-03-18 | - |

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-14) — SHIPPED 2026-03-13</summary>

**14 phases, 26 plans, 18 days**

Complete archive: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

- [x] Phase 1: MCP Server Foundation (1 plan)
- [x] Phase 2: Task CRUD + Data Model (1 plan)
- [x] Phase 3: Auto-schedule Engine (2 plans)
- [x] Phase 4: Testing & Validation (0 plans)
- [x] Phase 5: Batch Tasks (1 plan)
- [x] Phase 6: qwen-agent (2 plans)
- [x] Phase 7: Web UI with real-time Gantt editing (6 plans)
- [x] Phase 8: Integrate gantt-lib library (2 plans)
- [x] Phase 9: session-control (6 plans, 09-06 Auth UI pending)
- [x] Phase 10: work-stability (2 plans)
- [x] Phase 11: complete-design-system (0 plans)
- [x] Phase 12: fix-auto-save-infinite-loop (1 plan)
- [x] Phase 13: start-screen (1 plan)
- [x] Phase 14: redesign-project-flow (1 plan)

**Key accomplishments:**
1. MCP server with stdio transport and auto-schedule engine
2. Full-stack web app with AI chat and interactive Gantt chart
3. Multi-user auth with OTP email and project isolation
4. Production Docker deployment with CapRover

**Known gaps:**
- Phase 9 Plan 6: Auth UI (OTP modal, project switcher) — backend complete, UI pending

</details>

---

<details>
<summary>✅ v2.0 PostgreSQL Migration (Phases 15-16) — SHIPPED 2026-03-17</summary>

**2 phases, 6 plans, 4 days**

Complete archive: [.planning/milestones/v2.0-ROADMAP.md](.planning/milestones/v2.0-ROADMAP.md)

- [x] Phase 15: Prisma Setup (2 plans)
- [x] Phase 16: Services Layer (4 plans)

**Key accomplishments:**
1. Prisma schema defines all tables with proper relationships
2. Prisma client singleton with connection pooling
3. TaskService, ProjectService, AuthService, MessageService, DependencyService
4. All services use Prisma (no raw SQL)
5. Services shared between packages/mcp and packages/server

</details>

---

### 🚧 v3.0 MCP Server Refactoring (In Progress)

**Milestone Goal:** Improve MCP server: token economy, agent hardening, task hierarchy, conversation history, tool quality

#### Phase 17: Token Economy

**Goal:** Reduce MCP response size and conversation history context

**Depends on:** Nothing (first phase of v3.0)

**Requirements:** TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04

**Success Criteria** (what must be TRUE):
1. `get_tasks` returns compact format by default (id, name, dates, parentId, progress)
2. `get_tasks` supports pagination with `limit` and `offset` parameters
3. `get_task` supports `includeChildren: boolean` (default: false)
4. Conversation history limited to 20 messages with truncation notice
5. Token usage reduced by 50-90% for large projects

**Plans:** 2/2 plans complete
- [x] 17-01-PLAN.md — Update get_tasks and get_task MCP tools with compact mode, pagination, and includeChildren
- [x] 17-02-PLAN.md — Add limit parameter to MessageService.list() and update agent.ts

---

#### Phase 18: Qwen SDK Hardening

**Goal:** Make agent reliable — no hangs, no infinite loops, MCP-only access

**Depends on:** Phase 17 (token economy helps with hardening)

**Requirements:** HARD-01, HARD-02, HARD-03

**Success Criteria** (what must be TRUE):
1. Agent has max session turns limit of 20
2. Agent has 2-minute timeout via AbortController
3. Agent excluded from direct file system and terminal tools
4. Agent cannot hang or run indefinitely

**Plans:** 1/1 plans complete
- [ ] 18-01-PLAN.md — Add maxSessionTurns, AbortController timeout, and excludeTools to agent.ts

---

#### Phase 19: Task Hierarchy

**Goal:** Enable agent to work with nested tasks via parentId

**Depends on:** Phase 17 (MCP tools updated)

**Requirements:** HIER-01, HIER-02, HIER-03

**Success Criteria** (what must be TRUE):
1. `create_task` accepts `parentId?: string` parameter
2. `update_task` accepts `parentId?: string | null` (null removes from parent)
3. `get_tasks` supports filtering by `parentId?: string | null`
4. Parent task dates automatically recalculate from children range
5. Cannot create circular hierarchy

**Plans:** 1/1 plans complete

---

#### Phase 20: Conversation History

**Goal:** Give agent access to previous session context via MCP tools

**Depends on:** Phase 17 (MCP tools pattern established)

**Requirements:** HIST-01, HIST-02

**Success Criteria** (what must be TRUE):
1. New MCP tool `get_conversation_history` returns last N messages (limit: 20, max: 50)
2. New MCP tool `add_message` records assistant message to project chat
3. MessageService integration works correctly
4. Agent can read and write conversation history

**Plans:** 1/1 plans complete

---

#### Phase 21: Tool Quality

**Goal:** Improve tool descriptions and error messages per MCP best practices

**Depends on:** Phase 17-20 (tools updated, can improve descriptions)

**Requirements:** QUAL-01, QUAL-02

**Success Criteria** (what must be TRUE):
1. All tool descriptions are semantic and dense with usage guidance
2. Error messages follow "what + why + what to do" pattern
3. Agent can recover from errors using error message guidance
4. Tool descriptions reference related tools (e.g., batch_create)

**Plans:** 1/1 plans complete
- [ ] 21-01-PLAN.md — Update tool descriptions and error messages with semantic density and actionable guidance

---

## Dependencies

```
Phase 17 (Token Economy)
    ↓
Phase 18 (Qwen SDK Hardening)
    ↓
Phase 19 (Task Hierarchy) ──┐
    ↓                        │
Phase 20 (Conversation History) ── Phase 21 (Tool Quality)
    ↓
```

**Notes:** Phases 19-20 can be done in parallel after Phase 17. Phase 21 depends on all tool changes being complete.

---

## Coverage

**v1+v2 Requirements:** 32 total — 100% complete
**v3 Requirements:** 14 total — 100% mapped (Phases 17-21)

| Category | Requirements | Phase | Plans | Status | Completed |
|----------|--------------|-------|-------|--------|-----------|
| Token Economy (TOKEN) | TOKEN-01 through TOKEN-04 | 17 | 2 | Complete | 2026-03-17 |
| Hardening (HARD) | HARD-01 through HARD-03 | 18 | 1/1 | Complete    | 2026-03-17 |
| Task Hierarchy (HIER) | HIER-01 through HIER-03 | 19 | 1/1 | Complete    | 2026-03-17 |
| Conversation History (HIST) | HIST-01 through HIST-02 | 20 | 1/1 | Complete    | 2026-03-17 |
| Tool Quality (QUAL) | QUAL-01 through QUAL-02 | 21 | 1/1 | Complete    | 2026-03-18 |

**No orphaned requirements.**
**No duplicates.**

### Phase 22: Zustand Frontend Refactor

**Goal:** Refactor `packages/web` state ownership around Zustand stores and workspace-oriented frontend state.
**Requirements**: WEB-ZUSTAND-01 through WEB-ZUSTAND-07
**Depends on:** Phase 21
**Plans:** 4/4 plans complete

Plans:
- [x] 22-01-PLAN.md - Install Zustand and add foundational chat/UI stores plus save-state transport
- [x] 22-02-PLAN.md - Move auth/session/project ownership into Zustand via `useAuthStore`
- [x] 22-03-PLAN.md - Move task ownership and WebSocket routing onto Zustand task/chat stores
- [x] 22-04-PLAN.md - Extract workspace shells and route toolbar/project menu controls through Zustand UI state

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-03-19 with Phase 22 completion progress*
