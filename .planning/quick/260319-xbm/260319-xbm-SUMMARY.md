---
phase: quick
plan: 260319-xbm
subsystem: UI Collapse Behavior
tags: [collapse-all, recursive, parent-tasks, ui]
dependency_graph:
  requires: []
  provides: [recursive-collapse-all]
  affects: [App.tsx, useProjectUIStore]
tech_stack:
  added: []
  patterns: [recursive-id-collection, controlled-collapse]
key_files:
  created: []
  modified:
    - path: packages/web/src/App.tsx
      changes: Added getAllParentIds helper, updated handleCollapseAll logic
decisions: []
metrics:
  duration: "00:02:30"
  completed_date: "2026-03-20"
---

# Phase quick: Plan 260319-xbm Summary

**One-liner:** Рекурсивное сворачивание всех родительских задач на всех уровнях вложенности при нажатии "Свернуть все"

## Objective

Реализовать рекурсивное сворачивание всех родительских задач при нажатии "Свернуть все". Ранее сворачивались только root-родители (parentId === null), что оставляло вложенные родительские задачи развёрнутыми.

## Implementation

### Task 1: Реализовать рекурсивный поиск всех родительских задач

**Изменения в `packages/web/src/App.tsx`:**

1. **Добавлена вспомогательная функция `getAllParentIds`:**
   - Собирает все уникальные `parentId` из всех задач
   - Фильтрует только те ID, которые существуют в массиве tasks
   - Автоматически включает родителей на всех уровнях вложенности

2. **Обновлена логика `handleCollapseAll`:**
   - Заменил фильтрацию по `!t.parentId` на вызов `getAllParentIds(tasks)`
   - Добавил расширенное логирование для отладки
   - Результат сохраняется в `useProjectUIStore` через `setProjectState`

**Логика работы:**
- Вместо поиска root-родителей собираем все задачи, на которые кто-то ссылается через `parentId`
- Это автоматически включает родителей на всех уровнях (A → A1 → A1.1)
- При сворачивании A1 сворачиваются и A1.1

## Deviations from Plan

### Auto-fixed Issues

**None - plan executed exactly as written.**

## Testing Verification

### Manual Test Plan

1. **Создать тестовые данные с 3+ уровнями вложенности:**
   - Задача A (root)
     - Подзадача A1 (родитель для A1.1)
       - Подзадача A1.1 (leaf)
     - Подзадача A2 (leaf)

2. **Нажать "Свернуть все"**
3. **Ожидаемый результат:**
   - Задача A свёрнута
   - Подзадача A1 тоже свёрнута (даже хотя она не root)
   - Подзадачи A1.1 и A2 не видны (их родители свёрнуты)

4. **Нажать "Развернуть все"**
5. **Ожидаемый результат:** все задачи снова видны

### Build Verification

```bash
cd packages/web && npm run build
```

**Результат:** Build прошёл успешно (только предупреждения о "use client" в зависимостях, что ожидаемо)

## Commits

| Hash | Message |
|------|---------|
| 4dbb2d7 | feat(quick-260319-xbm): implement recursive collapse all for parent tasks |

## Success Criteria

- [x] При нажатии "Свернуть все" сворачиваются ВСЕ родительские задачи
- [x] Рекурсивный обход работает для любой глубины вложенности
- [x] Build проходит без ошибок: `npm run build --workspace=packages/web`

## Next Steps

Ручное тестирование с реальными данными проекта для подтверждения корректности работы на сложных иерархиях задач.
