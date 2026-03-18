# Phase 22: Zustand Frontend Refactor - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/zustand-refactor-plan.md)

<domain>
## Phase Boundary

Refactor the frontend state architecture in `packages/web` so `App.tsx` stops acting as a monolith and cross-cutting UI, auth, task, and chat state moves into focused Zustand stores. The phase also extracts workspace-oriented components so `App.tsx` becomes a thin router over explicit workspace modes.

Deliverables inside this phase:
- install and adopt Zustand in `packages/web`
- create dedicated stores for auth, tasks, chat, and UI state
- remove the ad hoc global saving state/listener pattern from `useBatchTaskUpdate`
- move WebSocket message side effects to store writes via `getState()`
- split `App.tsx` into workspace/layout components with store-backed rendering

Out of scope for this phase:
- replacing `useWebSocket` or `useBatchTaskUpdate` wholesale
- refactoring `useTaskMutation`
- preserving old `useSharedProject`, `useTasks`, and `useLocalTasks` as first-class long-term APIs once task loading logic moves into the task store

</domain>

<decisions>
## Implementation Decisions

### State management architecture
- Use `zustand` in `packages/web` as the new client state layer.
- Do not introduce React Query; the PRD explicitly rejects it because full task replacement from WebSocket conflicts with cache semantics.
- Replace module-level mutable state patterns with Zustand stores and direct store access where cross-component synchronization is required.

### Auth store
- Create `src/stores/useAuthStore.ts`.
- `useAuthStore` fully replaces the current `useAuth` hook API surface.
- `useAuthStore` owns `user`, `project`, `projects`, `accessToken`, `isAuthenticated`, login/logout flows, project switching, token refresh, project creation, and task-count synchronization.
- Local storage sync, token refresh, and visibility listener behavior move into the auth store.
- Components should read auth values from `useAuthStore()` instead of `useAuth()`.

### Task store
- Create `src/stores/useTaskStore.ts`.
- `useTaskStore` becomes the single source of truth for task collections, load state, errors, and active task source.
- The store must absorb the current three-source selection logic for authenticated, local, and shared-project tasks.
- The store must expose `setTasks`, `replaceFromSystem`, `fetchTasks`, `loadLocal`, and `loadShared`.
- WebSocket-driven task replacement should use the store path that replaces tasks from the system.

### Chat store
- Create `src/stores/useChatStore.ts`.
- `useChatStore` owns chat messages, streaming text, and AI thinking state.
- The mutable module-level message counter must be removed and replaced with `crypto.randomUUID()` inside store message creation.

### UI store
- Create `src/stores/useUIStore.ts`.
- `useUIStore` owns workspace mode, sidebar/modal visibility, view mode, task-list visibility, auto-schedule toggle, expired-task highlighting, validation errors, share status, and saving state.
- `globalSavingState` from `useBatchTaskUpdate` must move into `useUIStore`.

### Save state migration
- Remove the custom module-level listener set from `useBatchTaskUpdate.ts`.
- Replace manual saving-state subscriptions with `useUIStore.getState().setSavingState(...)`.
- Components consume saving state through `useUIStore((s) => s.savingState)`.

### WebSocket integration
- Keep `useWebSocket` as a hook.
- Stop routing WebSocket side effects through `App.tsx` callback state that can go stale.
- WebSocket handlers should write directly to stores via `useTaskStore.getState()` and `useChatStore.getState()`.
- Handle `tasks`, `token`, `done`, and `error` messages through direct store updates.

### Component decomposition
- Reduce `src/App.tsx` to roughly a workspace router that renders `SharedWorkspace`, `GuestWorkspace`, `DraftWorkspace`, or `ProjectWorkspace`.
- Introduce workspace components under `src/components/workspace/`.
- Introduce layout-focused components such as `Toolbar` and `ProjectMenu` under `src/components/layout/`.
- `ProjectWorkspace` should mostly render existing building blocks and consume state from stores rather than re-owning orchestration logic.
- `Toolbar` should read only UI store state and actions, not auth or task data.

### Migration sequencing
- Execute the refactor incrementally so old hooks can coexist temporarily while state moves into stores.
- Recommended order from the PRD:
- install Zustand
- add chat store
- add UI store and migrate save state
- add auth store
- add task store
- migrate WebSocket handler to store access
- split `App.tsx` into workspace components

### Claude's Discretion
- Exact store creation helpers and middleware composition.
- Whether to colocate store side-effect helpers in the store file or nearby support modules.
- Exact component/file boundaries beyond the explicitly named workspace and layout components.
- Naming details for workspace mode types and save/share status unions where the current codebase suggests better local conventions.

</decisions>

<specifics>
## Specific Ideas

- `useAuthStore` interface should cover auth/session/project flows now provided by `useAuth`.
- `useTaskStore` should track `source: 'server' | 'local' | 'shared'`.
- `useChatStore` should expose `addMessage`, `appendToken`, `finishStreaming`, `setError`, and `reset`.
- `useUIStore` should expose `setWorkspace`, `openProjectChat`, `closeProjectChat`, and `setSavingState` plus the remaining UI setters.
- `ProjectWorkspace` should continue rendering `GanttChart` and `ChatSidebar`, with task changes still delegated to `useBatchTaskUpdate`.

</specifics>

<deferred>
## Deferred Ideas

- Full replacement of `useWebSocket` with a non-hook transport layer
- Full rewrite of `useBatchTaskUpdate`
- Changes to `useTaskMutation`

</deferred>

---

*Phase: 22-zustand-frontend-refactor*
*Context gathered: 2026-03-18 via PRD Express Path*
