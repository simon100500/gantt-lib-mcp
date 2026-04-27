---
phase: 48
slug: resource-screen
status: approved
shadcn_initialized: true
preset: packages/web/components.json; style=default; baseColor=neutral; cssVariables=true; rsc=false; iconLibrary=lucide
created: 2026-04-25
reviewed_at: 2026-04-25T00:00:00+03:00
---

# Phase 48 — UI Design Contract

> Visual and interaction contract for the resource management screen. Generated from `48-CONTEXT.md`, `RESOURCE-MANAGEMENT-SCREEN-PRD.md`, current Tailwind workspace UI, and `gantt-lib` resource planner references.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn initialized in `packages/web`; use existing components before adding new primitives |
| Preset | `default`, Radix base, neutral base color, CSS variables, Vite, TypeScript |
| Component library | Radix via shadcn wrappers: `button`, `card`, `dropdown-menu`, `input`, `label`, `popover`, `separator` |
| Icon library | `lucide-react`; icons only inside clear tool/action buttons |
| Font | `Roboto`, fallback `sans-serif`; `Cascadia Mono` only for existing logo/technical monospace |
| Styling | Tailwind utility classes plus `gantt-lib/styles.css`; do not duplicate resource calendar geometry |
| Renderer | Prefer `<GanttChart mode="resource-planner" />`; direct `ResourceTimelineChart` is allowed only if typing/imports are cleaner |

Existing UI baseline: operational workspace shell, `bg-[#f4f5f7]`, white panels, slate text, compact controls, `rounded-md` controls, `rounded-xl` existing panels, thin scrollbars, focus rings via `ring`.

Primary focal point: the resource timeline. The visual hierarchy is header actions first for creation/refresh, filters and summary second for narrowing the view, timeline bars third for operational scanning, and details drawer fourth for mutation forms. Catalog and details panels must support the timeline, not compete with it.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, compact badge gaps, dense inline metadata |
| sm | 8px | Button/icon gaps, list item gaps, bar inner padding |
| md | 16px | Default panel padding, filter groups, section gaps |
| lg | 24px | Drawer padding, empty/error states, major toolbar groups |
| xl | 32px | Desktop layout gaps between catalog, planner, details regions |
| 2xl | 48px | Large empty-state vertical rhythm only |
| 3xl | 64px | Not used in this phase except full-page centered fallback states |

Exceptions: `gantt-lib` resource planner geometry is locked to `dayWidth=36`, `laneHeight=40`, `rowHeaderWidth=220`, `headerHeight=40`. Interactive text buttons use `h-9` (36px) where existing workspace controls do; icon-only controls must be at least `h-10 w-10` on touch breakpoints.

---

## Typography

Use exactly these four sizes in the phase UI:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Micro label / badge | 12px | 400 | 1.33 |
| Body / controls | 14px | 400 | 1.5 |
| Section heading / selected item title | 16px | 600 | 1.35 |
| Page title / drawer title | 20px | 600 | 1.2 |

Weights are limited to `400` and `600`. Use tabular numerals for counts and dates. Avoid negative letter spacing. Uppercase labels may use existing `tracking-[0.08em]` only for small metric labels already following that pattern.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f4f5f7` | Workspace background and page gutters |
| Secondary (30%) | `#ffffff`, `#f8fafc`, `#e2e8f0` | Panels, catalog rows, timeline surrounds, borders, filter surfaces |
| Accent (10%) | `#6158e0` (`hsl(245 70% 60%)`) | Primary CTA, selected scope/filter state, selected bar outline, focus ring, active toolbar affordances |
| Destructive | `#dc2626` / `red-600` | Remove resource from task, deactivate confirmation, destructive error emphasis only |

Accent reserved for: `Создать ресурс`, selected scope segment, selected catalog row, selected assignment bar outline, keyboard focus ring, active filter count chip, and save actions in details fallback forms. Do not use accent as a general bar color for every assignment.

Semantic state colors:

