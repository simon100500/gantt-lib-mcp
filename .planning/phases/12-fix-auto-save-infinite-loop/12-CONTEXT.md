# Phase 12: fix-auto-save-infinite-loop - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning
**Source:** User-reported infinite loop bug

## Phase Boundary

Fix infinite loop in auto-save mechanism that causes PUT /api/tasks requests every ~1 second even when user is not editing tasks.

## Implementation Decisions

### Root Cause (Confirmed)

**Infinite loop pattern:**
1. `useAutoSave` triggers → PUT /api/tasks
2. PUT response causes state change → `setTasks` called again
3. Loop repeats every ~1 second

**Started after:** quick-020 enabled `autoSchedule=true` by default

### Suspected Causes (to verify)

**1. GanttChart calls onChange even without data changes**

gantt-lib may call `onChange` with same tasks (new array reference) when:
- Internal state recalculates
- `onCascade` called on every render
- `disableConstraints={!autoSchedule}` triggers recalculation

**2. useAutoSave response triggers setTasks**

App.tsx:143-148:
```typescript
const handleCascade = useCallback((shiftedTasks: Task[]) => {
  setTasks(prev => {
    const map = new Map(shiftedTasks.map(t => [t.id, t]));
    return prev.map(t => map.get(t.id) ?? t);
  });
}, [setTasks]);
```

If gantt-lib calls `onChange` after cascade with "updated" tasks (same data, new reference), this triggers `useAutoSave` → infinite loop.

**3. JWT expired (secondary issue)**

Token expires after 15 minutes, refresh should auto-trigger. `useTasks` calls `refreshAccessToken()` on 401, but something may be wrong.

## Required Fixes

### 1. Find infinite loop source
- React DevTools Profiler + console.log tracing
- Identify exact trigger chain

### 2. Fix useAutoSave to not trigger on identical data
- Deep compare vs reference compare?
- Add content hash check?

### 3. Remove excessive console.log from auth middleware
- auth-middleware.ts:70, 78, 85
- auth-store.ts:274, 287

### 4. Add session cache to authStore
- Don't query DB on every request
- In-memory cache with TTL

## Related Files

- `packages/web/src/hooks/useAutoSave.ts` - 500ms debounce hook
- `packages/web/src/hooks/useAuth.ts` - auth state with refreshAccessToken
- `packages/web/src/App.tsx` - handleCascade, autoSchedule toggle
- `packages/server/src/middleware/auth-middleware.ts` - debug logs
- `packages/mcp/src/auth-store.ts` - DB session lookup

## Claude's Discretion

- Implementation approach for preventing duplicate saves
- Cache TTL duration for sessions
- Whether to keep minimal logging or remove all debug logs

---

*Phase: 12-fix-auto-save-infinite-loop*
*Context gathered: 2026-03-09 from user bug report*
