---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/stores/useUIStore.ts
  - packages/web/src/components/layout/ProjectMenu.tsx
autonomous: true
requirements: [QUICK-sidebar-jira-hover]
must_haves:
  truths:
    - "Hover on sidebar toggle shows overlay project list (no layout shift)"
    - "Click on sidebar toggle opens push sidebar (shifts content, current behavior)"
    - "Selecting project in overlay mode closes overlay"
    - "Selecting project in sidebar mode keeps sidebar open"
    - "Moving mouse away from toggle+overlay closes overlay after a short delay"
  artifacts:
    - path: "packages/web/src/stores/useUIStore.ts"
      provides: "SidebarMode type and sidebarState field replacing projectSidebarVisible"
      contains: "sidebarState"
    - path: "packages/web/src/components/layout/ProjectMenu.tsx"
      provides: "Dual-mode sidebar with hover overlay and click push"
      min_lines: 350
  key_links:
    - from: "ProjectMenu.tsx"
      to: "useUIStore.sidebarState"
      via: "read sidebarState + setSidebarState"
      pattern: "sidebarState"
---

<objective>
Add Jira-like sidebar toggle behavior: hover opens transient overlay, click opens persistent push sidebar.

Purpose: Users can quickly browse/switch projects via hover (no layout shift) while keeping the current push sidebar behavior for explicit click.
Output: Modified useUIStore.ts (new sidebarState) and ProjectMenu.tsx (dual-mode rendering)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/stores/useUIStore.ts
@packages/web/src/components/layout/ProjectMenu.tsx
@packages/web/src/components/ProjectSwitcher.tsx
</context>

<interfaces>
<!-- Current interfaces the executor needs -->

From packages/web/src/stores/useUIStore.ts:
```typescript
// Current boolean state to replace:
projectSidebarVisible: boolean;
setProjectSidebarVisible: (visible: boolean) => void;

// Store shape: zustand create<UIState>()
// All setters are simple: (value) => set({ field: value })
```

