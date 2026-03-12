# T01: 02-task-crud-data-model 01

**Slice:** S02 — **Milestone:** M001

## Description

Implement complete task CRUD operations with gantt-lib compatible data types.

Purpose: Enable AI assistants to create, read, update, and delete Gantt chart tasks with proper type safety and dependency management.

Output: Working MCP server with six task management tools (create_task, get_tasks, get_task, update_task, delete_task) and gantt-lib compatible type definitions.

## Must-Haves

- [ ] "User can create a task with name, startDate, endDate via MCP tool"
- [ ] "User can create a task with dependencies array via MCP tool"
- [ ] "User can retrieve list of all tasks via MCP tool"
- [ ] "User can retrieve single task by ID via MCP tool"
- [ ] "User can update task properties (dates, name, color) via MCP tool"
- [ ] "User can delete task by ID via MCP tool"
- [ ] "Task type structure matches gantt-lib (id, name, startDate, endDate, color, progress, dependencies)"
- [ ] "TaskDependency type structure matches gantt-lib (taskId, type, lag)"
- [ ] "Dates are stored and returned as ISO string format ('YYYY-MM-DD')"

## Files

- `src/types.ts`
- `src/store.ts`
- `src/index.ts`
- `package.json`
