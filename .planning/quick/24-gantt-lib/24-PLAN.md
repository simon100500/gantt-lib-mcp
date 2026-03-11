# Quick Plan 24: Support task ordering and nesting from updated gantt-lib

## Goal
Add end-to-end support for gantt-lib task order and parent/child nesting so chart edits persist correctly through web state, API, and SQLite-backed MCP storage.

## Task 1: Extend shared task model and persistence schema
Update MCP and web task types to include the new gantt-lib ordering/nesting fields, then extend SQLite schema and row mapping in `packages/mcp/src/db.ts` and `packages/mcp/src/store.ts` so create/list/get/update/import preserve those fields without breaking existing tasks.

## Task 2: Propagate the new fields through save/load flows
Adjust server save/load handling in `packages/server/src/index.ts`, plus autosave/local guest state in `packages/web/src/hooks/useAutoSave.ts` and `packages/web/src/hooks/useLocalTasks.ts`, so order/nesting changes emitted by gantt-lib are considered real mutations, serialized, restored, and not dropped during authenticated or local persistence.

## Task 3: Wire gantt-lib nesting/order support in the web chart
Update `packages/web/src/components/GanttChart.tsx` and related web task typing so the wrapper passes the updated task shape cleanly, then verify the chart can render and round-trip reordered/nested tasks from both server-backed and local state without type mismatches.
