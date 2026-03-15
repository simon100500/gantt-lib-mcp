---
status: investigating
trigger: "Investigate issue: new-project-state-reset-and-sidebar-count-desync"
created: 2026-03-12T00:00:00Z
updated: 2026-03-12T00:14:00Z
---

## Current Focus

hypothesis: The bug is caused by missing first-class draft-project state in `App.tsx`, combined with stale project metadata management in `useAuth.ts`. The first prompt creation flow relies on side effects across `pendingNewProject`, `auth.project`, token-based task reload, and websocket reconnect, while sidebar counts never reconcile against live `tasks`.
test: Confirm the current client sequencing from hooks, then replace it with an explicit draft/current-project model and add client-side project metadata sync helpers for selection and task counts.
expecting: Websocket and task hooks will prove the backend path is already adequate, and a frontend rewrite around explicit draft state plus synchronized project metadata will resolve both the reset and count desync.
next_action: inspect package scripts/tests, then implement the frontend state-flow rewrite

## Symptoms

expected: Clicking "Новый проект" should reset selection into a draft/start state with no active existing project selected and no backend project created yet. When the user types the first prompt and sends it, only then should a new project be created, activated, selected in the sidebar, chat should open immediately, and an empty gantt grid/template should appear. Sidebar task counts should update live for the active project.
actual: After clicking "Новый проект" and sending the first prompt, state resets to the start screen instead of entering chat. Only on a subsequent prompt inside that new project does the chat and gantt skeleton appear. Task count in the sidebar does not update in real time. After the error, selecting the project often shows it as inactive with 0 tasks until a full page reload, after which the tasks appear.
errors: No single JS error provided for this bug. There was a previous attempted fix via commit 935a6f0f69a3f56d86862b7899bb4642f6e42cda, but the bug persists.
reproduction: 1. Have any existing project selected in sidebar. 2. Click "Новый проект". 3. Observe start screen/draft state. 4. Type first prompt and send. 5. Instead of creating project + activating it + opening chat + showing empty gantt shell, the UI resets incorrectly to the initial screen. 6. If you then send another prompt, the new project finally starts behaving more normally. 7. Sidebar task counts for the project do not refresh live, and selecting the project after the bug may show 0 tasks until reload.
started: Bug persists after a prior auth/websocket/project persistence fix was ported into the current web branch. User requests a full rethink of the new-project creation flow, not another small patch.

## Eliminated

## Evidence

- timestamp: 2026-03-12T00:04:00Z
  checked: repository-wide search for new-project, active project, draft, and task-count references
  found: frontend ownership is concentrated in `packages/web/src/App.tsx`, `packages/web/src/hooks/useAuth.ts`, and `packages/web/src/components/ProjectSwitcher.tsx`; server also emits websocket task counts from `packages/server/src/ws.ts`
  implication: the bug is likely a frontend state transition issue, with possible missing task-count synchronization from websocket/task updates

- timestamp: 2026-03-12T00:08:00Z
  checked: full read of `packages/web/src/App.tsx`, `packages/web/src/hooks/useAuth.ts`, `packages/web/src/components/ProjectSwitcher.tsx`, and `packages/server/src/ws.ts`
  found: clicking "Новый проект" only sets `pendingNewProject=true` and clears local UI state; it does not clear or replace `auth.project`, so the sidebar/header still reference the previous backend project until async create+switch completes on first send
  implication: draft mode is not modeled as a first-class selection state, so existing project-based effects can fire during first-send and reset the UI unexpectedly

- timestamp: 2026-03-12T00:08:30Z
  checked: same frontend files
  found: sidebar counts are rendered from `auth.projects[].taskCount`, but no code in `App.tsx` or `useAuth.ts` updates those counts in response to `tasks` changes or websocket task payloads
  implication: task counts will remain stale until a later `/api/projects` refetch such as a full reload or explicit project refresh

- timestamp: 2026-03-12T00:12:30Z
  checked: `packages/web/src/hooks/useTasks.ts`, `packages/web/src/hooks/useWebSocket.ts`, `packages/web/src/hooks/useAutoSave.ts`, and `packages/server/src/agent.ts`
  found: server broadcasts `tasks` before `done`, websocket reconnects on access-token change, and autosave persists tasks by token; none of these layers update project-list metadata, and all of them assume a concrete current backend project already exists
  implication: the reset/desync mechanism is frontend orchestration around project identity, not a missing server broadcast

## Resolution

root_cause:
fix:
verification:
files_changed: []
