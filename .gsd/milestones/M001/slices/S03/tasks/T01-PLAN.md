# T01: 03-auto-schedule-engine 01

**Slice:** S03 — **Milestone:** M001

## Description

Implement auto-scheduling engine that cascades date changes through dependency chains with full support for FS/SS/FF/SF dependency types, circular dependency detection, and missing task validation.

Purpose: Enable automatic project schedule updates when tasks change, ensuring dependent tasks always have valid dates based on their dependencies.

Output: Working TaskScheduler class with TDD test coverage, integrated into update_task MCP tool handler.

## Must-Haves

- [ ] "When a task's dates change, all dependent tasks recalculate automatically"
- [ ] "All four dependency types work correctly: FS, SS, FF, SF"
- [ ] "Creating circular dependencies is rejected with clear error message"
- [ ] "Referencing non-existent task ID in dependency is rejected with clear error message"
- [ ] "Cascading updates propagate through entire dependency chain"
- [ ] "Multiple dependencies on same task resolve to latest dates"

## Files

- `src/scheduler.ts`
- `src/scheduler.test.ts`
- `src/types.ts`
- `src/store.ts`
- `src/index.ts`
