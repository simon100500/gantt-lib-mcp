# T01: 05-batch-tasks 01

**Slice:** S05 — **Milestone:** M001

## Description

Implement batch task creation tool for generating multiple related tasks from a template with repeat parameters (sections, floors, etc.) and automatic sequential dependencies.

**Purpose:** Enable users to create large numbers of related tasks (e.g., 168 tasks for 6 sections × 4 floors × 7 work types) in a single operation instead of 168 individual calls.

**Output:** A new MCP tool `create_tasks_batch` that accepts work types, repeat parameters, and stream count, then generates all tasks with proper naming, dates, and FS dependencies.

## Must-Haves

- [ ] "User can create multiple tasks from a single batch operation"
- [ ] "Tasks are created with sequential FS dependencies within each stream"
- [ ] "Task names are auto-generated from work type and repeat parameters"
- [ ] "Task dates are calculated sequentially within each stream"
- [ ] "Partial success returns both created and failed tasks"
- [ ] "Different streams operate in parallel without dependencies"

## Files

- `src/types.ts`
- `src/index.ts`
