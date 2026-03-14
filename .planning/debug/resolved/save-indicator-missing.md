---
status: resolved
trigger: "Пропал индикатор сохранения в статус-баре"
created: 2026-03-14T00:00:00.000Z
updated: 2026-03-14T00:00:05.000Z
---

## Current Focus
hypothesis: FIX VERIFIED - User confirmed positioning is correct
test: User confirmed "fixed"
expecting: Session closure and archival
next_action: Archive session and commit changes

## Symptoms
expected: Показывать "Сохранение..." при сохранении, "Сохранено" после изменений
actual: Индикатор полностью отсутствует (original issue) - now appears but needs repositioning
errors: Не указаны
reproduction: Любое действие (изменение задачи, перемещение и т.д.)
started: Раньше работал

## Eliminated

## Evidence
- timestamp: 2026-03-14T00:00:01.000Z
  checked: useAutoSave.ts file
  found: useAutoSave is marked as deprecated with comment "use useBatchTaskUpdate instead"
  implication: The hook that provided savingState is deprecated
- timestamp: 2026-03-14T00:00:01.000Z
  checked: useAutoSave.ts implementation
  found: Still exports SavingState type and has global savingState tracking with notifyListeners
  implication: The infrastructure exists but is not being used
- timestamp: 2026-03-14T00:00:01.000Z
  checked: useBatchTaskUpdate.ts
  found: Does NOT export savingState or any save status tracking
  implication: No save status is exposed to UI components
- timestamp: 2026-03-14T00:00:01.000Z
  checked: App.tsx status bar section (lines 914-931)
  found: Status bar only shows task count and connection status, NO save indicator
  implication: Save indicator was removed during migration
- timestamp: 2026-03-14T00:00:02.000Z
  checked: User verification
  found: User confirmed "индикатор вижу" (indicator is visible)
  implication: Original fix was successful
- timestamp: 2026-03-14T00:00:03.000Z
  checked: User request
  found: User wants "перенеси его справа от Подключено" (move it to the right of Connected)
  implication: Need to reorder status bar elements
- timestamp: 2026-03-14T00:00:04.000Z
  checked: App.tsx status bar layout
  found: Save indicator was before connection status, moved after connection status span
  implication: Save indicator will now appear to the right of "Подключено"

## Resolution
root_cause: useBatchTaskUpdate doesn't track or expose save state; useAutoSave (which had savingState) was deprecated but replacement doesn't provide equivalent functionality
fix: Added SavingState tracking to useBatchTaskUpdate with global state management (same pattern as useAutoSave) and added save indicator to status bar in App.tsx. Repositioned save indicator to the right of connection status.
verification:
- Build successful with no TypeScript errors
- User confirmed original fix works (indicator appears)
- User confirmed repositioning is correct ("fixed")
files_changed:
- D:\Projects\gantt-lib-mcp\packages\web\src\hooks\useBatchTaskUpdate.ts: Added SavingState type, global state tracking, setSavingStateWithReset helper, and save state tracking to all handlers
- D:\Projects\gantt-lib-mcp\packages\web\src\App.tsx: Added save indicator display in status bar, repositioned to right of connection status
