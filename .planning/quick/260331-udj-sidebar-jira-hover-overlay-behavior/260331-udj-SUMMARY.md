---
phase: quick
plan: 260331-udj
subsystem: web-ui
tags: [sidebar, ux, overlay, hover, zustand]
dependency_graph:
  requires: [useUIStore, ProjectMenu, ProjectSwitcher, App]
  provides: [SidebarMode, dual-mode-sidebar]
  affects: [sidebar-toggle, project-switching]
tech_stack:
  added: [SidebarMode type, useRef debounce pattern]
  patterns: [hover-overlay, push-sidebar, dual-mode-toggle]
key_files:
  created: []
  modified:
    - packages/web/src/stores/useUIStore.ts
    - packages/web/src/components/layout/ProjectMenu.tsx
    - packages/web/src/App.tsx
decisions:
  - SidebarMode = 'closed' | 'overlay' | 'sidebar' — tri-state replaces boolean
  - Overlay panel positioned absolutely relative to flex container (not inside aside)
  - 300ms debounce on mouse-leave for overlay close
  - Sidebar mode keeps sidebar open after project selection (change from previous close behavior)
metrics:
  duration: 4m
  tasks: 2
  files: 3
  completed: "2026-03-31"
---

# Quick Task 260331-udj: Jira-like Sidebar Hover/Overlay Summary

Hover overlay + click push dual-mode sidebar с триггерной кнопкой. Overlay показывает список проектов без сдвига layout, push sidebar работает как раньше.

## What Changed

### useUIStore.ts
- Добавлен `export type SidebarMode = 'closed' | 'overlay' | 'sidebar'`
- `projectSidebarVisible: boolean` заменён на `sidebarState: SidebarMode`
- `setProjectSidebarVisible` заменён на `setSidebarState`

### App.tsx
- `setProjectSidebarVisible(false)` заменён на `setSidebarState('closed')`

### ProjectMenu.tsx
- Hover на toggle кнопку открывает overlay (`sidebarState = 'overlay'`) -- абсолютно позиционированная панель без сдвига layout
- Click на toggle: closed -> sidebar, sidebar -> closed, overlay -> sidebar (promote)
- Mouse leave с toggle + overlay запускает 300ms debounce, затем закрывает overlay
- Выбор проекта в overlay закрывает overlay, в sidebar оставляет открытым
- Toggle кнопка видна на десктопе в overlay режиме (скрыта только в sidebar/push режиме)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript: `tsc --noEmit` passed clean
- Old API: `grep projectSidebarVisible` returned zero results
- Build: `npm run build` succeeded (3.69s)

## Self-Check

- [x] packages/web/src/stores/useUIStore.ts exists with SidebarMode type
- [x] packages/web/src/App.tsx uses setSidebarState('closed')
- [x] packages/web/src/components/layout/ProjectMenu.tsx has dual-mode logic
- [x] Commit 3f65e65: store refactor + App.tsx
- [x] Commit eee8c8d: dual-mode ProjectMenu

## Self-Check: PASSED
