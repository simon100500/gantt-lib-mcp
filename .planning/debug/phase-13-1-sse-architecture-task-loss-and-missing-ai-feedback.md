---
status: awaiting_human_verify
trigger: "Investigate issue: phase-13-1-sse-architecture-task-loss-and-missing-ai-feedback"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:32:00Z
---

## Current Focus
hypothesis: ROOT CAUSE FOUND AND PATCHED
test: Server build plus web TypeScript compile; inspect end-to-end task and AI stream routing after code changes
expecting: Tasks persist and AI events reach chat once the app is exercised in the real browser workflow
next_action: user needs to run the phase 13.1 app flow and verify task creation + chat feedback in the real environment

## Symptoms
expected: Tasks created through chat should persist in the database and remain visible in the Gantt. AI response should stream or appear in chat. Gantt should receive updates after task creation/modification.
actual: Tasks are deleted or disappear after creation. User reports no feedback/response in chat and no response in Gantt. Existing notes mention DELETE/INSERT loops and cases where AI only writes text without tool calls.
errors: Prior logs include repeated "[pg-listener] Notification missing project_id" and reports of no MCP tool calls for task creation.
reproduction: Use the phase 13.1 SSE architecture app flow. Send a chat message that should create a task schedule/project. Observe whether tools are called, whether tasks persist, whether SSE broadcasts happen, and whether chat receives AI events.
started: Phase 13.1 implementation exists but user says it still does not work. There are already uncommitted local changes in this area; do not discard them blindly. Work with current state.

## Eliminated

## Evidence

- timestamp: 2026-03-11T00:03:00Z
  checked: packages/server/src/agent.ts
  found: Agent token, error, task, and done events are all broadcast with broadcastToProject(projectId, ...)
  implication: AI chat clients connected through /stream/ai cannot receive assistant tokens because they are not listening on the project task stream

- timestamp: 2026-03-11T00:04:00Z
  checked: packages/server/src/sse.ts
  found: /stream/ai stores connections in aiConnections keyed by sessionId, and the only writer for that registry is broadcastToAI(sessionId, ...)
  implication: The current agent stream path is disconnected from the actual AI SSE endpoint

- timestamp: 2026-03-11T00:05:00Z
  checked: packages/web/src/hooks/useAIStream.ts
  found: The web client posts to /api/chat and then opens /stream/ai, waiting for SSE messages from that endpoint
  implication: Missing chat feedback is explained even if the agent generates text, because the client is subscribed to a different stream than the server writes to

- timestamp: 2026-03-11T00:06:00Z
  checked: packages/web/src/hooks/useAutoSave.ts and packages/server/src/index.ts
  found: Autosave debounces every task-state change into PUT /api/tasks, and the server handles PUT /api/tasks by calling taskStore.importTasks(JSON.stringify(tasks), projectId), which deletes all project tasks before reinserting the provided array
  implication: Any stale client task snapshot can erase newly created server tasks, producing the reported disappearance/delete loop symptom

- timestamp: 2026-03-11T00:07:00Z
  checked: packages/mcp/src/store.ts
  found: importTasks() starts by db.task.deleteMany({ where: { projectId } }) and then recreates rows from the provided payload
  implication: This confirms the overwrite mechanism is destructive replacement, not incremental merge

- timestamp: 2026-03-11T00:08:00Z
  checked: current worktree state
  found: Local modifications already exist in packages/server/src/agent.ts, packages/mcp/agent/prompts/system.md, packages/mcp/src/index.ts, packages/server/package.json, plus new migrations and gantt-tools.ts
  implication: I must preserve and build on these changes rather than reverting to earlier hypotheses

- timestamp: 2026-03-11T00:12:00Z
  checked: packages/server/src/pg-listener.ts and packages/web/src/App.tsx
  found: pg-listener ignores the notification payload contents and always broadcasts `{ type: 'tasks', tasks: [] }`, while the client replaces local tasks with `msg.tasks`
  implication: Any insert/update/delete notification can immediately blank the UI, which matches the "tasks disappear after creation" symptom

