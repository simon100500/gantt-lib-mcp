---
status: resolved
trigger: "Editing or adding tasks doesn't work. The assistant says it added/edited tasks but nothing appears in the Gantt chart."
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - The `get_tasks` MCP tool ignores PROJECT_ID env var entirely, and the `create_task`/`create_tasks_batch` tools use PROJECT_ID from env correctly BUT the system prompt does not instruct the agent to call `get_tasks` first to understand the current project structure. Combined with the issue that `get_tasks` returns ALL tasks from ALL projects (no filter), the agent cannot properly see or manage the current project.
test: Completed - traced full execution path from user chat -> WS -> agent.ts -> MCP child process -> DB -> WS broadcast -> frontend
expecting: Fix applied
next_action: Fix the `get_tasks` tool to respect PROJECT_ID and update the system prompt to explicitly tell the AI to use get_tasks with proper project context

## Symptoms

expected: When assistant adds or edits tasks, they should appear in the Gantt chart
actual: Assistant reports success but tasks don't appear in the chart; assistant doesn't seem to read current project tasks from DB
errors: No explicit errors reported - just silent failure where chart doesn't update
reproduction: Ask assistant to add a new task or edit existing task; it responds saying it did, but the chart remains unchanged
started: Current issue, may have always been broken

## Eliminated

- hypothesis: DB_PATH mismatch between server process and MCP child process
  evidence: server/src/agent.ts line 110 computes absolute DB_PATH and passes it explicitly to MCP child env (line 121, 127). Both processes use the same absolute path.
  timestamp: 2026-03-10T00:01:00Z

- hypothesis: FK constraint causing silent insert failure
  evidence: The PROJECT_ID passed from server is a valid project UUID that exists in the projects table (created by authStore.createDefaultProject during OTP login). The constraint would only fail if a bad/random UUID was used.
  timestamp: 2026-03-10T00:01:00Z

## Evidence

- timestamp: 2026-03-10T00:00:30Z
  checked: packages/mcp/src/index.ts - get_tasks tool handler (line 386-396)
  found: taskStore.list() called with NO arguments - returns all tasks across all projects, no PROJECT_ID filter
  implication: Agent can't accurately see "current project" tasks; it sees a mixture of all projects

- timestamp: 2026-03-10T00:00:35Z
  checked: packages/mcp/src/index.ts - create_task handler (line 331-383)
  found: resolvedProjectId = argProjectId ?? process.env.PROJECT_ID - correctly uses PROJECT_ID env
  implication: create_task works correctly when invoked via server (PROJECT_ID is set). But get_tasks doesn't filter by project, so the agent can't tell which tasks belong to the current project.

- timestamp: 2026-03-10T00:00:40Z
  checked: packages/server/src/agent.ts lines 110-131
  found: DB_PATH and PROJECT_ID are passed to MCP child process env. After agent runs, taskStore.list(projectId, true) is called and broadcast via WS {type: 'tasks'}.
  implication: The server correctly broadcasts the updated project tasks after agent completion. If tasks appear in DB with correct project_id, they WILL reach the frontend.

- timestamp: 2026-03-10T00:00:45Z
  checked: packages/mcp/agent/prompts/system.md
  found: System prompt has no instruction to call get_tasks to understand current project state before making changes. The agent goes in "blind" without reading existing tasks.
  implication: Agent does not know what tasks already exist for the current project. When asked to "edit" a task, it has no way to find task IDs without calling get_tasks first.

- timestamp: 2026-03-10T00:00:50Z
  checked: packages/mcp/src/index.ts - get_tasks tool description (line 124-130)
  found: Tool description says "Get a list of all Gantt chart tasks" with no mention of project filtering. Input schema has no projectId parameter.
  implication: The agent has no way to request only current-project tasks via get_tasks. It always gets all tasks, making it impossible to see only the relevant project's tasks.

- timestamp: 2026-03-10T00:00:55Z
  checked: App.tsx handleWsMessage (line 100-121)
  found: When WS message type='tasks' arrives, setTasks(msg.tasks as Task[]) is called correctly.
  implication: The frontend update mechanism is correct. The issue is upstream: the agent either fails to create tasks with right projectId or the WS broadcast doesn't fire.

## Resolution

root_cause: TWO compounding issues:
  1. The `get_tasks` MCP tool has no `projectId` parameter and does not use `process.env.PROJECT_ID`, so it returns ALL tasks across ALL projects. The agent cannot distinguish which tasks belong to the current project.
  2. The system prompt does not instruct the agent to call `get_tasks` before making changes, so the agent goes in without knowing the current project state. When asked to "edit" a task, it cannot find the task's ID because it doesn't read the current task list first.
fix: |
  1. packages/mcp/src/index.ts: Fixed `get_tasks` tool to accept optional `projectId` parameter and use `process.env.PROJECT_ID` when not provided, so it only returns current project's tasks.
  2. packages/mcp/src/index.ts: Fixed the `create_task` after-action `taskStore.list()` to use `resolvedProjectId` scope.
  3. packages/mcp/src/index.ts: Fixed the `update_task` after-action `taskStore.list()` to use `process.env.PROJECT_ID` scope.
  4. packages/mcp/agent/prompts/system.md: Updated workflow to explicitly instruct agent to call `get_tasks` FIRST at every turn, and to look up task IDs before editing/deleting.
  5. Build verified: `npm run build:mcp` succeeds with no TypeScript errors.
verification: TypeScript compiled successfully. Human verified fix works in live app (2026-03-10).
files_changed:
  - packages/mcp/src/index.ts
  - packages/mcp/agent/prompts/system.md
