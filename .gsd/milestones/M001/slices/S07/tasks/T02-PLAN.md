# T02: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 02

**Slice:** S07 — **Milestone:** M001

## Description

Migrate the MCP package's in-memory TaskStore to SQLite persistence using `@libsql/client` (WASM build — no native compilation required). This plan runs in parallel with 07-01 since it only modifies files within packages/mcp/.

Purpose: All tasks and dialog history become persistent across restarts. The backend (07-03) and web (07-04/05) read the same DB.

Output:
- packages/mcp/src/db.ts — @libsql/client init, CREATE TABLE IF NOT EXISTS for tasks/dependencies/messages
- packages/mcp/src/store.ts — TaskStore reimplemented with async SQLite operations
- packages/mcp/src/types.ts — Add Message type for dialog history
- packages/mcp/src/index.ts — MCP tool handlers updated to use async store methods

## Must-Haves

- [ ] "MCP server reads and writes tasks from SQLite via @libsql/client WASM"
- [ ] "tasks table has id, name, startDate, endDate, color, progress columns"
- [ ] "dependencies table has id, task_id, dep_task_id, type, lag columns (separate table, not JSON)"
- [ ] "messages table has id, role, content, created_at columns for dialog history"
- [ ] "All existing MCP tools (create_task, update_task, delete_task, get_tasks) work via DB"
- [ ] "Dates stored as TEXT in YYYY-MM-DD format"
- [ ] "DB file created at DATA_DIR/gantt.db (from env DB_PATH or default ./gantt.db)"

## Files

- `packages/mcp/src/db.ts`
- `packages/mcp/src/store.ts`
- `packages/mcp/src/types.ts`
- `packages/mcp/src/index.ts`
