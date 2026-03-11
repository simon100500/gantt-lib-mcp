---
phase: quick
plan: 27
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/ProjectSwitcher.tsx
  - packages/web/src/components/ProjectSidebar.tsx
autonomous: false
requirements:
  - QUICK-027: Replace header ProjectSwitcher with sidebar navigation and breadcrumb-style header
---

<objective>
Move project navigation from the header to a collapsible left sidebar, and replace the header ProjectSwitcher with a simple breadcrumb showing the current project name.

Purpose: Improve layout efficiency by utilizing vertical space for project list and reducing header clutter while maintaining quick access to project switching.

Output: Left sidebar with collapsible project navigation, header shows only current project name as breadcrumb, all existing functionality preserved (switch, create, edit projects).
</objective>

<context>
@.planning/STATE.md
@packages/web/src/App.tsx
@packages/web/src/components/ProjectSwitcher.tsx
@packages/web/src/components/ChatSidebar.tsx
@packages/web/src/components/ui/dropdown-menu.tsx
@packages/web/src/components/ui/button.tsx
</context>

<interfaces>
<!-- Key patterns from existing components -->

From ProjectSwitcher.tsx:
```typescript
interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
  onEdit?: (projectId: string, currentName: string) => Promise<void>;
}
```

From App.tsx (current header usage):
```typescript
// ProjectSwitcher is rendered in header at lines 333-348
// Auth mode: <ProjectSwitcher currentProject={auth.project} projects={auth.projects} onSwitch={auth.switchProject} onCreateNew={handleCreateProject} onEdit={handleEditProject} />
// Guest mode: <ProjectSwitcher currentProject={{ id: 'demo', name: localTasks.projectName || 'Мой проект' }} projects={[]} onSwitch={() => {}} onCreateNew={handleCreateProject} onEdit={handleEditGuestProject} />
```

From ChatSidebar.tsx (sidebar pattern reference):
- Sidebar with header (close button), scrollable content, fixed width
- Uses `aside` tag with `w-80` width and border separation
- Close button pattern: `onClose` callback toggles visibility
- Layout: `<aside className="w-80 shrink-0 border-l border-slate-200 flex flex-col">`
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create ProjectSidebar component with collapsible navigation</name>
  <files>packages/web/src/components/ProjectSidebar.tsx</files>
  <action>
Create a new sidebar component for project navigation:

1. Create `packages/web/src/components/ProjectSidebar.tsx`
2. Copy the project list rendering logic from ProjectSwitcher.tsx (lines 28-43: project items with checkmarks and task counts)
3. Add a sidebar header with:
   - Title "Проекты" (Projects)
   - Close button (X icon) to collapse sidebar
4. Add "Новый проект" (New Project) button at the bottom (Plus icon, similar to line 45-47)
5. Add edit button (Pencil icon) for each project (similar to lines 50-59)
6. Use sidebar layout pattern from ChatSidebar.tsx:
   - Aside container: `className="w-72 shrink-0 border-r border-slate-200 flex flex-col bg-white"`
   - Scrollable project list area
   - Fixed header and footer
7. Support both authenticated (multiple projects) and guest mode (single demo project with empty list)

Props interface should match ProjectSwitcherProps with additional `onClose` callback.
  </action>
  <verify>
    <automated>test -f packages/web/src/components/ProjectSidebar.tsx && rg -l "ProjectSidebar" packages/web/src/components/ProjectSidebar.tsx</automated>
  </verify>
  <done>
    - ProjectSidebar.tsx component created with project list rendering
    - Sidebar has close button, project items, new project button
    - Component accepts same props as ProjectSwitcher plus onClose
  </done>
</task>

<task type="auto">
  <name>Task 2: Add simple breadcrumb component to header</name>
  <files>packages/web/src/components/ProjectBreadcrumb.tsx</files>
  <action>
Create a minimal breadcrumb component to show current project name in header:

1. Create `packages/web/src/components/ProjectBreadcrumb.tsx`
2. Component should display:
   - Small "GetGantt" logo indicator (existing dot + text pattern from App.tsx lines 324-327)
   - Chevron separator
   - Current project name as text (not clickable)
   - Optional: small down chevron icon indicating this could be expanded
3. Props: `currentProject: { id: string; name: string }`
4. Style: compact text display, no dropdown (functionality moves to sidebar)
5. Use existing typography patterns: `text-sm font-medium text-slate-700`