From packages/web/src/components/ProjectSwitcher.tsx:
```typescript
interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number; kind?: 'project' | 'draft' };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
  onClose?: () => void;
  isInline?: boolean;
}
// Renders: logo header, "New project" button, scrollable project list
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Replace projectSidebarVisible with sidebarState in useUIStore</name>
  <files>packages/web/src/stores/useUIStore.ts</files>
  <action>
Add a new type and field to replace the boolean sidebar state:

1. Add a `SidebarMode` type at the top of the file (near other type exports):
```typescript
export type SidebarMode = 'closed' | 'overlay' | 'sidebar';
```

2. In the `UIState` interface:
   - REMOVE: `projectSidebarVisible: boolean;`
   - REMOVE: `setProjectSidebarVisible: (visible: boolean) => void;`
   - ADD: `sidebarState: SidebarMode;`
   - ADD: `setSidebarState: (state: SidebarMode) => void;`

3. In the store implementation:
   - REMOVE: `projectSidebarVisible: false,`
   - REMOVE: `setProjectSidebarVisible: (projectSidebarVisible) => set({ projectSidebarVisible }),`
   - ADD: `sidebarState: 'closed' as SidebarMode,`
   - ADD: `setSidebarState: (sidebarState) => set({ sidebarState }),`

4. Run `grep -rn "projectSidebarVisible\|setProjectSidebarVisible" packages/web/src/` to find ALL consumers that reference the old API. Update each consumer:
   - Replace `projectSidebarVisible` reads with `sidebarState !== 'closed'` or `sidebarState === 'sidebar'` as appropriate
   - Replace `setProjectSidebarVisible(true)` with `setSidebarState('sidebar')`
   - Replace `setProjectSidebarVisible(false)` with `setSidebarState('closed')`
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp && grep -rn "projectSidebarVisible\|setProjectSidebarVisible" packages/web/src/ | grep -v node_modules && echo "FAIL: old API still referenced" || echo "PASS: old API fully removed"</automated>
  </verify>
  <done>SidebarMode type exported, sidebarState field replaces projectSidebarVisible, all consumers updated, no references to old API remain</done>
</task>

<task type="auto">
  <name>Task 2: Implement dual-mode sidebar in ProjectMenu (hover overlay + click push)</name>
  <files>packages/web/src/components/layout/ProjectMenu.tsx</files>
  <action>
Refactor the sidebar toggle and sidebar rendering in ProjectMenu to support two modes:

**State & refs needed in the component:**
- `sidebarState` / `setSidebarState` from useUIStore (replaces `projectSidebarVisible`)
- `hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>()` for debounce
- `isHoveringRef = useRef(false)` to track hover state

**Toggle button behavior (the PanelRightClose/PanelRightOpen button in the header):**
- `onMouseEnter`: Set `isHoveringRef.current = true`, call `setSidebarState('overlay')` (only if currently `'closed'`)
- `onMouseLeave`: Set `isHoveringRef.current = false`, start a 300ms timeout. In the timeout callback: if `isHoveringRef.current` is still false AND `sidebarState` is `'overlay'`, call `setSidebarState('closed')`
- `onClick`: Clear any hover timeout. If `sidebarState === 'closed'`, call `setSidebarState('sidebar')`. If `sidebarState === 'sidebar'`, call `setSidebarState('closed')`. If `sidebarState === 'overlay'`, call `setSidebarState('sidebar')` (promote overlay to persistent sidebar)

**Overlay mode rendering:**
When `sidebarState === 'overlay'`, render the ProjectSwitcher inside an absolutely-positioned dropdown panel attached to the toggle button area. Use a wrapper div:
```
position: absolute, top: full header height (56px), left: 0, z-50
width: 240px, bg-white, border-r border-b border-slate-200, rounded-br-lg
shadow-lg for depth
```
Do NOT use the full `<aside>` element for overlay — render a lightweight positioned panel with just ProjectSwitcher inside.

**Sidebar mode rendering (existing push behavior):**
When `sidebarState === 'sidebar'`, render the existing `<aside>` element exactly as it works now, with the `w-60` width and `transition-all duration-300` animation. Keep the mobile overlay backdrop too.

**Overlay mouse tracking:**
The overlay panel itself needs `onMouseEnter` (set `isHoveringRef.current = true`, clear any pending timeout) and `onMouseLeave` (set `isHoveringRef.current = false`, start the same 300ms timeout to close).

**Project selection behavior:**
- In overlay mode (`sidebarState === 'overlay'`): after calling `onSwitchProject(id)`, call `setSidebarState('closed')` — overlay auto-hides
- In sidebar mode (`sidebarState === 'sidebar'`): after calling `onSwitchProject(id)`, keep `sidebarState` as `'sidebar'` — sidebar stays open

**Toggle button visibility:**
- In `'closed'` state: show PanelRightClose icon (current default)
- In `'overlay'` state: show PanelRightOpen icon, highlight with active bg
- In `'sidebar'` state: show PanelRightOpen icon, highlight with active bg (current active state). On desktop, keep the button hidden when sidebar is open (current `sm:hidden` behavior) — BUT only for sidebar mode, not overlay mode

**Cleanup:**
- `useEffect` cleanup to clear hover timeout on unmount
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp && npx tsc --noEmit --project packages/web/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>Hover on toggle shows overlay panel with project list (no layout shift). Click on toggle opens push sidebar (layout shifts). Selecting project in overlay closes it. Selecting project in sidebar keeps it open. Moving mouse away from overlay closes it after 300ms delay. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit --project packages/web/tsconfig.json`
2. No references to old `projectSidebarVisible` API remain
3. Build succeeds: `cd packages/web && npm run build`
</verification>

<success_criteria>
- Hover on sidebar toggle opens overlay project list (no content shift)
- Click on sidebar toggle opens push sidebar (current behavior preserved)
- Project selection in overlay auto-closes overlay
- Project selection in sidebar keeps sidebar open
- Mouse-leave from overlay triggers close after 300ms
- No regressions: existing mobile sidebar, backdrop, and all other ProjectMenu functionality unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/260331-udj-sidebar-jira-hover-overlay-behavior/260331-udj-SUMMARY.md`
</output>
