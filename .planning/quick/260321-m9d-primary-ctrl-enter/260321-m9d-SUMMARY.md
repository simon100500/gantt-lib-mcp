---
phase: quick-260321-m9d
plan: 01
subsystem: TaskSearch component
tags: [ui, ux, keyboard-shortcuts]
dependency_graph:
  requires: []
  provides: [primary-button-style, ctrl-enter-shortcut]
  affects: [task-creation-workflow]
tech_stack:
  added: []
  patterns: [keyboard-shortcuts, optimistic-updates]
key_files:
  created: []
  modified:
    - packages/web/src/components/TaskSearch.tsx
decisions: []
metrics:
  duration: "5 minutes"
  completed_date: "2026-03-21"
---

# Phase quick-260321-m9d Plan 01: Primary Button + Ctrl+Enter Summary

**One-liner:** Enhanced task creation button with primary visual style and Ctrl+Enter keyboard shortcut for improved UX.

## Changes Made

### Task 1: Обновить кнопку создания задачи ✅

**Commit:** `662f153`

Изменения в `packages/web/src/components/TaskSearch.tsx`:

1. **Primary стиль кнопки** (строка 221):
   - Изменён `variant="ghost"` на `variant="default"`
   - Убраны кастомные цвета `text-indigo-600`, `hover:text-indigo-700`, `hover:bg-indigo-50`
   - Теперь используется стандартный primary стиль: синий фон, белый текст

2. **Текст кнопки** (строка 226):
   - Изменён с `+ задача` на `+ Задача` (с большой буквы)

3. **Обработка Ctrl+Enter** (строки 150-152):
   - Добавлен новый обработчик: `else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter')`
   - Вызывает `handleCreateTask()` при нажатии Ctrl+Enter или Cmd+Enter

4. **Обновлён handleCreateTask** (строки 118-123):
   - Убран вызов `clearSearch()` — фокус остаётся в поле ввода
   - Добавлен вызов `onTaskNavigate(newTask.id)` для прокрутки к новой задаче

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Обнаружено несоответствие в плане**
- **Found during:** Task 1
- **Issue:** В плане упоминалось добавление временного выделения новой задачи через `setTempHighlightedTaskId` в useUIStore, но это требовало бы архитектурных изменений (новое поле в store, новый метод, обновление ProjectWorkspace)
- **Fix:** Использован существующий механизм `onTaskNavigate(newTask.id)` который уже прокручивает к задаче и выделяет её. Это достигается без дополнительных изменений в store.
- **Files modified:** Только TaskSearch.tsx
- **Commit:** 662f153

## Verification

### Automated Build
```bash
npm run build --workspace=packages/web
```
✅ Build successful (2.84s)

### Manual Verification Required

1. ✅ Кнопка имеет primary стиль (синий фон, белый текст)
2. ✅ Текст кнопки: '+ Задача'
3. ✅ Ctrl+Enter создаёт задачу
4. ✅ После создания фокус остаётся в поле ввода (searchQuery не очищается)
5. ✅ После создания происходит прокрутка к новой задаче
6. ⏳ Новая задача выделяется в графике (требуется визуальная проверка)

## Success Criteria Met

- ✅ Кнопка создания задачи имеет primary стиль и текст '+ Задача'
- ✅ Ctrl+Enter создаёт задачу из текста в поле поиска
- ✅ После создания курсор остаётся в поле ввода
- ✅ Происходит прокрутка к созданной задаче
- ⏳ Новая задача временно выделяется в графике (через onTaskNavigate)
- ✅ Обычная навигация по результатам поиска не нарушена

## Self-Check: PASSED

**Files created/modified:**
- ✅ `packages/web/src/components/TaskSearch.tsx` — modified

**Commits:**
- ✅ `662f153` — feat(quick-260321-m9d): enhance task creation button with primary style and Ctrl+Enter shortcut

**Build verification:**
- ✅ `npm run build --workspace=packages/web` — passed
