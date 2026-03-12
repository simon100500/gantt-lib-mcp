# S03: Auto Schedule Engine

**Goal:** Implement auto-scheduling engine that cascades date changes through dependency chains with full support for FS/SS/FF/SF dependency types, circular dependency detection, and missing task validation.
**Demo:** Implement auto-scheduling engine that cascades date changes through dependency chains with full support for FS/SS/FF/SF dependency types, circular dependency detection, and missing task validation.

## Must-Haves


## Tasks

- [x] **T01: 03-auto-schedule-engine 01** `est:15 min`
  - Implement auto-scheduling engine that cascades date changes through dependency chains with full support for FS/SS/FF/SF dependency types, circular dependency detection, and missing task validation.

Purpose: Enable automatic project schedule updates when tasks change, ensuring dependent tasks always have valid dates based on their dependencies.

Output: Working TaskScheduler class with TDD test coverage, integrated into update_task MCP tool handler.
- [x] **T02: 03-auto-schedule-engine 02** `est:12min`
  - Integrate TaskScheduler into TaskStore and MCP tool handlers to enable automatic date recalculation when tasks are created or updated.

Purpose: Connect the auto-scheduling engine to the MCP interface so users can trigger cascading updates through standard CRUD operations.

Output: Working update_task and create_task tools that automatically recalculate dependent task dates.

## Files Likely Touched

- `src/scheduler.ts`
- `src/scheduler.test.ts`
- `src/types.ts`
- `src/store.ts`
- `src/index.ts`
- `src/store.ts`
- `src/index.ts`
