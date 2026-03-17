# Requirements: gantt-lib MCP Server

**Defined:** 2026-03-17
**Core Value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

**Milestone:** v3.0 — MCP Server Refactoring

---

## v3.0 Requirements

MCP server refactoring: token economy, agent hardening, task hierarchy, conversation history, tool quality.

### Token Economy (TOKEN)

- [x] **TOKEN-01**: `get_tasks` supports compact mode with only essential fields (id, name, dates, parentId, progress)
- [x] **TOKEN-02**: `get_tasks` supports pagination with `limit` (default: 100) and `offset` (default: 0) parameters
- [x] **TOKEN-03**: `get_task` supports `includeChildren: boolean` (default: false) to avoid loading child tasks
- [x] **TOKEN-04**: Conversation history limited to 20 messages with truncation notice when exceeded

### Hardening (HARD)

- [x] **HARD-01**: Agent has max session turns limit of 20
- [x] **HARD-02**: Agent has 2-minute timeout via AbortController
- [x] **HARD-03**: Agent excluded from direct file system and terminal tools (write_file, edit_file, run_terminal_cmd, run_python_code)

### Task Hierarchy (HIER)

- [ ] **HIER-01**: `create_task` accepts `parentId?: string` parameter
- [ ] **HIER-02**: `update_task` accepts `parentId?: string | null` parameter (null removes from parent)
- [ ] **HIER-03**: `get_tasks` supports filtering by `parentId?: string | null` (null = root only, string = direct children)

### Conversation History (HIST)

- [ ] **HIST-01**: New MCP tool `get_conversation_history` returns last N messages (limit: 20, max: 50)
- [ ] **HIST-02**: New MCP tool `add_message` records assistant message to project chat history

### Tool Quality (QUAL)

- [ ] **QUAL-01**: All tool descriptions are semantic and dense with usage guidance
- [ ] **QUAL-02**: Error messages follow "what + why + what to do" pattern with actionable guidance

---

## v1.0+v2.0 Features (Validated — Keep Working)

These features shipped in previous milestones and must continue working:

- ✓ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✓ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✓ AI chat interface with streaming responses
- ✓ Interactive drag-to-edit Gantt chart
- ✓ Multi-user project isolation
- ✓ OTP email authentication
- ✓ Real-time WebSocket sync
- ✓ PostgreSQL + Prisma ORM with connection pooling
- ✓ Production Docker deployment

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| MCP → REST API migration | Service layer already sufficient, article allows "through internal service layer" |
| Task change events | Operational telemetry, defer to future |
| Undo/redo | Feature enhancement, not part of MCP refactoring |
| Advanced pagination (cursors, etc.) | Simple offset/limit sufficient for v3.0 |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOKEN-01 through TOKEN-04 | Phase 17 | Pending |
| HARD-01 through HARD-03 | Phase 18 | Pending |
| HIER-01 through HIER-03 | Phase 19 | Pending |
| HIST-01 through HIST-02 | Phase 20 | Pending |
| QUAL-01 through QUAL-02 | Phase 21 | Pending |

**Coverage:**
- v3.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after v3.0 milestone initialization*