| State | Value | Usage |
|-------|-------|-------|
| Conflict | `amber-50`, `amber-200`, `amber-700`, `amber-900` | Conflict bars, conflict badges, conflict summary cards, `Исправить конфликт` action |
| Pending / saving | `primary/10` plus spinner or `animate-pulse` dot | Assignment being saved after controlled move; keep last successful data visible |
| Locked / readonly | `slate-100`, `slate-400`, `slate-500` | Locked bar, disabled destructive actions, unauthenticated/cross-project readonly explanation |
| Success / no conflict | `emerald-50`, `emerald-700` | Compact "Без конфликтов" status only |
| Error | `red-50`, `red-200`, `red-700` | Load/save errors with `role="alert"` |

---

## Layout Contract

The screen is an operational tool, not a landing page.

| Region | Contract |
|--------|----------|
| Shell | Full-height workspace surface: `flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]` |
| Header | White, border-bottom. Title `Ресурсы`; subtitle is exactly `Текущий проект` or `Все проекты workspace` based on scope |
| Header actions | Right aligned on desktop, wrapped below on mobile: `Создать ресурс`, `Обновить`, `Вернуться в проект` |
| Status strip | Single compact row in header or directly below filters: loading, saving, pending unsaved operation, and errors must be visible without covering the planner |
| Main desktop layout | Three work zones: left catalog `280-320px`, center timeline `minmax(0,1fr)`, right details drawer `360-420px` when open |
| Main tablet layout | Catalog collapses above or into a toggleable panel; details becomes right drawer overlay |
| Main mobile layout | Filters and catalog stack above timeline; details opens as full-width bottom or page-level drawer; timeline remains horizontally scrollable |
| Timeline | Use `gantt-lib` resource planner as the primary renderer with visible empty resource rows and built-in lanes |
| Summary | Four compact metric cards: resources, assignments, resources with conflicts, conflicting intervals |

Do not place cards inside cards. Panels may be bordered sections, repeated resource rows, or drawers. Avoid decorative gradients, illustration, or marketing copy.

---

## Component Inventory

| Need | Component / Pattern |
|------|---------------------|
| Primary and secondary actions | Existing shadcn `Button` or current workspace button classes |
| Text input | Existing shadcn `Input` or matching `h-9 rounded-md border` input |
| Labels | Existing shadcn `Label`; every filter/control must have a visible label |
| Scope switch | Segmented radio group, not tabs; labels `Текущий проект` and `Все проекты` |
| Type filter | Multi-select checkbox list in popover or compact checkbox group for `human`, `equipment`, `material`, `other` |
| Toggles | Native checkbox/switch-like controls for `Только конфликты` and `Показывать неактивные` |
| Catalog actions | Row action menu or inline compact buttons: rename, type change, deactivate, activate |
| Assignment details | Right drawer/panel with `role="dialog"` semantics when overlayed; fixed header and scrollable body |
| Alerts | Inline bordered alert blocks with `role="alert"` for errors |
| Icons | `Plus`, `RefreshCw`, `ArrowLeft`, `Search`, `Filter`, `AlertTriangle`, `Lock`, `ExternalLink`, `Trash2`, `Check`, `X` from lucide-react |

No third-party registries are approved for this phase.

---

## Resource Planner Renderer Contract

| Setting | Required Value |
|---------|----------------|
| CSS import | Ensure `gantt-lib/styles.css` is imported; current `packages/web/src/main.tsx` already imports it |
| Mode | `mode="resource-planner"` |
| Resources prop | Adapter output from `ResourcePlannerResult` to `ResourceTimelineResource[]` |
| Dense geometry | `dayWidth={36}`, `laneHeight={40}`, `rowHeaderWidth={220}`, `headerHeight={40}` |
| Readonly | Pass `readonly` when unauthenticated, project/scope is readonly, or selected item is not mutable |
| Reassignment lock | Pass `disableResourceReassignment` when selected scope/project state forbids cross-resource moves |
| Item rendering | Use `renderItem` to show task name, project name, date range, conflict badge, pending/locked markers |
| Item classes | Use `getItemClassName` for `normal`, `conflict`, `selected`, `pending`, `locked`, `cross-project` |
| Move callback | `onResourceItemMove` must be controlled and persist only once on drop/mouseup |

