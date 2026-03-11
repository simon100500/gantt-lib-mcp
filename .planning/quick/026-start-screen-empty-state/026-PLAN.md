---
phase: quick
plan: 26
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/useLocalTasks.ts
  - packages/web/src/App.tsx
autonomous: true
requirements:
  - QUICK-026: Remove default demo project for unauthenticated users and show the existing start screen when local storage is empty
---

<objective>
Stop seeding guest users with demo tasks and let the existing empty-state start screen appear when local storage has no saved chart data.

Purpose: unauthenticated users should land on the same start screen used for an empty project instead of being forced into a demo project.
Output: guest local-task initialization returns an empty task list by default, and the app still routes empty guest state to StartScreen without breaking project-name or empty-chart flows.
</objective>

<context>
@.planning/STATE.md
@packages/web/src/hooks/useLocalTasks.ts
@packages/web/src/App.tsx
@packages/web/src/components/StartScreen.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove demo-task bootstrap from guest local storage</name>
  <files>packages/web/src/hooks/useLocalTasks.ts</files>
  <action>
Replace the current demo-project initialization path with a true empty-state path:

1. Remove the hard-coded DEMO_TASKS seed data and any logic that treats missing local storage as "demo mode".
2. Make loadInitialState return an empty task array when no saved tasks exist, while still preserving the stored guest project name default.
3. Keep local task persistence straightforward: setTasks should always write the latest guest task array to localStorage, including an empty array after all tasks are removed.
4. Remove obsolete demo-mode-only comments, flags, or branching if they are no longer needed after this change.
  </action>
  <verify>
    <automated>rg -n "DEMO_TASKS|gantt_demo_mode|show demo project|demo project" packages/web/src/hooks/useLocalTasks.ts</automated>
  </verify>
  <done>
    - Missing guest local-storage data no longer produces seeded demo tasks
    - Guest task state initializes as [] with the existing default project name
    - Guest edits still persist back to localStorage through setTasks
  </done>
</task>

<task type="auto">
  <name>Task 2: Keep App empty-state routing aligned with the new guest initialization</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Review and adjust App.tsx only where needed so the existing StartScreen renders for unauthenticated users with zero local tasks:

1. Confirm the main branch `tasks.length === 0 && !loading && !hasStartedChat` remains the gate for StartScreen.
2. Remove or simplify any guest/demo-specific assumptions that depended on demo mode being true on first load.
3. Preserve the current Empty Chart action, chat-start behavior, guest project rename flow, and login import behavior for real local tasks.

Do not change StartScreen.tsx unless the review reveals a concrete mismatch with the new empty-state flow.
  </action>
  <verify>
Open the app as a guest with cleared `gantt_local_tasks`. Verify the start screen appears immediately, "Пустой график" still creates the first placeholder task, and reloading after guest edits restores the saved chart instead of the start screen.
  </verify>
  <done>
    - Guest first load with empty storage shows StartScreen
    - Creating a task from the start screen exits the empty state normally
    - Reloading with saved guest tasks restores the chart instead of the start screen
  </done>
</task>

</tasks>

<success_criteria>
- [ ] Unauthenticated users no longer receive a seeded demo project on first visit
- [ ] Empty guest local storage shows the existing StartScreen
- [ ] Guest-created tasks persist and reload correctly from localStorage
- [ ] Empty-chart entry point from StartScreen still works
</success_criteria>

<output>
After completion, create `.planning/quick/026-start-screen-empty-state/026-SUMMARY.md`
</output>
