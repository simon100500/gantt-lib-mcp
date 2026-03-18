---
phase: 21-tool-quality
plan: 01
subsystem: MCP Server
tags: [tool-descriptions, error-messages, cleanup]
dependency_graph:
  requires: []
  provides: [semantic-tool-descriptions, actionable-errors]
  affects: [ai-agent-experience, error-recovery]
tech_stack:
  added: []
  patterns: [semantic-density, cross-references, error-recovery-pattern]
key_files:
  created: []
  modified:
    - packages/mcp/src/index.ts
    - packages/mcp/src/types.ts
decisions: []
metrics:
  duration: "12 minutes"
  completed_date: "2026-03-18T10:15:00Z"
  tasks_completed: 3
  files_changed: 2
  lines_added: 75
  lines_removed: 173
  net_change: -98 lines
---

# Phase 21 Plan 01: Tool Quality Improvements Summary

Enhance MCP tool descriptions and error messages per best practices for AI agent experience.

## One-Liner

Improved 9 active MCP tool descriptions with semantic, compact format and cross-references; rewrote all 22 error messages with "[Permanent] What. Why. Fix:" pattern; removed 3 legacy tools (export_tasks, import_tasks, set_autosave_path).

## Before/After Examples

### Tool Descriptions

**create_task - Before:**
```
Create a new Gantt chart task with name, dates, and optional properties
```

**create_task - After:**
```
Create a Gantt task with name, dates, dependencies. Returns created task with cascade info. Supports parentId for hierarchy. Use get_tasks to list existing tasks before creating.
```

**get_tasks - Before:**
```
Get a list of Gantt chart tasks with compact format by default. Use full=true for complete task data with all dependencies. Use pagination for large projects.
```

**get_tasks - After:**
```
List tasks with compact mode by default (id, name, dates, parentId, progress). Use full=true for complete data with dependencies. Supports pagination (limit/offset) and parentId filtering. For single task, use get_task.
```

**update_task - Before:**
```
Update task properties (all fields optional except id)
```

**update_task - After:**
```
Update task by id. All fields optional except id. Returns updated task with cascade info if dates/dependencies changed. Pass parentId=null to remove from parent. Use get_task to fetch current state first.
```

### Error Messages

**Date Format Error - Before:**
```
Invalid startDate format: 2026/03/18. Expected format: YYYY-MM-DD
```

**Date Format Error - After:**
```
[Permanent] Invalid startDate format: 2026/03/18.
Expected: YYYY-MM-DD (ISO date format).
Fix: Use format like 2026-03-18.
```

**Task Not Found - Before:**
```
Task not found: abc123
```

**Task Not Found - After:**
```
[Permanent] Task not found: abc123.
Reason: No task with this ID exists in the project.
Fix: Call get_tasks to list available task IDs.
```

**Missing Parameter - Before:**
```
Missing required parameter: id
```

**Missing Parameter - After:**
```
[Permanent] Missing required parameter: id.
Reason: Task ID is required to identify which task to update.
Fix: Provide the task ID as a string parameter.
```

## Removed Tools

### 1. export_tasks
- **Reason:** No-op tool - tasks now persisted automatically via PostgreSQL/Prisma
- **Removed:** Tool definition (lines 272-278) and handler (lines 695-710)
- **Alternative:** Use get_tasks with full=true for complete data export

### 2. import_tasks
- **Reason:** No-op tool - import functionality deprecated in v3.0
- **Removed:** Tool definition (lines 280-292) and handler (lines 712-755)
- **Alternative:** Use create_task or create_tasks_batch for task creation

### 3. set_autosave_path
- **Reason:** No-op tool - autosave not needed with PostgreSQL persistence
- **Removed:** Tool definition (lines 294-305) and handler (lines 755-770)
- **Alternative:** SQLite/PostgreSQL persistence is always active

## Removed Types

- **ImportTasksInput:** Used only by import_tasks tool
- **FilePathInput:** Used only by legacy export/import tools
- **AutoSaveInput:** Used only by set_autosave_path tool

## Error Messages Updated

Total: **22 error messages** rewritten with new pattern

**Breakdown by tool:**
- create_task: 4 errors (startDate format, endDate format, date range, dependency type)
- get_task: 2 errors (missing id, task not found)
- update_task: 6 errors (missing id, no updates, startDate format, endDate format, date range, dependency type, task not found)
- delete_task: 2 errors (missing id, task not found)
- create_tasks_batch: 3 errors (baseStartDate format, workTypes empty, repeatBy empty)
- get_conversation_history: 1 error (project ID required)
- add_message: 2 errors (project ID required, content empty)
- Unknown tool: 1 error (lists all valid tools)

