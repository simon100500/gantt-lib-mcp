---
phase: quick
plan: 008
subsystem: web-ui
tags: [i18n, ux, ui-improvement]
dependency_graph:
  requires: []
  provides: [russian-ui, panel-visibility-toggle]
  affects: [user-experience, localization]
tech_stack:
  added: []
  patterns: [conditional-rendering, state-visibility, i18n-hardcoded]
key_files:
  created: []
  modified:
    - path: packages/web/src/App.tsx
      changes: Added Russian translations, chatSidebarVisible state, accent show button
    - path: packages/web/src/components/ChatSidebar.tsx
      changes: Added Russian translations, onClose prop, X close button
    - path: packages/web/src/components/ProjectSwitcher.tsx
      changes: Added Russian translations
    - path: packages/web/src/components/OtpModal.tsx
      changes: Added Russian translations
decisions: []
metrics:
  duration: 6
  completed_date: 2026-03-08
---

# Phase Quick Plan 008: Russian UI with Agent Panel Toggle Summary

Russian language localization for the web UI with collapsible agent sidebar featuring an accent "Show tasks" button for improved workspace management.

## One-Liner
Полная русификация интерфейса с возможностью скрытия панели агента через кнопку X и акцентной кнопкой "Показать задачи" в фиксированной позиции.

## Implementation Summary

### Task 1: Russian UI Translation
Translated all user-facing strings across four components:

- **App.tsx**: Menu items ("Выйти", "Авто-планирование", "Просроченные", "Блок. названия", "Блок. связи", "Сегодня", "Очистить"), connection status ("Подключено", "Переподключение"), loading states ("Загрузка"), task counter with proper Russian pluralization
- **ChatSidebar.tsx**: "AI Ассистент", "AI Гант-ассистент", quick chips ("Добавить задачу", "Сдвинуть сроки", "Связать задачи", "Показать сводку"), placeholders ("AI думает", "Сообщение AI")
- **ProjectSwitcher.tsx**: "Новый проект", "Название нового проекта", error messages
- **OtpModal.tsx**: "Вход в Gantt", "Проверьте email", all form labels and validation errors

### Task 2: Agent Panel Visibility Control
Added collapsible sidebar functionality:

- Added `chatSidebarVisible` state to App.tsx (defaults to `true`)
- Added `onClose?: () => void` prop to ChatSidebar component
- Added X close button to ChatSidebar header with hover styling
- Conditionally render ChatSidebar based on visibility state
- Added accent "Показать задачи" button with:
  - Fixed positioning: `bottom-8 left-4`
  - Primary color scheme: `bg-primary text-primary-foreground`
  - Sparkles icon from lucide-react
  - Shadow and hover effects
  - Only visible when sidebar is hidden

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### Russian Pluralization
Implemented proper Russian pluralization for task count:
```tsx
{tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
```
- 1 задача
- 2-4 задачи
- 5+ задач

### State Management
```tsx
const [chatSidebarVisible, setChatSidebarVisible] = useState(true);
```

### Conditional Rendering Pattern
```tsx
{chatSidebarVisible && (
  <aside>...</aside>
)}
{!chatSidebarVisible && (
  <button>Показать задачи</button>
)}
```

## Files Modified

| File | Lines Changed | Description |
|------|---------------|-------------|
| packages/web/src/App.tsx | +25, -15 | Russian translations, visibility state, accent button |
| packages/web/src/components/ChatSidebar.tsx | +13, -1 | Russian translations, onClose prop, X button |
| packages/web/src/components/ProjectSwitcher.tsx | +2, -2 | Russian translations |
| packages/web/src/components/OtpModal.tsx | +10, -10 | Russian translations |

## Commits

1. `ebf941e` - feat(quick-008): translate UI to Russian language
2. `5d27246` - feat(quick-008): add agent panel close button with accent show button
3. `e1c4ec1` - fix(quick-008): make mode toggle buttons icon-only (Clock, AlertTriangle, Lock, Link icons)

## Post-Completion Fixes

**Issue:** Mode toggle buttons had text labels instead of icons.

**Fix:** Changed ToolbarToggle component to icon-only square buttons (w-7 h-7):
- Auto-Schedule → Clock icon
- Highlight Expired → AlertTriangle icon
- Lock Names → Lock icon
- Lock Deps → Link icon
- Added aria-label and title for accessibility

## Self-Check: PASSED

All modified files exist and contain expected changes. Commits verified.
