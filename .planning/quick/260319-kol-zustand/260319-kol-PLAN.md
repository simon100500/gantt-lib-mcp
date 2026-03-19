---
phase: quick
plan: 260319-kol-zustand
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ProjectSwitcher.tsx
  - packages/web/src/components/layout/ProjectMenu.tsx
  - packages/web/src/App.tsx
  - packages/web/src/stores/useAuthStore.ts
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Task count displays correctly in project list after switching projects"
    - "No 'current project' badge in sidebar"
    - "Edit pencil is next to project name in header"
    - "Sidebar stays open after selecting a project"
  artifacts:
    - path: "packages/web/src/stores/useAuthStore.ts"
      provides: "Project task count sync state"
      exports: ["syncProjectTaskCount"]
    - path: "packages/web/src/components/ProjectSwitcher.tsx"
      provides: "Project list without current project badge"
    - path: "packages/web/src/components/layout/ProjectMenu.tsx"
      provides: "Header with edit button next to project name"
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "useAuthStore.syncProjectTaskCount"
      via: "handleSwitchProject callback"
      pattern: "syncProjectTaskCount.*projectId.*taskCount"
    - from: "packages/web/src/components/layout/ProjectMenu.tsx"
      to: "packages/web/src/components/ProjectSwitcher.tsx"
      via: "ProjectSwitcher props"
      pattern: "ProjectSwitcher.*currentProject.*projects"
---

<objective>
Migrate project sidebar to Zustand state management and fix UI issues

Purpose: Fix bug where task counts disappear when switching projects, remove unnecessary "current project" badge, move edit button to header, and prevent sidebar auto-close

Output: Fully functional Zustand-backed project sidebar with correct task count display
</objective>

<execution_context>
@D:/Проекты/gantt-lib-mcp/.planning/phases/22-zustand-frontend-refactor/22-04-SUMMARY.md
@D:/Проекты/gantt-lib-mcp/packages/web/src/stores/useAuthStore.ts
@D:/Проекты/gantt-lib-mcp/packages/web/src/stores/useUIStore.ts
@D:/Проекты/gantt-lib-mcp/packages/web/src/components/layout/ProjectMenu.tsx
@D:/Проекты/gantt-lib-mcp/packages/web/src/components/ProjectSwitcher.tsx
@D:/Проекты/gantt-lib-mcp/packages/web/src/App.tsx
</execution_context>

<context>
# Current State (from Phase 22-04)
- Project sidebar is in `ProjectMenu.tsx` with visibility controlled by `useUIStore.projectSidebarVisible`
- `ProjectSwitcher` component renders the project list with "Текущий проект" badge
- `App.tsx` has `handleSwitchProject` that calls `setProjectSidebarVisible(false)` at line 289
- Auth store has `syncProjectTaskCount()` method but may not be called when switching projects
- Task counts are stored in `AuthProject.taskCount` but may not persist across switches

# Key Files
- `packages/web/src/stores/useAuthStore.ts` - Has `syncProjectTaskCount(projectId, taskCount)` method
- `packages/web/src/components/ProjectSwitcher.tsx` - Shows project list with task counts and "Текущий проект" badge
- `packages/web/src/components/layout/ProjectMenu.tsx` - Contains sidebar header and project list
- `packages/web/src/App.tsx` - Has `handleSwitchProject` callback with `setProjectSidebarVisible(false)`
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix task count sync and remove sidebar auto-close</name>
  <files>packages/web/src/App.tsx, packages/web/src/stores/useAuthStore.ts</files>
  <action>
    In `packages/web/src/App.tsx`:
    1. Remove `setProjectSidebarVisible(false)` from `handleSwitchProject` callback (line 289)
    2. Add `syncProjectTaskCount` call after switching project to ensure task count is updated:
       - Import `syncProjectTaskCount` from `useAuthStore`
       - In `handleSwitchProject`, after `auth.switchProject(projectId)`, call `syncProjectTaskCount(projectId, tasks.length)`
    3. Store task count in auth state when switching to persist across project changes

    In `packages/web/src/stores/useAuthStore.ts`:
    1. Ensure `syncProjectTaskCount` properly updates both `project.taskCount` and `projects[].taskCount`
    2. Verify task count is preserved in localStorage when switching projects

    Do NOT modify any other functionality.
  </action>
  <verify>
    <automated>npm run build -w packages/web</automated>
  </verify>
  <done>Task counts persist when switching projects, sidebar remains open after selection</done>
</task>

<task type="auto">
  <name>Task 2: Remove "current project" badge and move edit button to header</name>
  <files>packages/web/src/components/ProjectSwitcher.tsx, packages/web/src/components/layout/ProjectMenu.tsx</files>
  <action>
    In `packages/web/src/components/ProjectSwitcher.tsx`:
    1. Remove the entire "Current project display" section (lines 18-42)
    2. Remove `onEdit` prop from interface and component signature
    3. Keep only the "Projects list" section showing all projects
    4. Remove conditional styling for current project (remove `!isDraft && p.id === currentProject.id` check)
    5. Remove `isDraft` variable and related logic since draft badge is no longer needed

    In `packages/web/src/components/layout/ProjectMenu.tsx`:
    1. Move edit button from sidebar to header next to project name
    2. Add edit button (Pencil icon) after the project name span in header (around line 197)
    3. Button should trigger the same `setShowEditProjectModal(true)` action
    4. Remove `onEdit` prop from `ProjectSwitcher` component calls
    5. Keep existing inline rename functionality in header (lines 163-197)

    Do NOT remove the "Все проекты" label or project list functionality.
  </action>
  <verify>
    <automated>npm run build -w packages/web</automated>
  </verify>
  <done>Sidebar has no "current project" badge, edit pencil appears next to project name in header</done>
</task>

</tasks>

<verification>
1. Start development server and log in
2. Open project sidebar
3. Verify no "Текущий проект" badge appears at top of sidebar
4. Verify all projects are listed in a simple format
5. Click on a different project - sidebar should stay open
6. Verify task count displays correctly for the previously active project
7. Verify edit pencil appears next to project name in header (not in sidebar)
8. Click edit pencil - edit modal should open
</verification>

<success_criteria>
- Task counts display correctly for all projects after switching
- No "Текущий проект" or "Черновик" badge in sidebar
- Edit button (pencil) is positioned next to project name in header
- Sidebar remains open after selecting a different project
- Build passes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/260319-kol-zustand/260319-kol-SUMMARY.md`
</output>
