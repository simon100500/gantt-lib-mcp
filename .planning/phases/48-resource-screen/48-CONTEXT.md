# Phase 48: resource-screen - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Source:** PRD Express Path (`RESOURCE-MANAGEMENT-SCREEN-PRD.md`)

<domain>
## Phase Boundary

Build the full resource management screen in `gantt-lib-mcp`. This phase replaces the local `ResourceTimelineGrid` as the primary planner renderer with `gantt-lib` resource planner mode, keeps the backend as the authoritative state after every mutation, and delivers resource catalog management, filters, assignment details, conflict correction, readonly/locked behavior, and controlled drag persistence for date and resource changes.

This phase is the application-side migration and productization of the existing `gantt-lib` resource planner capabilities. It must use `GanttChart mode="resource-planner"` or `ResourceTimelineChart` rather than modeling resources as fake task hierarchy.

</domain>

<decisions>
## Implementation Decisions

### Renderer and library integration
- The resource screen MUST replace the local calendar grid with `gantt-lib` resource planner rendering as the main timeline.
- The primary renderer MUST be either `GanttChart mode="resource-planner"` or direct `ResourceTimelineChart`.
- The screen MUST import and use `gantt-lib/styles.css` instead of duplicating resource calendar geometry.
- `ResourceTimelineGrid` may remain only as deprecated fallback or test fixture, not as the main renderer.
- Empty resource rows MUST stay visible so assignments can be dropped on free resources.
- Built-in lane behavior from `gantt-lib` MUST be used so overlapping assignment intervals stack into lanes instead of visually overlapping.
- Initial dense planner layout parameters SHOULD use `dayWidth=36`, `laneHeight=40`, `rowHeaderWidth=220`, and `headerHeight=40`.

### Data mapping
- Add an adapter from `ResourcePlannerResult` to `ResourceTimelineResource[]`.
- `ResourcePlannerResource.resourceId` maps to `ResourceTimelineResource.id`.
- `ResourcePlannerResource.resourceName` maps to `ResourceTimelineResource.name`.
- `ResourcePlannerResource.intervals` maps to `ResourceTimelineResource.items`.
- `ResourcePlannerInterval.assignmentId` maps to `ResourceTimelineItem.id`.
- `ResourcePlannerInterval.resourceId` maps to `ResourceTimelineItem.resourceId`.
- `ResourcePlannerInterval.taskId` maps to `ResourceTimelineItem.taskId`.
- `ResourcePlannerInterval.taskName` maps to `ResourceTimelineItem.title`.
- `ResourcePlannerInterval.projectName` maps to `ResourceTimelineItem.subtitle`.
- `ResourcePlannerInterval.startDate` and `endDate` map to `ResourceTimelineItem.startDate` and `endDate`.
- Conflict and source details MUST be carried in typed item metadata, including `projectId`, `projectName`, `taskId`, `assignmentId`, `resourceId`, `resourceName`, `hasConflict`, `conflictCount`, `conflictAssignmentIds`, `assignmentCreatedAt`, and `source: 'resource-planner-result'`.
- Add helpers such as `getPlannerItemMetadata` so renderers and callbacks do not parse unknown metadata ad hoc.

### Screen structure and UX
- The screen title is `Ресурсы`.
- The subtitle MUST reflect the selected scope: `Текущий проект` or `Все проекты workspace`.
- Top-level actions MUST include create resource, refresh, and return to project.
- The UI MUST expose status indicators for loading, saving, pending unsaved operation, and errors.
- Summary cards MUST show resource count, assignment count, resources with conflicts, and conflicting intervals.
- The resource catalog MUST show name, type, scope, active/inactive status, assignment count, and conflict count.
- Catalog actions MUST include create, rename, type change, deactivate, and activate.
- Resource creation MUST support `shared` and `project` scope and resource types `human`, `equipment`, `material`, and `other`.
- The assignment details panel or drawer MUST show task, project, resource, dates, assignment id, and conflict assignment ids.
- Assignment details actions MUST include open task, correct conflict, change resource, and remove resource from task where allowed.
- Clicking a bar MUST select it and open assignment details.

