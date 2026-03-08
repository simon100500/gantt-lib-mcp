# Phase 11: Complete Design System - Context

**Gathered:** 2026-03-08
**Status:** Implementation complete

<domain>
## Phase Boundary

Migrate all remaining inline styles to Tailwind CSS + shadcn/ui, completing the design system started in Phase 9-05. OtpModal and ProjectSwitcher already used shadcn/ui — this phase brings App.tsx and ChatSidebar.tsx fully into the system. Adds show/hide task list toggle. Introduces semantic layout (header/main/aside/footer).

</domain>

<decisions>
## Implementation Decisions

### Color palette
- Primary: indigo-violet `hsl(245 70% 60%)` — professional, not cyberpunk (close to reference HTML's #6355e8 but muted)
- Background: `hsl(210 20% 98%)` — near-white slate-50
- Borders: `hsl(214 14% 90%)` — slate-200 equivalent
- Muted text: `hsl(215 16% 47%)` — slate-500 equivalent
- Surfaces (topbar, toolbars, chat): `white`
- Connection online: `emerald-500`; offline: `amber-400`
- Lock toggles active: `amber-500` (distinguishes "disabled" from "enabled" primary controls)

### Typography
- System font (`font-sans`) for all UI — no external font dependency
- `font-mono` for status bar, timestamps — matches reference HTML aesthetic

### Layout structure
- `<header>` h-12: Logo + ProjectSwitcher + Logout
- `<main>` flex-1: GanttToolbar (h-11) + GanttChart (`calc(100vh - 120px)`)
- `<aside>` w-80: ChatSidebar
- `<footer>` h-7: tasks count + connection status
- All via Tailwind, no inline styles

### Toolbar controls
- `ToolbarToggle` DRY component: shared by all 4 feature buttons
- `ToolbarSep` DRY separator component
- Show/hide task list: icon-only button using `PanelLeft` from lucide-react
- Primary toggles (Auto-Schedule, Highlight Expired): `bg-primary` when active
- Lock toggles (Lock Names, Lock Deps): `bg-amber-500` when active — signals a restrictive mode
- Today / Clear: shadcn `Button` variant=outline; Clear has destructive color override

### Chat sidebar
- Controlled input (replaces uncontrolled form element)
- Loading indicator: 3 bouncing dots with staggered delay (replaces JS-injected shimmer)
- Streaming cursor: `animate-pulse` blinking bar
- Message enter animation: custom `animate-fade-up` keyframe
- Quick chips: pre-fill input (not auto-send) — user can edit before sending
- Chips only shown in empty state

### Animations
- All animations respect `prefers-reduced-motion` via `motion-reduce:animate-none`
- Custom keyframes in `@layer utilities`: `fade-up`, `shimmer`
- `animate-fade-up` on every message for enter effect

### Scrollbars
- Global thin scrollbar (5px) via `::-webkit-scrollbar` in index.css

### GanttChart height
- `containerHeight="calc(100vh - 120px)"` — 120px = header(48) + toolbar(44) + footer(28)
- gantt-lib accepts string values and sets them directly as CSS height

### Claude's Discretion
- Gantt toolbar label text (used "View" prefix)
- Exact chip suggestions in ChatSidebar

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectSwitcher.tsx`: already shadcn/ui (DropdownMenu + Button) — kept as-is
- `OtpModal.tsx`: already shadcn/ui (Card + Input + Label) — kept as-is
- `@/lib/utils.cn()`: used throughout for conditional Tailwind classes
- `lucide-react`: already installed (used in ProjectSwitcher) — added Sparkles, ArrowUp, CalendarDays, Trash2, PanelLeft

### Established Patterns
- shadcn/ui `Button` component: variant, size props
- `cn()` from `@/lib/utils` for conditional class merging
- CSS variable token system: `hsl(var(--primary))` throughout tailwind.config.js

### Integration Points
- `showTaskList` state in App.tsx → passed to `GanttChart.showTaskList` prop
- `ToolbarToggle` and `ToolbarSep` defined inline in App.tsx (DRY, single use location)
- `index.css` owns all custom keyframes and scrollbar overrides

</code_context>

<specifics>
## Specific Ideas

- Reference HTML (`gantt-chat.html`): provided structural inspiration — topbar + gantt panel + chat panel + bottombar
- Reference image: showed clean AI chat on left + task table on right — confirmed light/minimal aesthetic
- "No cyberpunk" — accent is indigo not neon purple; no glow effects, no animations on logo
- "Muted tones" — slate palette, not pure black/white contrast
- Lock toggles use amber (not red/destructive) to communicate "restricted mode" rather than "danger"

</specifics>

<deferred>
## Deferred Ideas

- Dark mode — new phase (requires CSS variable overrides for `.dark` class)
- Collapsible chat sidebar (collapse to 0 width with transition) — Phase 10 CONTEXT mentioned as deferred
- Toast notifications for validation errors (currently a small badge in toolbar) — future phase
- Resizable chat sidebar width — future phase

</deferred>

---

*Phase: 11-complete-deisgn-system*
*Context gathered: 2026-03-08*