Local `ResourceTimelineGrid` may remain only as a deprecated fallback/test fixture and must not be the main renderer.

---

## Visual State Contract

| State | Visual Contract |
|-------|-----------------|
| Normal bar | Muted blue/slate bar with white or high-contrast text, 4px radius from `gantt-lib` variable, truncated title |
| Conflict bar | Amber border/fill, compact badge `Конфликт`, conflict count visible when space allows |
| Selected bar | 2px accent outline or ring, no layout shift |
| Pending bar | Reduced opacity plus spinner/dot; pointer events disabled for that assignment until save/reload completes |
| Locked bar | Slate muted style, `Lock` icon, cursor not-allowed; no destructive actions |
| Cross-project bar | Subtle dashed border or project chip; actions disabled when backend/permissions do not allow mutation |
| Empty resource row | Visible row with resource name and a quiet dashed/empty lane, still a drop target when reassignment is allowed |
| Loading planner | Keep last successful planner data visible when `keepData=true`; show compact loading status rather than blanking the screen |
| Malformed/error planner | Red inline alert with retry button; preserve last successful data if available |
| No resources/data | Empty state below filters, not a modal |

Large resource sets must scroll without breaking header/row alignment. Do not add shadows or decorative chrome that interferes with dense scanning.

---

## Interaction Contract

| Interaction | Contract |
|-------------|----------|
| Scope switch | `current-project` and `all-projects`; switching scope reloads `/api/resources/planner?scope=...` |
| Text search | Client-side search over resource name, task name, project name |
| Type filter | Client-side resource type filtering |
| Conflict-only | Client-side filter; empty rows with no matching items are hidden unless needed to preserve selected/pending context |
| Include inactive | Off by default; inactive resources hidden unless enabled |
| Click bar | Select bar and open assignment details |
| Keyboard bar open | Enter/Space on focused bar opens details |
| Close details | Esc closes drawer; focus returns to the selected bar or nearest stable control |
| Correct conflict | Preserve `onCorrectConflict` and `PlannerCorrectionTarget` flow; label action `Исправить конфликт` |
| Date drag | Same-resource move persists via command commit (`move_task` when duration preserved; `resize_task` or helper for edge/duration change) |
| Resource drag | Cross-resource move replaces only the moved resource in full `resourceIds[]` via `POST /api/tasks/:taskId/assignments` |
| Combined drag | Apply date change first, assignment replacement second; on second-step failure, reload authoritative state and report partial result |
| Refresh | Reload planner and catalog without losing selected filter values |
| Create resource | Supports name, scope `shared`/`project`, and type `human`/`equipment`/`material`/`other` |
| Rename/type/status | Catalog row actions save through `PATCH /api/resources/:resourceId`; reload catalog and planner after success |
| Remove resource from task | Destructive action; requires confirmation and disabled for locked/readonly/cross-project unauthorized items |

All successful mutations reload planner data so conflicts come from backend state. Save failures clear pending state and keep the last successful planner data.

---

## Accessibility Contract

| Area | Requirement |
|------|-------------|
| Filters | Every input/select/toggle has a visible label and focus state |
| Timeline | Container accessible name is exactly `Ресурсный календарь` |
| Bars | `aria-label` includes task, resource, dates, and conflict status |
| Drawer | Opens from mouse click and Enter/Space; closes with Esc; overlay variant uses `role="dialog"` and `aria-modal="true"` |
| Drag fallback | Full keyboard drag is not required; details drawer must provide accessible forms for changing dates and resource |
| Critical actions | Use text labels or textual confirmation, not color-only signaling |
| Alerts | Loading is polite where possible; errors use `role="alert"` |
| Disabled states | Explain why actions are disabled: unauthenticated, readonly project, locked assignment, inactive resource, or cross-project permission |

---

## Responsive Contract

