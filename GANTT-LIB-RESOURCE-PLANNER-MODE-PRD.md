# PRD: Resource Planner Mode для gantt-lib

## 1. Summary

Добавить в `gantt-lib` второй режим визуализации: resource planner mode. По умолчанию библиотека продолжает работать как обычный Gantt chart. Если потребитель передаёт `mode="resource-planner"`, библиотека отображает компактный календарь ресурсов: одна строка на ресурс, несколько assignment bars внутри строки, автоматические lanes при пересечениях и drag/drop для изменения дат или ресурса.

Ключевой принцип: не внедрять мультиполосы в существующую task-based модель `GanttChart`, потому что текущие dependencies, hierarchy, drag cascade и row geometry завязаны на “одна задача = одна строка”. Resource planner должен быть отдельным renderer под общим facade API.

## 2. Goals

- Сохранить backward compatibility для текущего `GanttChart` API.
- Добавить `mode?: 'gantt' | 'resource-planner'`, где отсутствие `mode` означает `'gantt'`.
- Переиспользовать существующие date utilities, geometry helpers, grid/header styling и CSS tokens.
- Поддержать компактное отображение пересекающихся назначений через lanes внутри resource row.
- Поддержать drag по датам и перенос item между resource rows через callback.
- Не запускать dependency lines, hierarchy, parent date aggregation и auto-schedule в resource planner mode.

## 3. Public API

### 3.1 Gantt mode

Текущий API остаётся валидным:

```tsx
<GanttChart tasks={tasks} />
```

Эквивалентно:

```tsx
<GanttChart mode="gantt" tasks={tasks} />
```

### 3.2 Resource planner mode

Новый API:

```tsx
<GanttChart
  mode="resource-planner"
  resources={resources}
  onResourceItemMove={handleResourceItemMove}
/>
```

Рекомендуется также экспортировать внутренний специализированный компонент:

```ts
export { ResourceTimelineChart } from './components/ResourceTimelineChart';
```

Но основной documented path — через `GanttChart mode`.

## 4. Types

```ts
export type GanttChartMode = 'gantt' | 'resource-planner';

export interface ResourceTimelineResource<TItem extends ResourceTimelineItem = ResourceTimelineItem> {
  id: string;
  name: string;
  items: TItem[];
}

export interface ResourceTimelineItem {
  id: string;
  resourceId: string;
  taskId?: string;
  title: string;
  subtitle?: string;
  startDate: string | Date;
  endDate: string | Date;
  color?: string;
  locked?: boolean;
  metadata?: unknown;
}

export interface ResourceTimelineMove<TItem extends ResourceTimelineItem = ResourceTimelineItem> {
  item: TItem;
  itemId: string;
  fromResourceId: string;
  toResourceId: string;
  startDate: Date;
  endDate: Date;
}

export interface ResourcePlannerChartProps<TItem extends ResourceTimelineItem = ResourceTimelineItem> {
  mode: 'resource-planner';
  resources: Array<ResourceTimelineResource<TItem>>;
  dayWidth?: number;
  rowHeaderWidth?: number;
  laneHeight?: number;
  headerHeight?: number;
  maxRenderedDays?: number;
  readonly?: boolean;
  renderItem?: (item: TItem) => React.ReactNode;
  getItemClassName?: (item: TItem) => string | undefined;
  onResourceItemMove?: (move: ResourceTimelineMove<TItem>) => void;
}
```

`GanttChartProps` должен стать discriminated union:

- `GanttModeProps<TTask>` для текущего режима;
- `ResourcePlannerChartProps<TItem>` для ресурсного режима.

## 5. Rendering Behavior

- Левая колонка показывает `resource.name`.
- Правая часть показывает календарную сетку с общей date range по всем items.
- Date range строится по минимальной `startDate` и максимальной `endDate`, с тем же multi-month подходом, где это возможно.
- Внутри resource row items раскладываются по lanes.
- Высота resource row = `max(1, laneCount) * laneHeight + verticalPadding`.
- Empty resource row остаётся видимой и занимает одну lane высоты.
- Item bar должен показывать `title`, `subtitle` и date label дефолтным renderer-ом.
- `renderItem` позволяет потребителю отрисовать внутренность bar самостоятельно.
- `getItemClassName` позволяет подсветить conflicts/invalid/custom states без знания доменной модели внутри библиотеки.

## 6. Lane Layout Algorithm

Добавить pure utility, например `layoutResourceTimelineItems`.

Требования:

