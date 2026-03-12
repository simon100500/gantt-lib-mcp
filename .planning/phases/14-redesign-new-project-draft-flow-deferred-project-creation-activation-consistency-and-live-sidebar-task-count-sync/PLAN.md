---
phase: 14-redesign-new-project-draft-flow-deferred-project-creation-activation-consistency-and-live-sidebar-task-count-sync
type: planning
depends_on:
  - Phase 13
files_primary:
  - packages/web/src/App.tsx
  - packages/web/src/hooks/useAuth.ts
  - packages/web/src/hooks/useTasks.ts
  - packages/web/src/hooks/useAutoSave.ts
  - packages/web/src/hooks/useWebSocket.ts
  - packages/web/src/components/ProjectSwitcher.tsx
---

# Phase 14 Plan

## Goal

Redesign the web workspace flow around an explicit draft/active state model so that:
- `Новый проект` enters a real draft workspace without backend creation
- first prompt activation creates and switches exactly once
- chat and empty gantt shell open deterministically on the first interaction
- existing empty projects are distinct from draft mode
- sidebar `taskCount` stays in sync with live task edits without reload

## Design Direction

Treat this as a state-flow redesign, not a patch on `pendingNewProject`, `pendingStartPrompt`, or `tasks.length === 0`.

Core change:
- introduce a first-class workspace state in `App.tsx`
- make rendering depend on workspace mode, not inferred emptiness
- isolate activation into an ordered async transaction
- keep project metadata sync local and immediate for the active project

Suggested workspace model:

```ts
type WorkspaceMode =
  | { kind: 'guest' }
  | { kind: 'shared' }
  | { kind: 'project'; projectId: string; chatOpen: boolean }
  | { kind: 'draft'; chatOpen: false; draftName: string; queuedPrompt: string | null; activation: 'idle' | 'creating' | 'switching' | 'ready' };
```

The exact shape can vary, but it must separate:
- draft workspace
- active authenticated project
- existing project with zero tasks
- read-only share mode

## Wave 1: Replace Implicit UI State With Explicit Workspace State

**Objective:** remove mode derivation from `tasks.length`, `hasStartedChat`, `pendingNewProject`, and `pendingStartPrompt`.

**Implementation**
- Refactor [App.tsx](/D:/Проекты/gantt-lib-mcp/packages/web/src/App.tsx) to own a single workspace-mode state instead of multiple overlapping booleans.
- Move start-screen visibility to `workspace.kind === 'draft'` or guest-empty rules, not `tasks.length === 0`.
- Make `handleCreateProject` enter draft mode only:
  - clear workspace-local chat/task presentation state
  - do not call backend create
  - do not leave previous `auth.project` implicitly driving the screen
- Make project switching an explicit transition back to `{ kind: 'project', projectId }`.
- Update [ProjectSwitcher.tsx](/D:/Проекты/gantt-lib-mcp/packages/web/src/components/ProjectSwitcher.tsx) so the current item can represent draft mode cleanly instead of pretending an existing project is still active.

**Done when**
- start screen is shown because the app is in draft mode, not because tasks are empty
- an existing empty project still opens the normal workspace shell
- switching projects cannot accidentally recreate draft state

## Wave 2: Implement Deterministic First-Action Activation Transaction

**Objective:** first prompt and empty-chart actions activate draft mode in one ordered flow.

**Implementation**
- Introduce one activation path in [App.tsx](/D:/Проекты/gantt-lib-mcp/packages/web/src/App.tsx), e.g. `activateDraftWorkspace({ firstPrompt? , createEmptyChart? })`.
- Order the transaction strictly:
  1. lock draft activation against re-entry/double submit
  2. create backend project once via [useAuth.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useAuth.ts)
  3. switch to the created project and update auth state
  4. transition workspace to active project with chat open
  5. render empty gantt shell immediately
  6. send queued first prompt exactly once after activation/WS readiness
- Remove the current split logic where creation, switching, chat-open, and prompt-send happen across unrelated effects.
- Keep first prompt ownership in one place; no duplicate send from both handler and effect.
- Make `empty chart` follow the same activation path, minus prompt send.

