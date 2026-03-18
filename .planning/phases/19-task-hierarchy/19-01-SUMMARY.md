---
phase: "19"
plan: "01"
title: "Add parentId Filter to get_tasks"
one_liner: "Hierarchical task filtering via parentId parameter in get_tasks tool"
subsystem: "MCP Server / Task Hierarchy"
tags: ["mcp", "tasks", "hierarchy", "filtering"]
wave: 1
dependency_graph:
  requires: []
  provides: ["HIER-03"]
  affects: ["packages/mcp/src/services/task.service.ts", "packages/mcp/src/index.ts"]
tech_stack:
  added: []
  patterns: ["Prisma where clause composition", "Optional parameter filtering"]
key_files:
  created: []
  modified:
    - "packages/mcp/src/services/task.service.ts"
    - "packages/mcp/src/index.ts"
decisions: []
metrics:
  duration_seconds: 180
  tasks_completed: 2
  files_modified: 2
  completed_date: "2026-03-17"
---

# Phase 19 Plan 01: Add parentId Filter to get_tasks Summary

**Status:** ✅ Complete
**Duration:** 3 minutes
**Commits:** 2

## Objective

Enable `get_tasks` MCP tool to filter by parent task ID for hierarchical task queries, completing requirement HIER-03.

## Implementation Summary

Both tasks were completed successfully with no deviations from the plan.

### Task 1: TaskService.list() Enhancement

**Commit:** `10fc568`

Added `parentId?: string | null` parameter to the `list()` method in `packages/mcp/src/services/task.service.ts`:

- Updated method signature to accept `parentId` after `projectId`
- Implemented combined where clause that composes `projectId` and `parentId` filters
- Filter behavior:
  - `parentId: null` → root tasks only (`WHERE parentId IS NULL`)
  - `parentId: "task-id"` → direct children of that task
  - `parentId: undefined` (omitted) → all tasks (backward compatible)

**Implementation approach:**
```typescript
const whereClause: any = {};
if (projectId) whereClause.projectId = projectId;
if (parentId !== undefined) whereClause.parentId = parentId;
```

This allows both filters to work independently or together (e.g., `get_tasks(projectId="xyz", parentId=null)` → root tasks for specific project).

### Task 2: MCP Tool Integration

**Commit:** `cd5facc`

Updated `get_tasks` tool in `packages/mcp/src/index.ts`:

- Added `parentId` property to inputSchema with descriptive text
- Updated handler to destructure `parentId` from args
- Modified `taskService.list()` call to pass `parentId` as second argument
- Enhanced debug logging to include `parentId` parameter

## Verification

The implementation satisfies all verification criteria from the plan:

✅ `get_tasks(parentId=null)` returns only root tasks (WHERE parentId IS NULL)
✅ `get_tasks(parentId="task-123")` returns only direct children of task-123
✅ `get_tasks()` (without parentId) returns all tasks (backward compatible)
✅ Filter applies before pagination (limit/offset affect filtered results)

## Context

**HIER-01 and HIER-02 already complete:**
- `create_task` accepts `parentId?: string` ✓
- `update_task` accepts `parentId?: string | null` ✓
- Parent date recalculation works ✓
- Circular reference detection works ✓

**This plan completes HIER-03:**
- `get_tasks` now supports filtering by `parentId` ✓

## Notes

No database schema changes were needed:
- Task table already has `parentId` column
- TaskHierarchy relation already defined
- onDelete: SetNull already configured

TypeScript types already correct:
- CreateTaskInput has `parentId?: string`
- UpdateTaskInput has `parentId?: string | null`
- Task interface has `parentId?: string`

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None encountered.

## Next Steps

Phase 19 (Task Hierarchy) now complete with HIER-03 requirement satisfied. Ready to proceed to Phase 20 (Conversation History) or Phase 18 (Qwen SDK Hardening) per project roadmap priority.
