# S05: Batch Tasks

**Goal:** Implement batch task creation tool for generating multiple related tasks from a template with repeat parameters (sections, floors, etc.
**Demo:** Implement batch task creation tool for generating multiple related tasks from a template with repeat parameters (sections, floors, etc.

## Must-Haves


## Tasks

- [x] **T01: 05-batch-tasks 01** `est:8 minutes`
  - Implement batch task creation tool for generating multiple related tasks from a template with repeat parameters (sections, floors, etc.) and automatic sequential dependencies.

**Purpose:** Enable users to create large numbers of related tasks (e.g., 168 tasks for 6 sections × 4 floors × 7 work types) in a single operation instead of 168 individual calls.

**Output:** A new MCP tool `create_tasks_batch` that accepts work types, repeat parameters, and stream count, then generates all tasks with proper naming, dates, and FS dependencies.

## Files Likely Touched

- `src/types.ts`
- `src/index.ts`
