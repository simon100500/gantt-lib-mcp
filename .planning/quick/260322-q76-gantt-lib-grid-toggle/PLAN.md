# Quick Task 260322-q76: Добавить showChart пропс и двойной toggle

## Задача
Обновилась библиотека gantt-lib - добавился пропс `showChart` для скрытия календаря (grid). Нужно сделать двойной toggle-переключатель для скрытия календаря/тасклиста. При скрытии обоих должен переключаться и оставаться один.

## План

### 1. Обновить GanttChart.tsx
**Файл:** `packages/web/src/components/GanttChart.tsx`
- Добавить `showChart?: boolean` в props
- Прокинуть в `GanttLibChart`

### 2. Обновить useUIStore
**Файл:** `packages/web/src/stores/useUIStore.ts`
- Добавить `showChart: boolean` в state (по умолчанию `true`)
- Добавить `setShowChart` action

### 3. Обновить Toolbar.tsx
**Файл:** `packages/web/src/components/layout/Toolbar.tsx`
- Заменить кнопку "Список задач" на двойной toggle
- Логика: при клике на скрытый элемент - показывает его, при клике на видимый - скрывает, но если это последний видимый - переключается на другой

### 4. Обновить ProjectWorkspace.tsx
**Файл:** `packages/web/src/components/workspace/ProjectWorkspace.tsx`
- Прокинуть `showChart` из useUIStore в GanttChart
