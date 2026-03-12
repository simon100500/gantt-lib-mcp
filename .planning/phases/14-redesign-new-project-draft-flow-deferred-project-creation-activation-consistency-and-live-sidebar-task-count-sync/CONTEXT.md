# Phase 14 Context

## Problem Summary

The current "New Project" flow in the web app is architecturally unstable.

Observed failures:
- Clicking `Новый проект` does not create a true draft state. The previous backend project remains logically selected while the UI is partially cleared.
- Sending the first prompt from the start screen often resets the UI back to the initial screen instead of opening chat and the empty gantt workspace.
- The new project is only created/activated reliably after a second interaction.
- Sidebar `taskCount` values do not update live after task changes.
- Selecting the affected project can show `0` tasks until a full page reload, after which the tasks appear.

## Expected Behavior

1. Clicking `Новый проект` enters a first-class draft/start state.
2. No backend project is created at that moment.
3. Existing selected project should be visually and logically deselected for the workspace flow.
4. On the first prompt submission:
   - create backend project
   - activate/switch to it
   - open chat immediately
   - show empty gantt grid/template immediately
   - then send the first prompt into the chat session
5. Sidebar counts must update in real time as tasks change.

## Confirmed Root Cause

This is primarily a frontend state-model problem, not a backend API problem.

Key findings:
- `App.tsx` derives screen mode indirectly from `tasks.length`, `hasStartedChat`, `pendingNewProject`, `pendingStartPrompt`, and `auth.project`.
- Draft/new-project mode is not modeled as a first-class state.
- `handleCreateProject`, `handleStartScreenSend`, project switching, task loading, websocket reconnect, and autosave interact through side effects and race with each other.
- The effect reacting to project changes clears tasks and may reset chat/start-screen state during async project creation.
- Sidebar task counts render from `auth.projects[].taskCount`, but no client path keeps them synchronized with live `tasks` changes.

## Relevant Files

- `packages/web/src/App.tsx`
- `packages/web/src/hooks/useAuth.ts`
- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/hooks/useAutoSave.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/components/ProjectSwitcher.tsx`
- `packages/server/src/routes/auth-routes.ts`
- `packages/server/src/ws.ts`
- `packages/mcp/src/auth-store.ts`

## Required Design Direction

The fix should be a state-flow redesign, not another patch on top of `pendingNewProject`.

Required direction:
- introduce an explicit workspace mode/state machine
- introduce a real draft/new-project workspace state
- stop deriving start-screen visibility from empty task arrays
- separate "draft project" from "existing project with zero tasks"
- orchestrate first-send project creation as an ordered transaction
- add local project metadata sync helpers so `taskCount` updates immediately for the active project

## Proposed Acceptance Criteria

### New Project Draft Flow
- Clicking `Новый проект` does not call backend project creation.
- The workspace enters start-screen draft mode.
- The previously selected project is not treated as the active workspace project anymore.

### First Prompt Activation
- First prompt creates exactly one new project.
- The newly created project becomes active immediately.
- Chat opens on the first prompt, not the second.
- Empty gantt shell/grid is visible immediately after activation.
- The first prompt is preserved and sent exactly once.

### Stability
- No reset back to start screen occurs during project creation.
- Switching between existing projects still works.
- Empty existing projects do not get confused with draft mode.

### Sidebar Counts
- Adding/removing/importing tasks updates the active project's sidebar count without reload.
- Re-selecting the project after task creation does not require page refresh to show current tasks.

## Notes for Planning

- Commit `935a6f0f69a3f56d86862b7899bb4642f6e42cda` partially improved auth/ws behavior but did not solve this architectural issue.
- Direct backend OTP/API behavior has already been validated separately; this phase is focused on project workspace state and UI synchronization.

---

## Session Handoff: 2026-03-12

### Current Regression State

- New project draft flow was partially refactored in `packages/web/src/App.tsx`, but the end-to-end path is still broken.
- Sending a start-screen prompt now reaches `POST /api/chat`, so the frontend is no longer silently dropping the message before the backend.
- The UI had a render-loop regression from `syncProjectTaskCount`; this was narrowed down to repeated `setState` from `useEffect`.
- The loop source was identified:
  - `App.tsx` synced task count from an effect
  - `useAuth.ts` always updated auth state even when `taskCount` did not change
  - result: `Maximum update depth exceeded` and repeated `syncProjectTaskCount` console spam
- `syncProjectTaskCount` was made idempotent, and the effect dependencies were narrowed, but the overall phase is not yet verified as complete.

### Confirmed Chat / Agent Findings

- The user message now does hit `POST /api/chat`.
- Server debug logs prove `runAgentWithHistory()` is invoked.
- The next failure is not transport-level anymore; it is in the agent mutation path.
- `server-agent.log` and `mcp-agent.log` show the agent tries to create tasks, but MCP returns `SQLITE_CONSTRAINT_FOREIGNKEY`.
- The agent then responds with a text fallback like "project does not exist in DB", so the chat appears to "think and do nothing".

### Confirmed Root Cause After Transport Fix

- The agent is running with a stale `projectId`.
- Evidence:
  - after `switch-project`, HTTP logs show the new active project is a fresh ID like `f2acd165-...`
  - but `server-agent.log` shows `agent_run_started` / `agent_prompt_built` still using the older project ID `079295af-...`
  - `mcp-agent.log` confirms MCP receives and uses that stale `projectId`
- Conclusion:
  - chat launch still races with project switching
  - `POST /api/chat` can be sent with an old access token / old project context immediately after project activation
  - the next session should verify and finish the fix so chat always uses the latest token/project after `switchProject`

### Database Findings

- There are multiple SQLite files in the repo:
  - root DB: `D:/Проекты/gantt-lib-mcp/gantt.db`
  - stray DB: `D:/Проекты/gantt-lib-mcp/packages/server/gantt.db`
  - also legacy/test DBs like `_gantt.db` and `test-server-verify.db`
- This explains earlier confusion about project/task visibility across subsystems.
- Why the extra DB appears:
  - `packages/mcp/src/db.ts` uses fallback `process.env.DB_PATH ?? './gantt.db'`
  - when a process starts without `DB_PATH`, SQLite is created relative to that process `cwd`
  - for `npm run dev -w packages/server`, that can create `packages/server/gantt.db`
- Important nuance:
  - during the latest failing agent run, `mcp-agent.log` showed MCP was actually using the root DB `D:/Проекты/gantt-lib-mcp/gantt.db`
  - so the current creation failure is not primarily caused by `packages/server/gantt.db`
  - however, the fallback still remains dangerous and should be removed to prevent future split-brain DB state

### Required Next Steps

1. Finalize the "latest token / latest project" handoff for `POST /api/chat` after `switchProject`.
2. Re-test:
   - `Новый проект` -> example prompt
   - `Новый проект` -> empty chart
   - normal prompt in an already opened project chat
3. Remove DB ambiguity:
   - stop falling back to `./gantt.db`
   - require one absolute `DB_PATH`
   - then clean up stray `packages/server/gantt.db`

### Files Most Relevant For Resume

- `packages/web/src/App.tsx`
- `packages/web/src/hooks/useAuth.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/server/src/index.ts`
- `packages/server/src/agent.ts`
- `packages/server/src/middleware/auth-middleware.ts`
- `packages/server/src/routes/auth-routes.ts`
- `packages/mcp/src/db.ts`
- `.planning/debug/server-agent.log`
- `.planning/debug/mcp-agent.log`
