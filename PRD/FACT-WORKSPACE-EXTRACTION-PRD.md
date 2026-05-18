# PRD: Separate Fact Workspace

## Reader And Outcome

Reader: internal engineer working on the project workspace UI.

Post-read action: implement a separate Fact workspace tab while preserving the current plan-fact behavior, existing progress-entry persistence, and the shared task volume editor.

## Problem

The Fact mode started as a display variant inside the main project schedule workspace. That was acceptable for a first pass because it reused the same task state, progress-entry handlers, read-only guards, task columns, and Gantt wrapper.

The mode now has its own product shape:

- It is selected from the top-level project workspace tabs.
- It hides a large part of the normal schedule toolbar.
- It uses a different `gantt-lib` chart mode.
- It has a different required task-list column set.
- It edits daily fact values, not schedule bars.
- It reuses the standard task volume editor, but only for total work volume.

Keeping this behavior embedded in the main schedule workspace will make both modes harder to reason about. Future Fact-specific behavior should not keep adding conditionals to the normal schedule workspace.

## Goals

1. Move Fact mode into a dedicated workspace component.
2. Preserve the current top-level `Факт` tab behavior.
3. Preserve `gantt-lib` `plan-fact` rendering.
4. Preserve daily fact persistence through the existing progress-entry flow.
5. Preserve the existing task volume editor UI and logic for the `Объём` column.
6. Keep the normal schedule workspace focused on the `График` experience.
7. Make future Fact-specific changes local to the Fact workspace.

## Non-Goals

- Do not redesign the plan-fact matrix UI.
- Do not change database shape.
- Do not introduce separate Fact-specific persistence tables.
- Do not replace progress entries with task fields.
- Do not change resource planner or finance workspace behavior.
- Do not change import/export behavior unless a later requirement explicitly asks for it.
- Do not make parent tasks editable in Fact mode.

## Current Behavior To Preserve

The `Факт` tab opens a plan-fact view for the current project.

The chart uses `mode="plan-fact"` from `gantt-lib`.

The task list shows:

- standard identity columns such as task number and name;
- `Начало`;
- `Окончание`;
- required Fact columns:
  - `Объём`;
  - `Факт`;
  - `%`.

The task list hides normal schedule/resource/status columns that are not relevant in Fact mode:

- dependencies;
- progress;
- duration;
- duplicated work-volume column;
- completed-volume column;
- status;
- assigned resources.

The `Объём` column must use the same volume editor as the schedule workspace. It must support the same total volume and unit editing behavior.

The `Факт` column shows the total actual volume from progress entries for the task.

The `%` column shows actual divided by total volume.

The daily matrix shows:

- planned daily quantity in the top subrow;
- actual daily quantity in the bottom subrow.

Fact cell edits must update existing task progress entries:

- setting a positive value for an empty date creates a progress entry;
- setting a value for an existing date updates that entry;
- clearing or setting zero deletes the existing date entry;
- task status/progress/completed volume must continue to be recomputed by the existing work-progress flow.

Schedule editing must remain disabled in Fact mode:

- no task drag;
- no task reorder;
- no add/delete task controls;
- no schedule cascade from Fact edits.

The Fact toolbar should be reduced:

- no Assistant button;
- no `Задачи / Гант` toggle;
- no `День / Неделя / Месяц` scale control.

## Proposed Architecture

Introduce a dedicated Fact workspace component that owns Fact-specific rendering and adapters.

The workspace shell remains responsible for top-level routing between:

- schedule workspace;
- fact workspace;
- resource workspace;
- finance workspace.

The top-level project tab state should continue to identify Fact as a project display mode, not as a separate project. The user is still working with the same project and task set.

The schedule workspace should no longer contain Fact-specific branches for:

- plan-fact task shaping;
- Fact-only hidden columns;
- Fact summary columns;
- Fact cell persistence;
- Fact toolbar suppression.

Those branches belong in the Fact workspace.

## Component Responsibilities

### Workspace Shell

The shell owns top-level project tab selection.

It should render:

- schedule workspace when the active display mode is `gantt`;
- fact workspace when the active display mode is `fact`;
- resource workspace for resources;
- finance workspace for finance.

The shell should set display mode to `gantt` when the `График` tab is selected.

The shell should set display mode to `fact` when the `Факт` tab is selected.

Switching to resources or finance must not destroy the last selected project display mode unless the user explicitly selects another project tab.

### Schedule Workspace

The schedule workspace owns normal Gantt behavior only.

It should keep:

- schedule toolbar;
- assistant integration;
- task/chart visibility toggle;
- view scale control;
- baseline controls;
- schedule edits;
- resource assignment task-list column when enabled.

It should not know how to build `planByDate` or `factByDate`.

It should not contain Fact-only column definitions.

### Fact Workspace

The Fact workspace owns:

- building `planByDate` from task date range and total work volume;
- building `factByDate` from progress entries;
- computing required summary columns;
- adapting plan-fact matrix changes into progress-entry mutations;
- read-only behavior for parent tasks;
- Fact-specific toolbar visibility;
- Fact-specific task-list width and hidden-column policy.

The Fact workspace should receive the same project-level data and mutation handlers currently used by the schedule workspace, but it should not duplicate persistence logic.

### Shared Fact Adapter

Create a small pure adapter layer for Fact calculations.

It should handle:

- date-key normalization;
- date range enumeration;
- daily plan distribution;
- fact aggregation by task/date;
- fact total calculation;
- percent calculation;
- diffing old and new `factByDate` maps.

This adapter should be unit-testable without rendering React.

## Data Rules