**Hook adjustments**
- [useWebSocket.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useWebSocket.ts): preserve the “send only when connected” contract, but let `App.tsx` own the queued first message lifecycle.
- [useTasks.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts): ensure task fetch on token/project switch is compatible with activation and does not force UI back to draft.

**Done when**
- one click on `Новый проект` + one prompt submission creates one project
- chat opens on first send, not second
- no transition snaps back to start screen during create/switch/load
- first prompt is preserved and emitted once

## Wave 3: Stabilize Task Loading, Autosave, and Sidebar Count Sync

**Objective:** keep active-project metadata synchronized with live task mutations.

**Implementation**
- Use [useAuth.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useAuth.ts) `syncProjectTaskCount(projectId, taskCount)` as the client-side source of immediate sidebar updates.
- In [App.tsx](/D:/Проекты/gantt-lib-mcp/packages/web/src/App.tsx), add a narrow effect keyed to active authenticated project plus current `tasks.length` to sync the active project count immediately.
- Ensure count sync happens on:
  - initial fetch of project tasks
  - websocket task replacement
  - manual add/delete/reorder/import flows
  - empty-chart creation
  - full replacement after autosave-backed edits
- Keep this sync metadata-only; do not re-fetch projects list after every task edit.
- Review [useAutoSave.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useAutoSave.ts) token-switch skip logic so activation resets do not overwrite the just-created project.
- Confirm [useTasks.ts](/D:/Проекты/gantt-lib-mcp/packages/web/src/hooks/useTasks.ts) does not hide a valid empty project behind loading/clear side effects.

**Done when**
- sidebar count updates immediately while editing the active project
- reselecting the same project after task creation shows the correct count without reload
- autosave and task fetch do not regress project activation

## Wave 4: Cleanup and Guard Rails

**Objective:** remove obsolete coupling and make regressions harder.

**Implementation**
- Delete `pendingNewProject` / `pendingStartPrompt` flow once the workspace state replaces it.
- Collapse project-change effects in [App.tsx](/D:/Проекты/gantt-lib-mcp/packages/web/src/App.tsx) so they reset only the state that truly belongs to the old project.
- Keep chat history loading scoped to active project mode; it must not clear draft mode or consume a queued first prompt.
- Add lightweight comments near the workspace-state transitions documenting the allowed transitions.

## Verification

### Manual regression checks

1. Draft creation:
   - Click `Новый проект`
   - Confirm no backend project is created yet
   - Confirm previous project is no longer treated as the active workspace
   - Confirm start screen is visible in draft mode

2. First prompt activation:
   - From draft mode, submit one prompt
   - Confirm exactly one project is created
   - Confirm chat opens immediately
   - Confirm empty gantt shell/grid is visible immediately
   - Confirm the prompt is sent once and the app does not bounce back to the start screen

3. Empty chart activation:
   - From draft mode, choose empty chart
   - Confirm exactly one project is created
   - Confirm workspace opens without requiring a second interaction
   - Confirm a placeholder/manual-editable chart appears

4. Existing empty project:
   - Switch to a real project with zero tasks
   - Confirm the normal workspace shell remains visible
   - Confirm it is not mistaken for draft mode

5. Sidebar count sync:
   - Add a task, delete a task, import/replace tasks, and receive websocket task updates
   - Confirm the active project `taskCount` updates immediately in the sidebar
   - Re-select the same project and confirm the count remains correct without page reload

6. Project switching regression:
   - Switch among existing projects after using draft mode
   - Confirm tasks, messages, and active project identity stay aligned

### Build/regression checks

- Run web build after refactor and fix all TypeScript errors.
- Smoke-test authenticated flow, guest flow, and read-only share flow.
- Verify no duplicate websocket chat submission occurs during activation.
- Verify autosave does not overwrite freshly loaded tasks on project switch.

## Success Criteria

- Draft mode is explicit and backend-free until first action.
- First action activation is deterministic, single-shot, and ordered.
- Empty project and draft project are different states in both logic and UI.
- Active project sidebar `taskCount` reflects current tasks live.
- Existing auth, websocket, autosave, and project switching flows still work.