**All errors now include:**
- `[Permanent]` marker (validation errors are permanent, not retry-able)
- What failed (clear problem statement)
- Why it failed (Reason or Expected line)
- Fix with concrete action (Fix line with example or command)
- Cross-references to related tools where helpful

## Verification Results

### Tool Count
- **Before:** 12 tools (9 active + 3 legacy)
- **After:** 9 tools (all active)
- **Verification:** `grep -c "name:" packages/mcp/src/index.ts` returns 9

### Cross-References
- **create_task** → "Use get_tasks to list existing tasks before creating"
- **get_tasks** → "For single task, use get_task"
- **update_task** → "Use get_task to fetch current state first"
- **get_task** → "Use get_tasks for listing multiple tasks"
- **delete_task** → "Use get_tasks to verify deletion"
- **create_tasks_batch** → "Alternative: use create_task for single tasks"
- **get_conversation_history** → "Use add_message to record your response"
- **add_message** → "Call get_conversation_history to read previous messages"

### Error Pattern Compliance
- **All 22 errors** contain `[Permanent]` marker
- **All 22 errors** contain `Fix:` line with actionable guidance
- **All 22 errors** contain `Reason:` or `Expected:` line
- **All "Task not found" errors** suggest "Call get_tasks to list available task IDs"
- **All date format errors** show example format like "2026-03-18"

### TypeScript Compilation
- **Status:** ✅ Passes without errors
- **Command:** `npm run build --workspace=packages/mcp`
- **Output:** Clean compilation

### Legacy Removal
- **export_tasks:** ✅ Removed from tools array and handlers
- **import_tasks:** ✅ Removed from tools array and handlers
- **set_autosave_path:** ✅ Removed from tools array and handlers
- **ImportTasksInput:** ✅ Removed from types.ts
- **FilePathInput:** ✅ Removed from types.ts
- **AutoSaveInput:** ✅ Removed from types.ts

## Deviations from Plan

### Auto-fixed Issues

**None - plan executed exactly as written.**

All tasks completed according to specifications:
- Task 1: Updated 3 core tool descriptions (create_task, get_tasks, update_task)
- Task 2: Updated 6 remaining tool descriptions, removed 3 legacy tools and 3 types
- Task 3: Rewrote all 22 error messages with "[Permanent] What. Why. Fix:" pattern

No blockers, no authentication gates, no architectural changes needed.

## Commits

| Task | Commit | Message | Files |
|------|--------|---------|-------|
| 1 | 13138a9 | feat(21-01): update core tool descriptions with semantic format | packages/mcp/src/index.ts |
| 2 | dfd1c98 | feat(21-01): update remaining tool descriptions and remove legacy tools | packages/mcp/src/index.ts, packages/mcp/src/types.ts |
| 3 | 425a5e2 | feat(21-01): rewrite all error messages with 'what + why + fix' pattern | packages/mcp/src/index.ts |

## Success Criteria Met

- ✅ **Semantic Tool Descriptions** - All 9 active tool descriptions are compact, front-loaded with key info, and include cross-references
- ✅ **Actionable Error Messages** - Every error contains "[Permanent]" marker, explanation of what/why, and concrete fix step
- ✅ **Legacy Removal** - 3 no-op tools removed, reducing tool count from 12 to 9
- ✅ **Agent Recoverability** - Error messages guide agent to next action (e.g., "Call get_tasks to list available task IDs")
- ✅ **Type Consistency** - ImportTasksInput, FilePathInput, AutoSaveInput removed, no orphaned type references

## Next Steps

Phase 21 is complete. The MCP server now has:
- Clean, semantic tool descriptions that help AI agents understand tool capabilities
- Actionable error messages that enable autonomous error recovery
- Removed legacy tools that were confusing agents with no-op functionality

The v3.0 milestone is now complete with all 5 phases finished:
- ✅ Phase 17: Token Economy
- ✅ Phase 18: Qwen SDK Hardening
- ✅ Phase 19: Task Hierarchy
- ✅ Phase 20: Conversation History
- ✅ Phase 21: Tool Quality

**Recommendation:** Proceed to production deployment or user acceptance testing.
