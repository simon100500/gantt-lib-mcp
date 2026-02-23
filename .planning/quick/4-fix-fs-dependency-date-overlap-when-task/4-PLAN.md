---
phase: quick-4-fix-fs-dependency-date-overlap
plan: 4
type: execute
wave: 1
depends_on: []
files_modified: [src/scheduler.ts, src/scheduler.test.ts]
autonomous: true
requirements: []
must_haves:
  truths:
    - "When Task A ends on date X and Task B has FS dependency on A, Task B starts on X+1 (no overlap)"
    - "Visual Gantt chart rendering shows tasks sequentially without date collision"
    - "Existing lag behavior is preserved (lag adds on top of the +1 base offset)"
  artifacts:
    - path: "src/scheduler.ts"
      provides: "FS dependency calculation with +1 day offset"
      contains: "case 'FS':"
    - path: "src/scheduler.test.ts"
      provides: "Updated tests expecting X+1 start dates"
  key_links:
    - from: "scheduler.ts applyDependency()"
      to: "FS case"
      via: "addDays with lag + 1"
      pattern: "addDays\\(predecessor\\.endDate, lag \\+ 1\\)"
---

<objective>
Fix FS dependency date overlap - when task A ends on date X and task B starts on same day with FS dependency, task B should start on X+1 to avoid visual overlap on Gantt chart.

Purpose: Prevent date collision in Gantt chart visualization when tasks have Finish-Start dependencies. Currently, dependent tasks start on the same day as predecessor ends, causing visual overlap.

Output: Updated scheduler.ts with FS dependencies using +1 day offset, updated tests reflecting correct behavior.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/scheduler.ts
@src/scheduler.test.ts
@src/types.ts

# Current behavior (BUG):
# Task A: 2026-02-01 to 2026-02-05 (5 days)
# Task B with FS on A: starts 2026-02-05 (SAME DAY - OVERLAP!)

# Expected behavior:
# Task A: 2026-02-01 to 2026-02-05 (5 days)
# Task B with FS on A: starts 2026-02-06 (NEXT DAY - NO OVERLAP)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix FS dependency calculation in scheduler.ts</name>
  <files>src/scheduler.ts</files>
  <action>
    Modify the FS dependency case in applyDependency() method (line ~101-102):

    Current code:
    ```typescript
    case 'FS': // Finish-Start: dependent starts when predecessor finishes
      return { startDate: this.addDays(predecessor.endDate, lag) };
    ```

    Change to:
    ```typescript
    case 'FS': // Finish-Start: dependent starts the day after predecessor finishes
      return { startDate: this.addDays(predecessor.endDate, (lag || 0) + 1) };
    ```

    Also update applyDependencyWithUpdates() method (line ~140-141) with the same fix.

    This ensures:
    - Task B starts on X+1 when Task A ends on date X (lag=0)
    - Lag is additive: lag=2 means Task B starts on X+1+2 = X+3
    - No visual overlap on Gantt chart
  </action>
  <verify>
    <automated>grep -n "case 'FS'" src/scheduler.ts | grep "+ 1"</automated>
  </verify>
  <done>FS dependency calculation adds +1 day offset to prevent date overlap</done>
</task>

<task type="auto">
  <name>Task 2: Update tests to expect X+1 behavior</name>
  <files>src/scheduler.test.ts</files>
  <action>
    Update test expectations in scheduler.test.ts to reflect the new +1 day behavior:

    1. Line 56: Change `'2026-02-05'` to `'2026-02-06'` (A ends 02-05, B starts 02-06)
    2. Line 58: Change `'2026-02-09'` to `'2026-02-10'` (duration preserved)
    3. Line 197: Change `'2026-02-05'` to `'2026-02-06'`
    4. Line 201: Change `'2026-02-09'` to `'2026-02-10'`
    5. Line 394: Change `'2026-02-20'` to `'2026-02-21'`
    6. Line 419: Change `'2026-02-05'` to `'2026-02-06'`

    Update test comments where needed to reflect new behavior.
    Also update line 162 comment from "A's end + 2 days" to "A's end + 1 + 2 lag days"
  </action>
  <verify>
    <automated>node --test src/scheduler.test.ts</automated>
  </verify>
  <done>All tests pass with updated X+1 FS dependency expectations</done>
</task>

</tasks>

<verification>
1. Run tests: `node --test src/scheduler.test.ts` - all tests pass
2. Verify FS dependency: Task ending on 2026-02-05 leads dependent to start on 2026-02-06
3. Verify lag: lag=2 still works, now adds 2+1=3 days from predecessor end
</verification>

<success_criteria>
- FS dependencies add +1 day offset by default
- Task dependent on predecessor ending date X starts on X+1 (no overlap)
- Lag behavior preserved (lag=2 means X+1+2 = X+3)
- All tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/4-fix-fs-dependency-date-overlap-when-task/4-SUMMARY.md`
</output>
