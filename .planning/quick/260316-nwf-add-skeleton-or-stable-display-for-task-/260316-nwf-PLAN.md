---
phase: quick-260316-nwf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ProjectSwitcher.tsx
autonomous: true
requirements:
  - UI-task-count-hide-zero
  - UI-task-count-stable-layout
must_haves:
  truths:
    - "Task count is hidden when it equals 0 (empty projects show no count)"
    - "Task count displays a stable width placeholder when undefined (prevents layout shift during loading)"
    - "Task count shows the actual number when it's greater than 0"
  artifacts:
    - path: "packages/web/src/components/ProjectSwitcher.tsx"
      provides: "Task count display with zero-hiding and stable loading state"
      contains: "taskCount > 0"
  key_links:
    - from: "packages/web/src/components/ProjectSwitcher.tsx"
      to: "Project list display"
      via: "taskCount conditional rendering"
      pattern: "taskCount > 0"
---

<objective>
Fix task count display in the project sidebar to:
1. Hide the count when it's 0 (empty projects should not show "0")
2. Show a stable-width placeholder when taskCount is undefined during loading (prevents layout shift)

Purpose: Improve UX by not showing meaningless "0" counts and prevent jarring layout shifts when data loads.
Output: Updated ProjectSwitcher.tsx with improved task count rendering.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/components/ProjectSwitcher.tsx
@packages/web/src/hooks/useAuth.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update task count display to hide zero and show stable placeholder</name>
  <files>packages/web/src/components/ProjectSwitcher.tsx</files>
  <action>
In packages/web/src/components/ProjectSwitcher.tsx, update the task count display logic (around line 64-66):

Current code:
```tsx
{p.taskCount !== undefined && (
  <span className="text-xs text-slate-400 shrink-0">{p.taskCount}</span>
)}
```

Replace with:
```tsx
{p.taskCount === undefined ? (
  <span className="text-xs text-slate-200 shrink-0 w-4 text-center">—</span>
) : p.taskCount > 0 ? (
  <span className="text-xs text-slate-400 shrink-0">{p.taskCount}</span>
) : null}
```

This change:
1. Shows a light-colored dash "—" placeholder when taskCount is undefined (loading state)
2. Shows the actual count only when it's greater than 0
3. Hides the count completely when it's 0
4. Uses `w-4 text-center` to maintain stable width for the placeholder

The placeholder color `text-slate-200` is very light to indicate "loading/placeholder" state.
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp/packages/web && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - Task count hidden when value is 0
    - Stable placeholder (—) shown when taskCount is undefined
    - Actual count shown when greater than 0
    - No TypeScript compilation errors
  </done>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` in packages/web — no TypeScript errors
2. Visually verify in browser:
   - Empty projects (0 tasks) don't show a count
   - Projects with tasks show the count
   - During loading (before API returns), a light dash placeholder appears
</verification>

<success_criteria>
- Projects with 0 tasks show no task count badge
- Projects with >0 tasks show the count number
- Loading state shows a stable-width "—" placeholder preventing layout shift
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/260316-nwf-add-skeleton-or-stable-display-for-task-/260316-nwf-SUMMARY.md`
</output>