Plan values are derived, not persisted separately.

For a leaf task with a positive total volume:

- distribute total volume evenly across inclusive task start/end dates;
- use `YYYY-MM-DD` date keys;
- round only for display or matrix payload stability, not for business logic beyond current practical precision.

For parent tasks:

- do not show editable daily plan/fact values;
- do not show summary totals unless a future requirement defines aggregation rules across units.

Fact values are persisted through progress entries.

For each leaf task:

- `factByDate[date]` equals the sum of progress entries for that task and date.

When a matrix fact cell changes:

- compare the new date value to the previous aggregated value;
- create/update/delete the matching date entry using the existing work-progress mutation flow;
- keep existing status/progress recomputation behavior intact.

## UI Requirements

Top-level tabs must include:

- `График`;
- `Факт`;
- `Ресурсы`, when available;
- `Финансы`, when available.

Desktop tab state:

- `График` active when schedule workspace is visible;
- `Факт` active when Fact workspace is visible;
- `Ресурсы` active when resource workspace is visible;
- `Финансы` active when finance workspace is visible.

Mobile workspace menu must include the same modes.

Fact workspace toolbar must not show:

- Assistant;
- `Задачи / Гант`;
- `День / Неделя / Месяц`.

Fact workspace may keep neutral actions that still make sense for the fact table, such as:

- today;
- filters;
- task columns, if applicable;
- history, if it remains meaningful for fact edits.

The required Fact columns must be visible regardless of user-hidden task-list column preferences:

- `Объём`;
- `Факт`;
- `%`.

The `Объём` column must use the exact same editor behavior as the schedule workspace volume column.

## Permissions And Read-Only Behavior

Project viewers can open Fact mode but cannot edit volumes or fact cells.

Archived projects can open Fact mode but cannot edit volumes or fact cells.

Users without schedule access should not see Fact mode unless a future permissions model separates fact access from schedule access.

Parent rows are always read-only in Fact mode.

## History And Sync Requirements

Fact edits must keep using the existing work-progress endpoints and stores.

The history panel should reflect fact mutations if the existing work-progress flow records them. If it does not currently record them, this PRD does not require adding a new history implementation, but the gap must be documented before shipping.

Pending sync and save indicators should behave the same way as current work-progress edits.

Offline/local behavior should remain no worse than the current work-progress column behavior.

## Testing Requirements

Add pure adapter tests for:

- inclusive date range enumeration;
- daily plan distribution;
- empty and invalid task dates;
- parent task exclusion;
- fact aggregation by task/date;
- fact total and percent calculations;
- fact map diffing for create/update/delete decisions.

Add component tests for:

- top-level `Факт` tab switches to Fact workspace;
- top-level `График` tab switches back to schedule workspace;
- mobile mode menu includes `Факт`;
- Fact workspace passes `mode="plan-fact"` to the Gantt wrapper;
- Fact workspace hides resource/status/duplicate work columns;
- Fact workspace allows `Начало` and `Окончание` to display;
- Fact workspace always includes `Объём`, `Факт`, `%`;
- Fact `Объём` column renders the shared volume editor;
- Fact mode suppresses Assistant, task/chart toggle, and view scale controls.

Add mutation tests for:

- editing a new daily fact cell creates a progress entry;
- editing an existing daily fact cell updates the entry;
- clearing a daily fact cell deletes the entry;
- parent task fact edits are ignored or blocked;
- read-only users cannot mutate fact or volume cells.

## Migration Plan

1. Extract pure Fact adapter functions from the current workspace implementation.
2. Add adapter unit tests.
3. Create the dedicated Fact workspace component.
4. Move plan/fact task shaping into the Fact workspace.
5. Move required Fact columns into the Fact workspace.
6. Move fact-cell mutation handling into the Fact workspace.
7. Replace schedule workspace Fact branches with normal schedule-only behavior.
8. Update the workspace shell to render Fact workspace for the active Fact display mode.
9. Keep the top-level `Факт` tab behavior unchanged for the user.
10. Run targeted workspace tests and the web build.

## Acceptance Criteria

- Selecting `Факт` opens a dedicated Fact workspace component.
- Selecting `График` opens the normal schedule workspace component.
- The normal schedule workspace no longer contains Fact-only plan/fact task shaping or Fact-only columns.
- Fact mode still renders through `gantt-lib` `plan-fact`.
- Daily fact edits still create/update/delete progress entries through the existing flow.
- The `Объём` column in Fact mode uses the same editor as in the schedule workspace.
- `Начало` and `Окончание` are visible in Fact mode.
- Resources/status/duplicate work columns are hidden in Fact mode.
- Assistant, task/chart toggle, and day/week/month controls are absent in Fact mode.
- Existing schedule workspace behavior remains unchanged.
- Targeted tests and web build pass.

## Risks

The biggest risk is duplicating persistence logic while extracting the UI. The extraction should pass existing mutation handlers into Fact workspace rather than reimplementing server calls.

Another risk is splitting project workspace state too aggressively. Fact is a mode of the same project, not a separate project source.

History behavior may already depend on command-based mutations more than work-progress mutations. This should be verified before claiming full history parity.

Task-list column width persistence may need a separate Fact width state if the Fact layout diverges further.

## Open Questions

1. Should Fact mode have its own persisted task-list column widths, separate from schedule mode?
2. Should Fact edits appear in history with a Fact-specific title?
3. Should parent rows eventually aggregate child fact values when all children share the same unit?
4. Should plan distribution be even by calendar days only, or should it respect project business-day settings later?
5. Should Fact be governed by schedule permissions, or should it get a separate permission in the future?