| Breakpoint | Behavior |
|------------|----------|
| `<640px` | Header actions wrap; catalog and filters stack; details drawer becomes full-width bottom/page overlay; timeline horizontally scrolls |
| `640-1023px` | Summary uses two columns; catalog is collapsible above timeline; details overlays right side |
| `>=1024px` | Catalog left, timeline center, details right; planner consumes remaining width |
| All sizes | Text must not overflow buttons/cards; long resource/task/project names truncate with accessible full label/title |

Timeline date columns may overflow horizontally; the page shell must not create a second uncontrolled body scroll.

---

## Copywriting Contract

Preserve Russian product copy where specified by the PRD.

| Element | Copy |
|---------|------|
| Page title | `Ресурсы` |
| Scope subtitle: current project | `Текущий проект` |
| Scope subtitle: all projects | `Все проекты workspace` |
| Primary CTA | `Создать ресурс` |
| Secondary action | `Обновить` |
| Return action | `Вернуться в проект` |
| Search placeholder | `Ресурс, задача или проект` |
| Conflict filter | `Только конфликты` |
| Inactive filter | `Показывать неактивные` |
| Loading state | `Загружаем ресурсный календарь…` |
| Saving state | `Сохранение…` |
| Pending operation | `Есть несохранённая операция` |
| Empty state heading | `Нет ресурсов для отображения` |
| Empty state body | `Создайте ресурс или измените фильтры, чтобы увидеть назначения на календаре.` |
| Unauthenticated readonly | `Войдите, чтобы изменять ресурсы. Сейчас календарь открыт только для просмотра.` |
| Planner error | `Не удалось загрузить ресурсный календарь. Проверьте соединение и повторите загрузку.` |
| Save error | `Не удалось сохранить изменение. Данные возвращены к последнему состоянию сервера.` |
| Version conflict | `Данные проекта изменились. Обновите календарь и повторите действие.` |
| Partial combined failure | `Даты назначения сохранены, но ресурс не изменён. Календарь обновлён по данным сервера.` |
| Assignment details title | `Детали назначения` |
| Open task | `Открыть задачу` |
| Correct conflict | `Исправить конфликт` |
| Change resource | `Сменить ресурс` |
| Remove resource | `Убрать ресурс с задачи` |
| Destructive confirmation | `Убрать ресурс с задачи`: `Ресурс будет снят с этой задачи. Продолжить?`; `Деактивировать ресурс`: `Ресурс станет недоступен для новых назначений. Продолжить?` |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Existing local components only: `button`, `card`, `dropdown-menu`, `input`, `label`, `popover`, `separator` | not required; already installed in `packages/web` |
| third-party | none | no third-party registry allowed for this phase |

---

## Testable UI Acceptance Criteria

- The screen title is `Ресурсы`, and the subtitle switches exactly between `Текущий проект` and `Все проекты workspace`.
- The primary timeline renderer is `GanttChart mode="resource-planner"` or `ResourceTimelineChart`; `ResourceTimelineGrid` is not the main renderer.
- `gantt-lib/styles.css` is available and resource planner geometry uses `dayWidth=36`, `laneHeight=40`, `rowHeaderWidth=220`, `headerHeight=40`.
- Empty resource rows remain visible in the timeline and can be drop targets when reassignment is allowed.
- Summary cards show resource count, assignment count, resources with conflicts, and conflicting intervals.
- Filters work client-side except scope switch, which reloads planner data.
- Conflict bars remain visible, visually distinct, and expose `Исправить конфликт`.
- Clicking or pressing Enter/Space on a bar opens details with task, project, resource, dates, assignment id, and conflict assignment ids.
- Date moves persist through the project command flow and reload planner after success.
- Resource moves persist by full assignment replacement and reload planner after success.
- Combined moves report partial success and reload authoritative state if the second step fails.
- Save errors clear pending state and do not leave false optimistic data.
- Readonly and locked states do not emit mutation callbacks.
- Unauthenticated users see readonly explanatory copy.
- Destructive actions require textual confirmation.
- Tests cover adapter mapping, metadata helper, filters, custom item rendering states, conflict action, date move flow, reassignment flow, readonly/locked blocking, empty resource rows, and error rollback.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-25
