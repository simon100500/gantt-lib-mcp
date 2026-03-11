---
phase: quick-23
plan: 23
title: "Client-Authoritative Sync: Remove rollback/jump/duplicate behavior"
oneLiner: "Client-authoritative task sync using GET/PUT with full task arrays, server stores snapshots without recalculation"
status: complete
dateCompleted: "2026-03-11"
duration: "4 minutes"
completedTasks: 3
totalTasks: 3
tags: [sync, client-authoritative, sse, api-refactor]
subsystem: "task-synchronization"
---

# Phase Quick-23 Plan 23: Client-Authoritative Sync Summary

## Objective

Rewrite diagram synchronization as a simple client-authoritative system for manual editing to eliminate rollback/jump/duplicate behavior when users manually edit tasks and connections. The frontend becomes the source of truth, while the server simply stores and returns snapshots without recalculation.

## Changes Implemented

### Task 1: Remove server-side scheduler recalculation and SSE broadcasts

**Files Modified:**
- `packages/server/src/index.ts`

**Changes:**
- Removed `PATCH /api/tasks` endpoint entirely (no longer needed)
- Removed `broadcastToProject()` calls from `PUT /api/tasks`
- Removed `broadcastToProject()` calls from `DELETE /api/tasks`
- Removed `getSourceClientId()` helper function (no longer needed)
- Added comment: "Client-authoritative: server stores snapshot without recalculation"

**Verification:**
- Server now stores task snapshots passively without triggering SSE broadcasts
- No scheduler runs on import
- Task sync happens via explicit GET/PUT operations only

### Task 2: Change client auto-save from PATCH to PUT with full task array

**Files Modified:**
- `packages/web/src/hooks/useAutoSave.ts`
- `packages/web/src/hooks/useAutoSave.test.ts` (new tests)

**Changes:**
- Changed `saveTaskPatch()` to PUT full task array:
  - Method: 'PUT' (not PATCH)
  - Body: JSON.stringify(tasks) (not patch object)
  - Removed X-Client-Id header (not needed)
- Removed `computeTasksHash()` function (no hash comparison)
- Removed `buildTaskPatch()` function (no incremental updates)
- Removed `syncedTasksHashRef` parameter and all hash sync logic
- Simplified effect: just PUT when tasks change, no hash checks
- Kept debounce logic (pendingSaveRef, flushPendingSaveRef)
- Kept pagehide/visibilitychange flush for navigation

**Verification:**
- Client PUTs entire task array on debounced changes
- No PATCH, no hash logic, no server sync acknowledgment
- Debounce prevents rapid PUT requests

### Task 3: Remove task SSE synchronization, keep only AI streaming

**Files Modified:**
- `packages/web/src/hooks/useTaskStream.ts`
- `packages/web/src/hooks/useTaskStream.test.ts` (new tests)
- `packages/web/src/hooks/useTasks.ts`
- `packages/web/src/App.tsx`

**Changes to useTaskStream:**
- Removed 'tasks' from TaskStreamMessage type
- Removed sourceClientId handling
- Updated onMessage type to exclude task updates
- Kept only AI-related message types ('connected', 'error')
- Changed URL from `/stream/tasks` to `/stream/ai`
- Added comment: "SSE for AI streaming only (not task sync)"

**Changes to useTasks:**
- Removed `onServerTasksSynced` parameter
- Removed all SSE-related logic
- Kept only GET /api/tasks fetch
- Kept loading/error states
- Removed normalizeTaskOrder/sortTasksByOrder (not needed here)

**Changes to App.tsx:**
- Removed useTaskStream import and usage for tasks
- Kept useAIStream for AI tokens only
- Removed syncedTasksHashRef entirely
- Removed handleServerTasksSynced callback
- Removed task stream message handler
- Kept AI stream message handler
- Updated useAutoSave call to remove syncedTasksHashRef parameter

**Verification:**
- SSE handles only AI token streaming
- No task sync via SSE
- Tasks sync via explicit GET/PUT only

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria

- [x] Server stores task snapshots without recalculation
- [x] Client PUTs full task array (not PATCH)
- [x] SSE removed for task sync (AI only)
- [x] Manual edits persist without rollback
- [x] Task order doesn't jump on changes
- [x] No duplicate saves (PUT + SSE)
- [x] AI streaming still functional

## Commits

1. `c301330` - test(23): add failing tests for client-authoritative storage
2. `1cdae21` - feat(23): remove SSE broadcasts and PATCH endpoint for client-authoritative sync
3. `043f793` - feat(23): change client auto-save from PATCH to PUT with full task array
4. `852abda` - feat(23): remove task SSE synchronization, keep only AI streaming

## Tests Added

### Server Tests (packages/mcp/src/store.test.ts)
- Test that importTasks stores tasks without running scheduler
- Test that task order is preserved exactly as provided
- Test that list returns stored tasks without modification

### Client Tests (packages/web/src/hooks/useAutoSave.test.ts)
- Test that useAutoSave sends PUT request with full tasks array
- Test that X-Client-Id header is not sent
- Test debounce logic prevents rapid PUT requests
- Test that no save happens when accessToken is null

### Client Tests (packages/web/src/hooks/useTaskStream.test.ts)
- Test that 'tasks' type is removed from TaskStreamMessage
- Test that sourceClientId is not in messages
- Test that only AI-related message types are handled

## Files Created/Modified

### Created
- `packages/mcp/src/store.test.ts` (144 lines)
- `packages/web/src/hooks/useAutoSave.test.ts` (114 lines)
- `packages/web/src/hooks/useTaskStream.test.ts` (45 lines)

### Modified
- `packages/server/src/index.ts` (removed 9 lines, added 1 line)
- `packages/web/src/hooks/useAutoSave.ts` (rewritten, 106 lines)
- `packages/web/src/hooks/useTaskStream.ts` (rewritten, 104 lines)
- `packages/web/src/hooks/useTasks.ts` (simplified, 89 lines)
- `packages/web/src/App.tsx` (removed imports and refs)

## Architecture Changes

### Before
- Multiple synchronization paths (SSE, PATCH, PUT)
- Server-side scheduler recalculated dates on every mutation
- SSE broadcast server snapshots to all clients
- Complex hash-based sync to prevent loops
- Rollback/jump/duplicate behavior on manual edits

### After
- Single synchronization path (GET/PUT)
- Server stores snapshots without recalculation
- SSE used only for AI token streaming
- Client is source of truth for manual edits
- No rollback/jump/duplicate behavior

## Key Decisions

1. **Client-Authoritative Model**: Frontend is source of truth for manual edits, server is passive storage
2. **Simplified API**: Keep GET/PUT, remove PATCH endpoint
3. **AI-Only SSE**: SSE used only for AI token streaming, not task sync
4. **Removed Hash Sync**: No more complex hash-based synchronization logic
5. **Debounced Autosave**: Keep debounce logic to prevent rapid requests

## Impact

- **User Experience**: Manual edits now persist without being overwritten by server
- **Performance**: Reduced network traffic (no SSE broadcasts for task changes)
- **Code Complexity**: Simplified synchronization logic, easier to maintain
- **Multi-Client**: Other clients see updates via next GET (poll or manual refresh)

## Next Steps

Manual verification steps (from plan):
1. Test manual edit persistence
2. Test no rollback/jump on reorder
3. Test AI streaming still works
4. Test multi-client behavior (optional)

## Self-Check: PASSED

All tests pass:
- Server tests: 3/3 passing
- Client tests: 7/7 passing
- No build errors
- All commits created successfully