- timestamp: 2026-03-11T00:13:00Z
  checked: packages/web/src/hooks/useAutoSave.ts plus packages/mcp/src/store.ts importTasks()
  found: After the UI is blanked by an empty SSE payload, autosave can send `PUT /api/tasks` with `[]`, and importTasks() deletes all project tasks before reinserting the provided payload
  implication: The empty SSE broadcast escalates from a UI flicker into actual data loss in the database

- timestamp: 2026-03-11T00:25:00Z
  checked: patched server/web files
  found: agent.ts now broadcasts token/done/error events to broadcastToAI(sessionId, ...); index.ts emits chat errors on AI stream too; pg-listener.ts now broadcasts fetched task snapshots instead of empty arrays; App.tsx/useAutoSave.ts now suppress autosave for server-pushed task updates
  implication: The confirmed stream mismatch and destructive echo-save path are both addressed in code

- timestamp: 2026-03-11T00:27:00Z
  checked: build verification
  found: `cmd /c npm.cmd run build --workspace=packages/server` succeeded and `cmd /c npx.cmd tsc -p packages/web/tsconfig.json` succeeded
  implication: Patched code compiles in the affected server and web TypeScript surfaces

- timestamp: 2026-03-11T00:28:00Z
  checked: full web build attempt
  found: `cmd /c npm.cmd run build --workspace=packages/web` failed inside Vite/esbuild with `spawn EPERM`
  implication: This is an environment/sandbox process-spawn limitation during bundling, not a TypeScript compile failure in the edited code

## Resolution
root_cause: |
  There were multiple real bugs in the current worktree:
  1. `packages/server/src/pg-listener.ts` broadcast `{ type: 'tasks', tasks: [] }` for every PostgreSQL NOTIFY event instead of the actual task snapshot. The web app treated that empty array as authoritative and cleared the chart.
  2. `packages/web/src/hooks/useAutoSave.ts` then echoed the server-pushed empty task state back through `PUT /api/tasks`, and `taskStore.importTasks()` destructively replaces all project tasks, turning the transient empty UI state into actual DB deletions.
  3. `packages/server/src/agent.ts` streamed AI token/done events on the project task stream instead of the dedicated `/stream/ai` registry (`broadcastToAI(sessionId, ...)`), so chat subscribers never received AI feedback even when the agent produced output.
  4. Chat error events were also not delivered on the AI stream, and the client could miss early tokens if it subscribed after posting `/api/chat`.
fix: |
  Applied targeted fixes:
  1. `packages/server/src/pg-listener.ts` now fetches and broadcasts the real task snapshot for the project on notifications.
  2. `packages/web/src/App.tsx` and `packages/web/src/hooks/useAutoSave.ts` now mark server-sourced task updates and suppress the next autosave, preventing destructive echo-import loops.
  3. `packages/server/src/agent.ts` now sends AI token/done/error events through `broadcastToAI(sessionId, ...)`, while keeping task snapshots on the project task stream.
  4. `packages/server/src/index.ts` now forwards agent failures to the AI stream, and `packages/web/src/hooks/useAIStream.ts` opens `/stream/ai` before triggering `/api/chat` so fast responses are not lost.
verification: |
  Self-verified:
  - Server package build passed.
  - Web TypeScript compile passed.
  - Code-path inspection confirms task updates and AI events now route to the correct SSE consumers.
  Pending human verification:
  - Run the real phase 13.1 chat/task workflow and confirm tasks persist, Gantt updates, and AI feedback appears.
files_changed:
  - packages/server/src/agent.ts
  - packages/server/src/index.ts
  - packages/server/src/pg-listener.ts
  - packages/web/src/App.tsx
  - packages/web/src/hooks/useAIStream.ts
  - packages/web/src/hooks/useAutoSave.ts