### Filters
- Scope switching MUST support `current-project` and `all-projects`.
- Filters MUST include text search over resource/task/project, resource type, conflict-only, and include inactive resources.
- Filters MUST work client-side without a backend request except scope switch, which reloads planner data.
- Inactive resources are hidden unless the include inactive filter is enabled.

### Controlled move persistence
- `onResourceItemMove(move)` MUST be wired as a controlled persistence flow that emits once on drop/mouseup.
- If `fromResourceId === toResourceId` and dates changed, the UI MUST mark the item pending, find `taskId`, persist date changes through the existing project command flow, update project store from any returned snapshot, and then reload `/api/resources/planner?scope=...`.
- Date move with preserved duration SHOULD use `move_task` with the new `startDate`.
- Duration or edge changes MUST use `resize_task` or an existing helper that safely supports the operation.
- If both edges and duration changed, the implementation MUST use a coordinated command sequence or existing helper rather than a local-only adjustment.
- If `fromResourceId !== toResourceId`, the UI MUST check reassignment is allowed and the item is not locked, build the full replacement `resourceIds[]` for the task by replacing only the moved resource, call `POST /api/tasks/:taskId/assignments`, update store from response or reload snapshot, and reload planner data.
- Combined date and resource moves MUST apply date change first and assignment replacement second.
- If the second step of a combined move fails, the UI MUST reload backend-authoritative state and clearly report the partial result rather than manually rolling back the date change.
- Every successful mutation MUST reload planner data so conflict status comes from backend state.
- Save failures MUST show toast or inline alert, clear pending state, and preserve the last successful planner data.

### Backend/API reuse
- The screen MUST continue using `GET /api/resources/planner?scope=current-project|all-projects` for authoritative planner data.
- Resource catalog operations MUST reuse `GET /api/resources?projectId=...`, `POST /api/resources`, and `PATCH /api/resources/:resourceId`.
- Assignment replacement MUST reuse `POST /api/tasks/:taskId/assignments` as a full resource list replacement.
- Date changes MUST reuse the existing command commit flow for `move_task` and `resize_task`.
- Before implementation, verify whether `PATCH /api/resources/:resourceId` returns a convenient updated resource shape.
- Before implementation, verify the existing web helper for committing project commands outside the main Gantt screen.
- Before implementation, verify whether `/api/project` snapshots are enough to restore assignments or whether an assignment reload endpoint is needed.
- Before implementation, verify whether `GET /api/tasks/:taskId/assignments` is needed for cross-project items when the store lacks assignments.

### State management
- Maintain planner state with loading/error/ready and last successful data.
- Maintain catalog state with loading/error and resources from the project store.
- Track pending move ids in a `Set<string>`.
- Track selected item and selected resource for details.
- Track filters for scope, query, resource types, conflict-only, and include inactive.
- Planner reload MUST support keeping current data visible during save/reload to avoid flicker.

### Conflict handling
- Conflict bars MUST remain visible and visually distinct.
- Conflict bars MUST include a compact badge.
- The existing `onCorrectConflict` and `PlannerCorrectionTarget` flow MUST be preserved.
- Dragging a conflict bar is allowed unless readonly/locked rules block it.
- If a drag should resolve a conflict, the UI MUST save the operation and then reload planner data to get recalculated conflict status.

### Readonly, locked, and permissions
- Without `accessToken`, the screen MUST be readonly and show an authorization message.
- `readonly` MUST be passed to `gantt-lib`.
- `disableResourceReassignment` MUST be used where selected scope/project state forbids moving bars between resources.
- In `all-projects`, cross-project item changes are allowed only when backend and permissions permit the target project mutation.
- Cross-project items that cannot be modified MUST be readonly with an explanation.
- Locked items MUST not start drag and MUST not show destructive actions.
- Assignments on inactive resources may be displayed readonly if backend rejects mutation.

