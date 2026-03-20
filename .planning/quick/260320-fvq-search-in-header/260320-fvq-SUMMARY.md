---
phase: quick
plan: 260320-fvq
subsystem: "Поиск задач в хедере"
tags: [search, ui, header, navigation]
dependency_graph:
  requires: []
  provides: [task-search-component, search-state-in-ui-store]
  affects: [ProjectMenu, GanttChart]
tech_stack:
  added: []
  patterns:
    - "Zustand store для состояния поиска"
    - "Imperative handle для прокрутки к задаче"
    - "Controlled input с локальным состоянием"
key_files:
  created:
    - "packages/web/src/components/TaskSearch.tsx"
  modified:
    - "packages/web/src/stores/useUIStore.ts"
    - "packages/web/src/components/layout/ProjectMenu.tsx"
    - "packages/web/src/App.tsx"
decisions: []
metrics:
  duration: "10 minutes"
  completed_date: "2026-03-20"
---

# Phase quick Plan 260320-fvq: Поиск задач в хедере Summary

Добавлен поиск по задачам в хедер приложения с навигацией между результатами и прокруткой к найденным задачам.

## One-liner

Компонент поиска задач в хедере с навигацией вперёд/назад, счётчиком результатов и прокруткой к найденным задачам через ganttRef.scrollToTask.

## Deviations from Plan

None - plan executed exactly as written.

## Implementation Details

### Task 1: Состояние поиска в useUIStore

Добавлено в `packages/web/src/stores/useUIStore.ts`:
- `searchQuery: string` — текущий поисковый запрос
- `searchResults: string[]` — массив ID найденных задач
- `searchIndex: number` — индекс текущего результата (-1 если нет выбора)
- `setSearchQuery: (query: string, tasks: Task[]) => void` — фильтрует задачи по имени (case-insensitive, includes)
- `navNext: () => void` — переходит к следующему результату (циклично)
- `navPrev: () => void` — переходит к предыдущему результату (циклично)
- `clearSearch: () => void` — сбрасывает поиск

### Task 2: Компонент TaskSearch

Создан `packages/web/src/components/TaskSearch.tsx`:
- Input (из ui/input.tsx) для ввода поискового запроса
- Кнопки навигации (ChevronDown/ChevronUp из lucide-react) для вперёд/назад
- Счётчик результатов: "3/10" (текущий/всего)
- Кнопка закрытия (X из lucide-react)
- Иконка поиска (Search из lucide-react) для открытия
- При нажатии на кнопки навигации вызывается `onTaskNavigate(taskId)`

### Task 3: Интеграция в ProjectMenu

Обновлён `packages/web/src/components/layout/ProjectMenu.tsx`:
- Добавлен `ganttRef: React.RefObject<GanttChartRef>` в props
- Импортирован `TaskSearch` и `GanttChartRef`
- TaskSearch добавлен в хедер между названием проекта и правой частью
- Передан `onTaskNavigate={(taskId) => ganttRef.current?.scrollToTask(taskId)}`

Обновлён `packages/web/src/App.tsx`:
- Передан `ganttRef={ganttRef}` в `ProjectMenu`

## Verification

- Компонент поиска виден в хедере (иконка лупы)
- При нажатии открывается input для ввода текста
- Ввод текста фильтрует задачи по имени
- Навигация работает циклично (с последнего на первое)
- Прокрутка к задаче работает через `ganttRef.scrollToTask`
- Счётчик результатов корректен (текущий/всего)
- Закрытие поиска (кнопка X) сбрасывает состояние
- Сборка прошла успешно: `npm run build --workspace=packages/web`

## Commits

- `be0763f` - feat(260320-fvq): add search state to useUIStore
- `bdf4361` - feat(260320-fvq): create TaskSearch component
- `27c738a` - feat(260320-fvq): integrate TaskSearch into ProjectMenu header

## Self-Check: PASSED

**Files created:**
- `packages/web/src/components/TaskSearch.tsx` - FOUND

**Files modified:**
- `packages/web/src/stores/useUIStore.ts` - FOUND
- `packages/web/src/components/layout/ProjectMenu.tsx` - FOUND
- `packages/web/src/App.tsx` - FOUND

**Commits verified:**
- `be0763f` - FOUND
- `bdf4361` - FOUND
- `27c738a` - FOUND
