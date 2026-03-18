# Deferred Items - Phase 17 Token Economy

## Pre-existing Build Issues (Out of Scope for Plan 17-02)

**Issue:** TypeScript compilation errors in `packages/mcp/src/index.ts`

**Root cause:** Incomplete implementation of plan 17-01 (compact mode, pagination for get_tasks/get_task)

**Errors:**
- Property 'filter', 'length', 'map' does not exist on type '{ tasks: Task[]; hasMore: boolean; total: number; }'
- Multiple implicit 'any' type errors

**Files affected:**
- `packages/mcp/src/index.ts` (has uncommitted changes)
- `packages/mcp/src/services/task.service.ts` (has uncommitted changes with new list() signature)

**Status:** Deferred - not caused by plan 17-02 changes

**Next steps:**
- Execute plan 17-01 first to complete the TaskService.list() refactoring
- OR commit/stash the incomplete 17-01 changes before executing 17-02
- The MessageService.list() changes in 17-02 are independent and compile successfully

**Verification:** `packages/mcp/src/services/message.service.ts` compiles without errors
