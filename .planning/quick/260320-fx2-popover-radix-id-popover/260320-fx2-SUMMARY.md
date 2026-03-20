---
phase: quick-fx2
plan: 260320-fx2
subsystem: UI Components
tags: [popover, radix-ui, relation-chip, ux]
dependency_graph:
  requires:
    - "@radix-ui/react-popover"
  provides:
    - "UI компонент Popover (Radix)"
    - "Компонент RelationChip с Popover"
  affects:
    - "packages/web/src/components"
tech_stack:
  added:
    - "@radix-ui/react-popover: ^1.1.15"
  patterns:
    - "Radix UI primitive composition"
    - "className merging via cn()"
    - "Portal-based rendering"
    - "data-state animation attributes"
key_files:
  created:
    - "packages/web/src/components/ui/popover.tsx"
    - "packages/web/src/components/RelationChip.tsx"
  modified:
    - "packages/web/package.json"
decisions: []
metrics:
  duration: "2m"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase quick-fx2 Plan 260320-fx2: Popover Radix UI для чипа связи Summary

## One-liner
Добавлен Popover компонент от Radix UI и компонент RelationChip, показывающий детали связи задач при клике на чип.

## Objective
Добавить Popover от Radix UI для чипа связи между задачами, показывающий id предшественника при клике.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ---- |
| 1 | Установить @radix-ui/react-popover и создать UI компонент | fc4a2b7 | packages/web/src/components/ui/popover.tsx, packages/web/package.json |
| 2 | Создать компонент RelationChip с Popover | 3bb023a | packages/web/src/components/RelationChip.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Package already installed**
- **Found during:** Task 1
- **Issue:** Пакет @radix-ui/react-popover уже был установлен в проекте (версия ^1.1.15)
- **Fix:** Пропустил шаг установки, сразу создал файл popover.tsx
- **Files modified:** Нет (пакет уже был в package.json)
- **Impact:** Нет, план выполнен успешно

## Auth Gates
None

## Implementation Details

### Popover UI Component
Создан по аналогии с `dropdown-menu.tsx`:
- Экспортируемые компоненты: Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverArrow, PopoverClose
- Использует Portal для рендеринга контента вне DOM иерархии
- Анимации через data-state атрибуты (fade-in, zoom-in, slide-in)
- Поддержка props: align, sideOffset, className

### RelationChip Component
- Показывает predecessorId на кнопке-чипе
- При клике открывает Popover с полной информацией:
  - Предшественник (predecessorId)
  - Преемник (successorId)
  - Тип связи (relationType)
- Стили соответствуют паттернам проекта:
  - border-slate-200, bg-slate-50
  - hover состояния
  - focus ring для accessibility

## Verification

### Automated Checks
- [x] Пакет @radix-ui/react-popover установлен в package.json
- [x] Файл packages/web/src/components/ui/popover.tsx существует
- [x] Файл packages/web/src/components/RelationChip.tsx существует
- [x] `npm run build --workspace=packages/web` проходит без ошибок

### Manual Verification (Recommended)
- [ ] Использовать RelationChip в проекте для проверки Popover при клике
- [ ] Проверить отображение деталей связи (predecessorId, successorId, relationType)
- [ ] Проверить стили чипа и Popover на соответствие проекту

## Success Criteria Met
- [x] Popover UI компонент создан по аналогии с dropdown-menu.tsx
- [x] RelationChip компонент создан и использует Popover
- [x] При клике на чип показывается Popover с id предшественника и деталями связи
- [x] Код соответствует существующим паттернам стилизации в проекте
- [x] Сборка проходит без ошибок

## Next Steps
- Интегрировать RelationChip в UI где отображаются связи задач
- Рассмотреть добавление возможности перехода к связанной задаче из Popover

## Commits
- fc4a2b7: feat(quick-fx2): add Popover UI component from Radix UI
- 3bb023a: feat(quick-fx2): add RelationChip component with Popover

## Self-Check: PASSED

**Files created:**
- [x] packages/web/src/components/ui/popover.tsx
- [x] packages/web/src/components/RelationChip.tsx

**Commits exist:**
- [x] fc4a2b7
- [x] 3bb023a

**Build passed:**
- [x] npm run build --workspace=packages/web
