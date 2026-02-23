---
phase: quick-json-export
plan: 01
subsystem: JSON Export/Import
tags: [mcp, json, export, import, task-store]
requirements: [JSON-01]

dependency_graph:
  requires:
    - "Phase 3 (auto-schedule engine)"
  provides:
    - "JSON serialization of all tasks"
    - "JSON deserialization for task restoration"
  affects:
    - "src/store.ts (new methods)"
    - "src/index.ts (new MCP tools)"
    - "src/types.ts (new input types)"

tech_stack:
  added: []
  patterns:
    - "Built-in JSON.stringify/parse for serialization"
    - "Array.from(Map.values()) for task iteration"
    - "Map.clear() for full replacement on import"

key_files:
  created: []
  modified:
    - path: "src/store.ts"
      additions: 37
      changes: "Added exportTasks() and importTasks() methods"
    - path: "src/index.ts"
      additions: 56
      changes: "Added export_tasks and import_tasks MCP tools"
    - path: "src/types.ts"
      additions: 14
      changes: "Added FilePathInput and ImportTasksInput interfaces"

decisions:
  - "Use built-in JSON (no external dependencies) for serialization"
  - "import_tasks replaces ALL existing tasks (not merge)"
  - "Return pretty-printed JSON (2-space indent) for readability"

metrics:
  duration: "10 min 16 sec"
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 3
  commits: 2
  test_result: "All verifications passed"
---

# Phase Quick-JSON Plan 01: JSON Export/Import Summary

## One-Liner
Added JSON export/import functionality to TaskStore with MCP tools for task serialization and restoration.

## Objective
Enable users to save their Gantt chart data to JSON files and restore it later through two new MCP tools.

---

## Completed Tasks

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Add export/import methods to TaskStore | 970c9d1 | src/store.ts |
| 2 | Add MCP tools for export/import | 67d91f4 | src/index.ts, src/types.ts |

### Task 1: Add export/import methods to TaskStore
**Commit:** `970c9d1`

Added two methods to the `TaskStore` class:

- `exportTasks(): string` - Returns JSON string of all tasks with pretty formatting (2-space indent)
- `importTasks(jsonData: string): number` - Imports tasks from JSON, clears existing tasks, returns count

**Implementation details:**
- Uses `Array.from(this.tasks.values())` to get all tasks
- Validates JSON parsing and ensures input is an array
- Clears existing tasks before import (`this.tasks.clear()`)
- No external dependencies needed (Node.js built-in JSON)

### Task 2: Add MCP tools for export/import
**Commit:** `67d91f4`

Added two new MCP tools and supporting types:

**New types in `src/types.ts`:**
- `FilePathInput` - Interface for file path operations (reserved for future file-based export)
- `ImportTasksInput` - Interface with `jsonData: string` field

**New MCP tools in `src/index.ts`:**
- `export_tasks` - Returns JSON string of all tasks (no input required)
- `import_tasks` - Accepts `jsonData` string and imports tasks (replaces all existing tasks)

**Error handling:**
- Missing `jsonData` parameter throws descriptive error
- Invalid JSON or non-array data returns user-friendly error message with `isError: true`
- Success response includes count of imported tasks

---

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Auth Gates

None - no authentication required for this task.

---

## Verification Results

### Task 1 Verification
```bash
node -e "const { TaskStore } = require('./dist/store.js'); const s = new TaskStore(); s.create({name:'Test',startDate:'2026-01-01',endDate:'2026-01-02'}); const json = s.exportTasks(); console.log('Export:', json); const count = s.importTasks(json); console.log('Imported:', count);"
```

**Result:** Export returned valid JSON array with task data. Import successfully restored 1 task.

### Task 2 Verification
```bash
npm run build
node -e "import('./dist/index.js').then(m => console.log('MCP server built successfully'))"
```

**Result:** Build succeeded with no TypeScript errors. MCP server module loaded correctly.

### Overall Success Criteria
- [x] MCP tools `export_tasks` and `import_tasks` are available
- [x] `export_tasks` returns JSON string of all tasks
- [x] `import_tasks` accepts JSON string and imports tasks
- [x] Import replaces all existing tasks (not merge)
- [x] Error handling for invalid JSON data
- [x] Build succeeds with no TypeScript errors

---

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | Use built-in JSON.stringify/parse | No external dependencies needed, Node.js native support |
| 2026-02-23 | Import replaces all tasks (not merge) | Simpler semantics, matches STATE.md out-of-scope for persistent storage |
| 2026-02-23 | Pretty-print JSON (2-space indent) | Human-readable output for debugging/validation |

---

## Next Steps

This quick task is complete. The project can now:
1. Continue to Phase 4: Testing & Validation (per STATE.md)
2. Use JSON export/import for data backup/restore scenarios

---

## Self-Check: PASSED

- [x] Created files exist: None (only modifications)
- [x] Modified files exist: src/store.ts, src/index.ts, src/types.ts
- [x] Commits exist: 970c9d1, 67d91f4
- [x] SUMMARY.md created: .planning/quick/1-json/1-SUMMARY.md
