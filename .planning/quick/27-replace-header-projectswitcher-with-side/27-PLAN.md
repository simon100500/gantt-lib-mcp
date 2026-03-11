---
phase: quick
plan: 27
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
  - packages/web/src/components/ProjectSwitcher.tsx
autonomous: true
requirements:
  - QUICK-027: Move ProjectSwitcher from header to left sidebar panel
---

<objective>
Relocate the ProjectSwitcher component from the top header bar to a collapsible left sidebar panel, similar to the existing right-side chat sidebar pattern.

Purpose: free up horizontal space in the header for other controls and provide a dedicated space for project management that can expand as the project list grows.
Output: ProjectSwitcher rendered in a left sidebar with toggle button, maintaining all existing functionality (switch, create, edit projects).
</objective>

<context>
@.planning/STATE.md
@packages/web/src/App.tsx
@packages/web/src/components/ProjectSwitcher.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add left sidebar state and toggle button to App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
1. Add state variable `projectSidebarVisible` (default: true to show it initially)
2. Add a toggle button in the header (left side, after logo) using PanelLeft icon
3. Import PanelLeftClose/PanelLeftOpen icons from lucide-react for the toggle button
4. Style the toggle button consistently with existing UI controls
  </action>
  <verify>
    <automated>rg -n "projectSidebarVisible|setProjectSidebarVisible" packages/web/src/App.tsx</automated>
  </verify>
  <done>
    - State variable added for sidebar visibility
    - Toggle button rendered in header with proper icon
  </done>
</task>

<task type="auto">
  <name>Task 2: Move ProjectSwitcher to left sidebar panel</name>
  <files>packages/web/src/App.tsx</files>
  <action>
1. Remove ProjectSwitcher from the header section (lines 332-348)
2. Create a new left sidebar section (similar to chat sidebar) that renders conditionally based on `projectSidebarVisible`
3. Place the ProjectSwitcher component inside this sidebar with proper padding and layout
4. Add a close button at the top of the sidebar for better UX
5. Position the sidebar before the main content area in the flex layout
  </action>
  <verify>
Open the app and verify:
- ProjectSwitcher appears in left sidebar
- Toggle button in header shows/hides the sidebar
- All project operations (switch, create, edit) work correctly
- Layout doesn't break when sidebar is hidden/shown
  </verify>
  <done>
    - ProjectSwitcher removed from header
    - Left sidebar panel created with ProjectSwitcher
    - Toggle functionality works correctly
    - Responsive layout maintained
  </done>
</task>

<task type="auto">
  <name>Task 3: Update ProjectSwitcher component for sidebar layout</name>
  <files>packages/web/src/components/ProjectSwitcher.tsx</files>
  <action>
Enhance the ProjectSwitcher component for better sidebar display:
1. Add a header section with title "Проекты" and close button
2. Increase dropdown menu width to accommodate longer project names
3. Improve spacing and padding for sidebar context
4. Add optional onClose prop for the close button functionality
  </action>
  <verify>
    <automated>rg -n "onClose|Проекты" packages/web/src/components/ProjectSwitcher.tsx</automated>
  </verify>
  <done>
    - ProjectSwitcher has proper sidebar layout
    - Close button functionality implemented
    - Component accepts optional onClose callback
  </done>
</task>

</tasks>

<success_criteria>
- [ ] ProjectSwitcher moved from header to left sidebar
- [ ] Toggle button in header controls sidebar visibility
- [ ] All project operations (switch, create, edit, rename) work correctly
- [ ] Layout is responsive and doesn't break when sidebar is toggled
- [ ] Header has more horizontal space available
- [ ] Sidebar can be closed to maximize chart viewing area
</success_criteria>

<output>
After completion, create `.planning/quick/27-replace-header-projectswitcher-with-side/27-SUMMARY.md`
</output>