- Parse dates через существующие UTC/date helpers.
- Invalid date items не должны ломать весь chart; они могут быть исключены из timeline layout и возвращены отдельной диагностикой или отображены как invalid row state.
- Sort items by `startDate`, `endDate`, `id`.
- Размещать item в первую lane, где он не пересекается с последним item lane.
- Inclusive overlap rule: `a.start <= b.end && b.start <= a.end`.
- Возвращать стабильную модель с `laneIndex`, `left`, `width`, `resourceRowTop`, `resourceRowHeight`.

## 7. Drag/Drop Behavior

### Horizontal drag

- Drag item по X меняет `startDate` и `endDate`, сохраняя duration.
- Snap — по day columns.
- Во время drag показывать preview bar position.
- На mouseup вызвать `onResourceItemMove`.

### Vertical drag

- Drag item по Y определяет target resource row по текущей координате.
- Если target row не найден, item возвращается в исходное положение и callback не вызывается.
- Если target resource отличается, callback получает `fromResourceId` и `toResourceId`.
- Drop на ресурс с overlap разрешён; следующий layout положит item в свободную/new lane.

### Locked/readonly

- `readonly` отключает все drag interactions.
- `item.locked` отключает drag конкретного item.

## 8. Explicitly Disabled in Resource Mode

В resource planner mode не рендерить и не применять:

- `DependencyLines`;
- dependency validation/cascade;
- hierarchy indentation/collapse;
- parent date/progress aggregation;
- task list editing;
- task reorder semantics.

Если позже понадобятся связи между resource bars, их следует добавить отдельным lightweight overlay для resource mode, не переиспользуя текущий dependency engine напрямую.

## 9. Styling

- Использовать существующие CSS variables, где они подходят: font, grid lines, weekend background, task bar colors.
- Добавить resource-specific variables:
  - `--gantt-resource-row-header-width`;
  - `--gantt-resource-lane-height`;
  - `--gantt-resource-bar-radius`;
  - `--gantt-resource-bar-conflict-color` если нужен дефолтный конфликтный стиль.
- CSS должен быть namespaced, например `.gantt-resourceTimeline*`, чтобы не ломать существующий `.gantt-taskArea`.

## 10. Acceptance Criteria

- Все существующие тесты обычного `GanttChart` проходят без изменения потребительского кода.
- `mode` отсутствует → рендерится текущий обычный gantt.
- `mode="resource-planner"` → рендерится resource timeline без `tasks`.
- Непересекающиеся items одного ресурса занимают одну lane.
- Пересекающиеся items одного ресурса занимают несколько lanes.
- Row height ресурса зависит от количества lanes.
- Horizontal drag вызывает `onResourceItemMove` с изменёнными датами и тем же resource id.
- Vertical drag на другой ресурс вызывает `onResourceItemMove` с новым target resource id.
- `readonly` и `item.locked` отключают drag.
- `renderItem` и `getItemClassName` работают для кастомной отрисовки и conflict styling.

## 11. Test Plan

### Unit tests

- `layoutResourceTimelineItems` returns one lane for non-overlapping items.
- `layoutResourceTimelineItems` returns multiple lanes for inclusive overlaps.
- Layout is stable for equal dates by item id.
- Invalid date handling does not throw.

### Component tests

- Resource mode renders resource headers and item bars.
- Empty resource row renders with one-lane height.
- Overlapping items increase row height.
- `renderItem` overrides item content.
- `getItemClassName` appends custom class.

### Interaction tests

- Horizontal drag emits changed dates.
- Vertical drag emits changed resource id.
- Drop outside rows emits no move.
- `readonly` prevents callbacks.
- `locked` item prevents callbacks.

### Regression tests

- Existing `GanttChart` task mode snapshots/interactions remain unchanged.
- Existing dependency line tests remain scoped to gantt mode.

## 12. Suggested Implementation Order

1. Add public types and discriminated `GanttChartProps` mode split.
2. Extract/reuse shared calendar range/header/grid pieces where low-risk.
3. Implement pure resource lane layout utility.
4. Implement `ResourceTimelineChart` read-only renderer.
5. Wire `GanttChart mode="resource-planner"` to `ResourceTimelineChart`.
6. Add horizontal drag move.
7. Add vertical resource row drop detection.
8. Add docs/readme examples.
9. Run full test suite and fix only regressions caused by this change.

## 13. Defaults

- `mode`: `'gantt'`.
- `dayWidth`: reuse current Gantt default if available.
- `laneHeight`: `40`.
- `rowHeaderWidth`: current task list width default or `240`.
- `readonly`: `false`.
- Overlaps are allowed and visualized, not rejected.
- Source of truth remains the consumer; library only emits move callbacks and does not mutate input data internally beyond drag preview.