### Accessibility
- All filters MUST have labels and keyboard focus states.
- The timeline container MUST have accessible name `Ресурсный календарь`.
- Bars MUST have `aria-label` containing task, resource, dates, and conflict status.
- The details drawer MUST open from Enter/Space on a focused bar and close with Esc.
- Critical actions MUST have textual confirmation or text labels, not color-only signaling.
- Full keyboard drag and drop is not required in v1, but details drawer actions MUST provide accessible fallback forms for changing dates and resource.

### Visual states
- Resource bars MUST visually distinguish normal, conflict, selected, pending, locked, and cross-project states.
- Header and side panels MUST stay consistent with the current Tailwind workspace UI.
- Large resource sets MUST scroll without breaking header/row alignment.

### Testing
- Tests MUST cover the planner adapter, filters, `renderItem` metadata, conflict action, date move flow, reassignment flow, and error rollback.
- Tests SHOULD verify readonly/locked states do not emit mutation callbacks.
- Tests SHOULD verify empty resource rows are preserved.

### the agent's Discretion
- Exact file/module decomposition is left to the implementing agent, but it should follow existing web app patterns.
- The implementation may choose `GanttChart mode="resource-planner"` or direct `ResourceTimelineChart`; the preferred default is the `GanttChart` facade unless existing imports or typing make the direct component cleaner.
- Exact drawer placement, responsive behavior, and panel collapse mechanics are left to the agent as long as the required actions and accessibility behavior are present.
- The agent may split execution into multiple plans by adapter/renderer, catalog/details, move persistence, and hardening if that is safer for review and testing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and requirements
- `.planning/ROADMAP.md` — Defines Phase 48 goal, PRD-only requirement source, and dependency on Phase 47.
- `.planning/REQUIREMENTS.md` — Confirms current project requirements traceability model; Phase 48 uses PRD-only requirements.
- `RESOURCE-MANAGEMENT-SCREEN-PRD.md` — Locked product requirements for this phase.
- `RESOURCE-PLANNER-MODE-PRD.md` — Prior PRD defining `gantt-lib` resource planner mode and migration expectations.

### `gantt-lib` contracts
- `D:/Projects/gantt-lib/docs/reference/15-resource-planner.md` — Public resource planner mode contract.
- `D:/Projects/gantt-lib/docs/reference/04-props.md` — General `GanttChart` props and facade behavior.
- `D:/Projects/gantt-lib/docs/reference/10-drag-interactions.md` — Drag behavior and controlled update expectations.
- `D:/Projects/gantt-lib/docs/reference/12-validation.md` — Validation model and constraints.

### Current implementation
- `packages/web/src/components/workspace/ResourcePlannerWorkspace.tsx` — Current resource planner screen to upgrade.
- `packages/web/src/components/workspace/ResourceTimelineGrid.tsx` — Current local renderer to replace as primary renderer.
- `packages/runtime-core/src/types.ts` — Current resource/planner/assignment transport types.

</canonical_refs>

<specifics>
## Specific Ideas

- Use `renderItem` to show task name, project name, date range, conflict badge, and locked marker inside bars.
- Use `getItemClassName` for conflict, selected, pending, locked, and cross-project visual classes.
- Keep existing summary cards and scope switch where possible.
- Keep `onCorrectConflict` behavior wired to conflict actions.
- Keep data backend-authoritative after all mutations; no local-only conflict recalculation.
- Treat combined date and resource drag as one user intent labelled `Перенос назначения` in notifications/history where the app exposes such labels.

</specifics>

<deferred>
## Deferred Ideas

- New dependency engine for resource planner.
- Dependency lines in resource view.
- Modeling resources with `parentId`/`children`.
- Automatic conflict resolution without user confirmation.
- New backend capacity planning algorithms unless required to display current conflicts.
- Hourly planning; first version uses day-level planning.
- Full keyboard drag and drop; first version provides accessible fallback forms.
- Capacity/availability visualization unless current backend already supports it.
- Persisting filters/scope in URL query unless already a local pattern.
- Separate audit/history label beyond existing project command history if not already straightforward.

</deferred>

---

*Phase: 48-resource-screen*
*Context gathered: 2026-04-25 via PRD Express Path*
