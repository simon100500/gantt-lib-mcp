---
id: T01
parent: S10
milestone: M001
provides:
  - MCP child process with PROJECT_ID env injection so tasks are stored with correct project scope
  - Streaming dedup guard to prevent duplicate AI response broadcasts
  - includeGlobal broadcast so Gantt chart shows correct task set after AI commands
  - System prompt without JSON export instruction — AI responds with 1-2 sentence confirmations
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 2min
verification_result: passed
completed_at: 2026-03-07
blocker_discovered: false
---
# T01: 10-work-stability 01

**# Phase 10 Plan 01: Work Stability Bug Fixes Summary**

## What Happened

# Phase 10 Plan 01: Work Stability Bug Fixes Summary

**Three silent data-corruption and chat-UX bugs fixed: AI tasks now stored with correct project_id, Gantt chart updates correctly after AI commands, and assistant responses appear exactly once as readable text.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T08:19:42Z
- **Completed:** 2026-03-07T08:22:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Bug 3 fixed: MCP child process now receives PROJECT_ID via env injection; tasks created by AI are stored with the correct project scope rather than NULL
- Bug 3c fixed: Broadcast after agent turn uses taskStore.list(projectId, true) to include global tasks, matching HTTP GET behavior and preventing Gantt chart emptying
- Bug 4 fixed: streamedContent boolean guard prevents duplicate broadcast of assistant text (SDK fires AssistantMessage for both streaming chunks and the final summary message)
- Bug 5 fixed: system.md rewritten — removed step 5 (export_tasks/JSON output), added Response Format section requiring 1-2 sentence confirmations with no JSON in chat

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite system.md** - `fcd647e` (fix)
2. **Task 2: Fix agent.ts — PROJECT_ID, dedup guard, includeGlobal** - `3f1e421` (fix)
3. **Task 3: Fix mcp/index.ts — process.env.PROJECT_ID fallback** - `e832c75` (fix)

## Files Created/Modified
- `packages/mcp/agent/prompts/system.md` - Rewritten: removed export_tasks workflow step and JSON output section, added Response Format with 1-2 sentence confirmation rule
- `packages/server/src/agent.ts` - Three fixes: PROJECT_ID env injection into MCP child process, streamedContent dedup guard in streaming loop, includeGlobal=true in broadcast
- `packages/mcp/src/index.ts` - Two fixes: create_task uses resolvedProjectId = argProjectId ?? process.env.PROJECT_ID; create_tasks_batch passes process.env.PROJECT_ID to taskStore.create

## Decisions Made
- Use env injection (PROJECT_ID in mcpServers env config) to scope MCP child process to current project — cleaner than passing per-call args since child process runs independently
- streamedContent boolean flag approach: skip the final AssistantMessage event if tokens were already streamed, as the SDK fires isSDKAssistantMessage for both partial stream events and the final complete message
- taskStore.list(projectId, true) with includeGlobal=true in broadcast to match what the HTTP GET endpoint returns, preventing the Gantt chart from appearing empty after AI operations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The system.md verification criterion ("grep returns 0") contradicts the plan's own new content template, which includes "Do NOT call export_tasks" — the word export_tasks appears in the negative instruction. The file is correct; the old broken instruction ("Call export_tasks as the final step") was removed and replaced with the prohibitive "Do NOT call export_tasks unless the user explicitly asks."

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three bugs (Bug 3, Bug 4, Bug 5) are fixed and both TypeScript packages compile cleanly
- AI commands will now create tasks scoped to the correct project_id
- Gantt chart will update in real-time with the correct task set after AI turns
- Assistant responses appear exactly once as concise readable text (no duplicate messages, no JSON dumps)

---
*Phase: 10-work-stability*
*Completed: 2026-03-07*