This replaces the ProjectSwitcher dropdown in the header with a static breadcrumb.
  </action>
  <verify>
    <automated>test -f packages/web/src/components/ProjectBreadcrumb.tsx && rg -l "ProjectBreadcrumb" packages/web/src/components/ProjectBreadcrumb.tsx</automated>
  </verify>
  <done>
    - ProjectBreadcrumb.tsx created with current project name display
    - Breadcrumb shows logo + separator + project name
    - No dropdown functionality in breadcrumb
  </done>
</task>

<task type="checkpoint:human-verify">
  <what-built>Complete sidebar navigation with project list and breadcrumb header</what-built>
  <how-to-verify>
    1. Open the app and verify the header now shows a simple breadcrumb: "GetGantt > [Project Name]" instead of the dropdown
    2. Verify there's a new sidebar toggle button (hamburger menu or similar) in the header to open/close project sidebar
    3. Click the toggle and verify:
       - Left sidebar opens with project list
       - Current project is highlighted/checked
       - Each project has edit button
       - "New Project" button at bottom
       - Close button (X) works to collapse sidebar
    4. Test project switching: click a different project in sidebar and verify it switches correctly
    5. Test creating new project: verify "New Project" button opens CreateProjectModal
    6. Test editing project: verify edit button opens EditProjectModal
    7. Verify the layout works on mobile (sidebar should overlay or collapse appropriately)
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues with the sidebar/breadcrumb layout</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Wire ProjectSidebar and ProjectBreadcrumb into App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Integrate the new sidebar and breadcrumb components:

1. Add state for project sidebar visibility: `const [projectSidebarVisible, setProjectSidebarVisible] = useState(false);`
2. In the header (around line 331-348), replace the ProjectSwitcher rendering with:
   - Add sidebar toggle button (PanelLeft or Menu icon) to the left of the breadcrumb
   - Replace ProjectSwitcher with ProjectBreadcrumb showing current project name
   - Import ProjectBreadcrumb and render it with auth.project or localTasks.projectName
3. In the main layout (after line 385, before the main content div), add ProjectSidebar:
   - Conditionally render: `{projectSidebarVisible && <ProjectSidebar ... />}`
   - Place it before the Gantt panel so it appears on the left
   - Pass all the same props that ProjectSwitcher received (currentProject, projects, onSwitch, onCreateNew, onEdit)
   - Pass `onClose={() => setProjectSidebarVisible(false)}`
4. Remove the old ProjectSwitcher import (line 14) or keep it for reference during development
5. Adjust spacing if needed: the main content area should accommodate the sidebar when visible
6. Ensure ChatSidebar and ProjectSidebar can both be open (two sidebars: left for projects, right for AI chat)

Layout structure:
```
<header>
  Logo
  [Toggle] ProjectBreadcrumb
  [Spacer]
  Auth controls
</header>

<main>
  {projectSidebarVisible && <ProjectSidebar />}
  <GanttPanel />
  {chatSidebarVisible && <ChatSidebar />}
</main>
```
  </action>
  <verify>
Open the app and verify the complete flow:
- Header shows breadcrumb with toggle button
- Clicking toggle opens left sidebar with project list
- Project switching works from sidebar
- Creating/editing projects works from sidebar
- Both sidebars (projects + AI chat) can be open simultaneously
- Closing sidebar works via X button or clicking toggle again
  </verify>
  <done>
    - App.tsx uses ProjectBreadcrumb in header instead of ProjectSwitcher
    - ProjectSidebar renders on left when visible
    - Toggle button controls sidebar visibility
    - All project operations (switch, create, edit) work from sidebar
    - Layout supports both sidebars simultaneously
  </done>
</task>

</tasks>

<verification>
Overall verification checks:
- [ ] Header is cleaner with breadcrumb instead of dropdown
- [ ] Project navigation moved to left sidebar
- [ ] All existing functionality preserved (switch, create, edit)
- [ ] Both authenticated and guest modes work
- [ ] Layout is responsive and doesn't break on mobile
- [ ] ChatSidebar and ProjectSidebar can coexist
</verification>

<success_criteria>
- [ ] Header shows simple breadcrumb (logo + project name) instead of ProjectSwitcher dropdown
- [ ] Left sidebar contains full project navigation with list, create, and edit actions
- [ ] Sidebar toggle button in header controls left sidebar visibility
- [ ] Project switching, creating, and editing work from sidebar
- [ ] Layout supports both project sidebar (left) and AI chat sidebar (right) simultaneously
- [ ] Existing functionality preserved for authenticated and guest users
</success_criteria>

<output>
After completion, create `.planning/quick/027-replace-header-projectswitcher-with-side/027-SUMMARY.md`
</output>
