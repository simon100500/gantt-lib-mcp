# Phase 23: filters - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

## Phase Boundary

Добавить UI фильтры задач к Gantt-диаграмме с использованием Task Filtering API из gantt-lib. Фильтры: без зависимостей, просроченные, текстовый поиск, диапазон дат. Управление через отдельный попап с кнопкой в Toolbar.

## Implementation Decisions

### UI Placement
- Кнопка фильтров в Toolbar справа — рядом с viewMode переключателем и выпадающим меню (Ellipsis)
- Использовать существующий паттерн Toolbar + DropdownMenu или Dialog
- Иконка: `Funnel` или `Filter` из lucide-react

### Filter Logic
- AND логика: показывать задачи, которые соответствуют ВСЕМ активным фильтрам
- Использовать `and()` комбинатор из gantt-lib/filters для комбинирования предикатов

### Popup UI Elements
- **Checkbox «Без зависимостей»** — использует `withoutDeps()` фильтр
- **Checkbox «Просроченные»** — использует `expired()` фильтр
- **Текстовый инпут «Поиск»** — использует `nameContains(searchText)` фильтр
- **Date inputs «Диапазон дат»** — использует `inDateRange(from, to)` фильтр
- **Кнопка «Сбросить все»** — сбрасывает все фильтры в undefined/пустые значения

### Visual Indication
- Подсветка кнопки фильтров когда есть активные фильтры (variant="secondary" или другой стиль)
- Бейдж с количеством не нужен, только визуальная индикация активности

### State Management
- Состояние фильтров в useUIStore (или новый useFilterStore)
- Поля: `filterWithoutDeps: boolean`, `filterExpired: boolean`, `filterSearchText: string`, `filterDateFrom: string`, `filterDateTo: string`
- Вычисляемый `taskFilter: TaskPredicate | undefined` на основе состояния

### Persistence
- Сохранять состояние фильтров в localStorage при изменении
- Ключ: `gantt-filters` или `gantt-filter-state`
- Загружать при монтировании компонента

### User Experience
- Real-time применение фильтров — при изменении любого контроля сразу обновляется GanttChart
- Попап закрывается по клику вне (popover/dropdown behavior)
- Фильтры комбинируются через AND: только задачи, соответствующие ВСЕМ условиям

### Integration with GanttChart
- Передавать вычисляемый `taskFilter` prop в GanttChart компонент
- Импортировать фильтры: `import { and, withoutDeps, expired, nameContains, inDateRange } from 'gantt-lib/filters'`
- TypeScript тип: `taskFilter?: TaskPredicate`

## Specific Ideas

- Стиль попапа похож на существующий DropdownMenu в Toolbar (Ellipsis меню)
- Кнопка «Сбросить все» отключена если нет активных фильтров
- Date inputs использовать формат YYYY-MM-DD (ISO strings)
- Текстовый поиск case-insensitive (по умолчанию в nameContains)

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gantt-lib Task Filtering API
- `d:\Projects\gantt-lib\docs\REFERENCE.md` §7.3 — Task Filtering API (complete documentation)
- `d:\Projects\gantt-lib\packages\website\src\app\page.tsx` — Filter UI examples (lines 1107-1235)

### Existing UI Patterns
- `packages/web/src/components/layout/Toolbar.tsx` — Toolbar structure and UI patterns
- `packages/web/src/stores/useUIStore.ts` — Zustand store pattern for state management

## Existing Code Insights

### Reusable Assets
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` — UI компоненты для попапа
- `Button` компонент с variant prop для стилизации
- `useUIStore` — Zustand store паттерн для управления состоянием UI
- `Checkbox` — уже используется в Toolbar (Ellipsis меню)

### Established Patterns
- Toolbar управление через useUIStore (showTaskList, viewMode, etc.)
- localStorage persistence используется в `packages/web/src/hooks/useLocalTasks.ts`
- Zustand store: `state` + `actions` в одном файле

### Integration Points
- `packages/web/src/components/layout/Toolbar.tsx` — добавить кнопку фильтров
- `packages/web/src/components/GanttChart.tsx` — передать taskFilter prop
- `packages/web/src/stores/useUIStore.ts` — расширить для состояния фильтров

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 23-filters*
*Context gathered: 2026-03-20*
