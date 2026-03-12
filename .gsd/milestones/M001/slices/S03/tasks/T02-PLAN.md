# T02: 03-auto-schedule-engine 02

**Slice:** S03 — **Milestone:** M001

## Description

Integrate TaskScheduler into TaskStore and MCP tool handlers to enable automatic date recalculation when tasks are created or updated.

Purpose: Connect the auto-scheduling engine to the MCP interface so users can trigger cascading updates through standard CRUD operations.

Output: Working update_task and create_task tools that automatically recalculate dependent task dates.

## Must-Haves

- [ ] "Updating a task via MCP triggers automatic recalculation of dependent tasks"
- [ ] "update_task tool returns updated tasks including cascaded changes"
- [ ] "Creating a task with dependencies validates and recalculate dates"

## Files

- `src/store.ts`
- `src/index.ts`
