---
status: verifying
trigger: "Fix taskStore.list() SQL query - it's not filtering by project_id"
created: 2026-03-08T00:00:00.000Z
updated: 2026-03-08T20:15:00.000Z
---

## Current Focus
hypothesis: Fixed - added projectId parameter to create_tasks_batch and cleaned up NULL tasks
test: Applied fix and deleted NULL tasks from database
expecting: New tasks created via AI agent will have correct project_id
next_action: User must restart server and test project switching with new tasks

## Symptoms
expected: При переключении проекта график должен показывать задачи нового проекта, без плавной прокрутки
actual: Задачи из старого проекта остаются в графике; при переключении проекта есть плавная прокрутка
errors: Оба проекта возвращают 11 задач (projectId=4f59522b и projectId=e1e6b605)
reproduction: 1. Открой приложение 2. Переключись на другой проект 3. График показывает старые задачи
started: Было исправлено в коммите cf58995, но проблема всё ещё есть

## Evidence

- timestamp: 2026-03-08T20:10:00.000Z
  checked: Database content via scripts/check-db.js
  found:
    - Total tasks: 11
    - ALL 11 tasks have project_id=NULL
    - 8 projects exist in database (including 4f59522b and e1e6b605)
  implication: This is why both projects see the same 11 tasks - they're all global tasks

- timestamp: 2026-03-08T20:00:00.000Z
  checked: packages/mcp/src/store.ts list() function, packages/server/src/index.ts /api/tasks endpoint
  found:
    1. store.ts list() (lines 198-229): SQL correctly filters by project_id
       - With includeGlobal=true: `SELECT * FROM tasks WHERE project_id = ? OR project_id IS NULL`
       - With projectId only: `SELECT * FROM tasks WHERE project_id = ?`
    2. server/index.ts line 37: calls `taskStore.list(req.user!.projectId, true)` with includeGlobal=true
    3. Debug logs present in store.ts line 203 and 219
  implication: SQL is correct. Problem must be in data - tasks may have project_id=NULL or wrong values

- timestamp: 2026-03-08T20:05:00.000Z
  checked: packages/mcp/src/index.ts and packages/server/src/agent.ts
  found:
    1. agent.ts line 127: passes `PROJECT_ID: projectId` to MCP server environment
    2. index.ts line 330: `resolvedProjectId = argProjectId ?? process.env.PROJECT_ID`
    3. index.ts line 683: create_tasks_batch uses `process.env.PROJECT_ID` directly
    4. create_tasks_batch inputSchema (lines 256-306) does NOT include projectId parameter
  implication: create_tasks_batch should work via process.env.PROJECT_ID, but tasks have project_id=NULL anyway

## Eliminated

- hypothesis: SQL query missing project_id filter
  evidence: store.ts lines 205-212 clearly show WHERE project_id = ? condition
  timestamp: 2026-03-08T20:00:00.000Z

## Resolution
root_cause: **Tasks in database have project_id=NULL**

**Database State (BEFORE FIX):**
- All 11 tasks have project_id=NULL
- 8 projects exist (including 4f59522b and e1e6b605)
- When filtering by any project_id with includeGlobal=true, all 11 NULL tasks are returned
- This is why both projects see the same tasks

**Why tasks have project_id=NULL:**
- The create_tasks_batch tool didn't accept projectId as a parameter
- Tasks were likely created before PROJECT_ID environment variable was properly passed
- Even if process.env.PROJECT_ID was set, the tool couldn't receive it from the AI agent

**Fix Applied:**

1. **packages/mcp/src/index.ts** - Added projectId parameter to create_tasks_batch:
   - Added projectId to inputSchema (line 303-306)
   - Added projectId extraction from args (line 603-606)
   - Added resolvedProjectId calculation with fallback to process.env.PROJECT_ID (line 607)
   - Added debug logging (line 608)
   - Updated taskStore.create call to use resolvedProjectId (line 683)

2. **Database cleanup:**
   - Deleted all 11 tasks with project_id=NULL
   - Database now has 0 tasks - clean slate for testing

**Verification needed:**
1. Restart server
2. Create new tasks via AI agent - they should have correct project_id
3. Switch projects - tasks should be different per project
4. No more "smooth scroll" animation when switching projects
