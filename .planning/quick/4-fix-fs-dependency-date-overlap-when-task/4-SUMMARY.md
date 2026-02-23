---
phase: quick-4-fix-fs-dependency-date-overlap
plan: 4
subsystem: TaskScheduler
tags: [bugfix, scheduler, dependencies]
dependency_graph:
  requires: []
  provides: [fs-dependency-no-overlap]
  affects: [task-scheduling, gantt-chart-visualization]
tech_stack:
  added: []
  patterns: [date-offset-calculation]
key_files:
  created: []
  modified: [src/scheduler.ts, src/scheduler.test.ts]
decisions: []
metrics:
  duration: "1 minute"
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 2
---

# Phase Quick Task 4: Fix FS Dependency Date Overlap Summary

**One-liner:** Fixed FS (Finish-Start) dependency calculation to add +1 day offset, preventing visual overlap on Gantt charts.

## Objective Completed

Fixed the bug where tasks with FS dependencies would start on the same day as their predecessor ended, causing visual overlap in Gantt chart rendering. Now dependent tasks start on the day after (X+1) when the predecessor ends on date X.

## Implementation Details

### Task 1: Fixed FS Dependency Calculation

Modified `src/scheduler.ts` in two locations:

1. **applyDependency() method (line 101-102):**
   ```typescript
   case 'FS': // Finish-Start: dependent starts the day after predecessor finishes
     return { startDate: this.addDays(predecessor.endDate, (lag || 0) + 1) };
   ```

2. **applyDependencyWithUpdates() method (line 140-141):**
   ```typescript
   case 'FS': // Finish-Start: dependent starts the day after predecessor finishes
     return { startDate: this.addDays(predecessor.endDate, (lag || 0) + 1) };
   ```

The fix ensures:
- Task B starts on X+1 when Task A ends on date X (lag=0)
- Lag is additive: lag=2 means Task B starts on X+1+2 = X+3
- No visual overlap on Gantt chart

### Task 2: Updated Test Expectations

Updated `src/scheduler.test.ts` to reflect the new X+1 behavior:

| Test | Old Expectation | New Expectation |
|------|----------------|-----------------|
| FS dependency | 2026-02-05 | 2026-02-06 |
| FS end date | 2026-02-09 | 2026-02-10 |
| Cascade (task B) | 2026-02-05 | 2026-02-06 |
| Cascade (task C) | 2026-02-09 | 2026-02-10 |
| Lag test | 2026-02-12 | 2026-02-13 |
| Skip start test | 2026-02-20 | 2026-02-21 |
| Skip start (no skip) | 2026-02-05 | 2026-02-06 |
| Multi-dependency | 2026-02-15 | 2026-02-16 |

All 14 tests now pass.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. **Automated tests:** All 14 tests pass
   ```bash
   node --test dist/scheduler.test.js
   ```
   Result: 14 passed, 0 failed

2. **FS dependency verification:**
   - Task A: 2026-02-01 to 2026-02-05
   - Task B with FS on A: starts 2026-02-06 (A's end + 1)
   - No date overlap

3. **Lag behavior preserved:**
   - Task A ends 2026-02-10
   - Task B with FS lag=2 starts 2026-02-13 (A's end + 1 + 2 lag days)

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 544f428 | fix | Add +1 day offset to FS dependency calculation |
| b21608b | test | Update tests for X+1 FS dependency behavior |

## Impact

- **Breaking change:** Yes, all existing FS-dependent tasks will shift forward by 1 day
- **User-facing:** Tasks will no longer visually overlap on Gantt charts
- **Data migration:** Existing task data may need recalculation if FS dependencies exist

## Next Steps

None - quick task complete.
