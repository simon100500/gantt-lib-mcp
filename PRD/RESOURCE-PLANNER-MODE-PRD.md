# PRD: Resource Planner Mode на базе gantt-lib

## 1. Контекст и цель

Сейчас в `gantt-lib-mcp` есть простая реализация ресурсного планера (`ResourceTimelineGrid`), которая показывает назначения ресурсов и конфликты пересечения. Она полезна, но живёт отдельно от `gantt-lib`, из-за чего календарная сетка, геометрия баров, drag-поведение, стили и дальнейшие улучшения будут расходиться с основной библиотекой.

Цель — перейти к единой библиотеке визуализации: `gantt-lib` должен поддерживать два режима отображения:

- обычный Gantt chart по умолчанию;
- resource planner mode для компактного календаря ресурсов с несколькими полосами внутри одной строки ресурса.

Если режим не указан, поведение должно оставаться полностью совместимым с текущим обычным Gantt chart.

## 2. Product Goals

- Сделать компактный ресурсный календарь, где одна строка соответствует одному ресурсу, а несколько пересекающихся назначений раскладываются по внутренним lanes.
- Переиспользовать календарную сетку, date/geometry utilities, стили и базовые drag-паттерны из `gantt-lib`.
- Не ломать текущую модель `GanttChart`, где строка соответствует задаче и зависимости считаются по task row index.
- Дать `gantt-lib-mcp` понятный путь миграции с текущего `ResourceTimelineGrid` на библиотечный компонент.
- Поддержать drag по датам и перенос назначения между ресурсами без превращения ресурсов в fake parent tasks.

## 3. Non-Goals

- Не добавлять мультиполосность в существующий task-based `GanttChart` как часть основной модели задач.
- Не использовать hierarchy `parentId/children` для моделирования ресурсов и назначений.
- Не запускать dependency engine, auto-schedule и cascade links внутри resource planner mode.
- Не блокировать пересечения на уровне UI в первой версии: overlaps должны визуально раскладываться по lanes.

## 4. Предлагаемый UX

Resource planner показывает таблицу:

- слева список ресурсов;
- справа календарная сетка;
- внутри строки ресурса отображаются assignment bars;
- если bars пересекаются по датам, строка ресурса автоматически увеличивается и показывает bars на нескольких lanes;
- конфликтные bars подсвечиваются и сохраняют действие “исправить”;
- при переносе bar по горизонтали меняются даты задачи/назначения;
- при переносе bar на другую строку меняется ресурс назначения;
- после сохранения planner перезагружается из backend, чтобы показать авторитетное состояние и пересчитанные конфликты.

## 5. Режимы gantt-lib

Публичный API должен поддерживать режимы через discriminated props:

```tsx
<GanttChart tasks={tasks} />

<GanttChart
  mode="resource-planner"
  resources={resources}
  onResourceItemMove={handleMove}
/>
```

Правила совместимости:

- `mode` отсутствует или равен `"gantt"` — используется текущий обычный gantt без изменений.
- `mode="resource-planner"` — используется новый ресурсный renderer.
- Ресурсный renderer может быть реализован отдельным внутренним компонентом `ResourceTimelineChart`, но потребитель может включать его через общий `GanttChart` facade.

## 6. Данные resource planner mode

`gantt-lib-mcp` должен преобразовывать текущий `ResourcePlannerResult` в библиотечную модель:

```ts
interface ResourceTimelineResource {
  id: string;
  name: string;
  items: ResourceTimelineItem[];
}

interface ResourceTimelineItem {
  id: string;          // assignmentId
  resourceId: string;
  taskId: string;
  title: string;       // taskName
  subtitle?: string;   // projectName или другая подпись
  startDate: string | Date;
  endDate: string | Date;
  color?: string;
  metadata?: unknown;  // conflict flags, projectId, original interval
}
```

Для текущего приложения mapping должен быть таким:

- `ResourcePlannerResource.resourceId` → `ResourceTimelineResource.id`;
- `ResourcePlannerResource.resourceName` → `ResourceTimelineResource.name`;
- `ResourcePlannerInterval.assignmentId` → `ResourceTimelineItem.id`;
- `ResourcePlannerInterval.taskId` → `ResourceTimelineItem.taskId`;
- `ResourcePlannerInterval.taskName` → `ResourceTimelineItem.title`;
- `ResourcePlannerInterval.projectName` → `ResourceTimelineItem.subtitle`;
- conflict metadata передаётся через `metadata` или typed extension в web-приложении.

## 7. Поведение сохранения в gantt-lib-mcp

### 7.1 Drag по датам

При drop с изменёнными `startDate/endDate`:

1. найти исходную задачу по `taskId`;
2. вызвать существующий command-based mutation flow (`move_task` или `resize_task` через текущие project command helpers);
3. дождаться успешного ответа;
4. перезагрузить `/api/resources/planner?scope=...`;
5. при ошибке показать planner error/toast и вернуть bar в прежнее положение.

### 7.2 Drag на другой ресурс

При drop на другую resource row:

1. найти все текущие assignments для `taskId` из store;
2. заменить только `fromResourceId` на `toResourceId`;
3. сохранить полный список ресурсов задачи через `/api/tasks/:taskId/assignments`;
4. перезагрузить planner;
5. если backend отклонил операцию, показать ошибку и оставить прежнее состояние.

Если одновременно меняются даты и ресурс, операции должны выполняться в одном пользовательском действии, но технически могут быть двумя последовательными backend calls: сначала schedule command, затем assignment update. После обеих операций planner reload обязателен.

## 8. Конфликты и lanes

- Overlap определяется включительно по датам: интервалы `[startDate, endDate]` пересекаются, если `a.start <= b.end && b.start <= a.end`.
- Layout не должен менять данные, только визуальную lane позицию.
- Lane allocation должен быть стабильным: при одинаковых данных порядок lanes не должен прыгать между render cycles.
- Sort key для стабильности: `startDate`, затем `endDate`, затем `item.id`.
- Bar при drop на ресурс с overlap не отклоняется; он попадает в новую lane.

## 9. Acceptance Criteria

- Обычные вызовы `<GanttChart tasks={...} />` работают без изменения API и визуального поведения.
- `<GanttChart mode="resource-planner" resources={...} />` отображает строки ресурсов и bars назначений.
- Пересекающиеся bars одного ресурса отображаются на разных lanes внутри одной строки ресурса.
- Drag bar по горизонтали вызывает callback с новыми датами.
- Drag bar на другую resource row вызывает callback с новым `resourceId`.
- `gantt-lib-mcp` больше не содержит собственную основную реализацию resource timeline grid, а использует `gantt-lib` mode.
- Кнопки и metadata конфликтов в planner view сохраняются.
- После успешного изменения planner view показывает авторитетные данные backend.

## 10. Test Scenarios

- Resource без назначений показывает empty row state.
- Resource с двумя непересекающимися назначениями показывает оба bar в одной lane.
- Resource с двумя пересекающимися назначениями показывает две lanes.
- Resource с цепочкой частичных overlaps стабильно распределяет bars по минимальному числу lanes.
- Drag внутри той же строки меняет даты и не меняет resource.
- Drag на другую строку меняет resource и сохраняет duration.
- Drop на ресурс с overlap создаёт новую lane после reload/layout.
- Backend error при assignment update откатывает optimistic UI и показывает ошибку.
- Текущий обычный `GanttChart` test suite остаётся зелёным.

## 11. Implementation Phasing

### Phase 1 — gantt-lib foundation

- Добавить resource planner types.
- Добавить lane layout utility.
- Добавить `ResourceTimelineChart` renderer.
- Подключить mode switch в `GanttChart` facade.
- Покрыть layout и базовый render тестами.

### Phase 2 — drag interactions

- Добавить horizontal item drag.
- Добавить vertical resource row hit-testing.
- Добавить callback `onResourceItemMove`.
- Покрыть interaction tests.

### Phase 3 — gantt-lib-mcp migration

- Заменить `ResourceTimelineGrid` на `GanttChart mode="resource-planner"`.
- Подключить mapping planner payload → resource timeline model.
- Подключить сохранение date/resource moves.
- Обновить planner tests.

## 12. Open Decisions

- Делать resize bars в первой версии или только drag-move. Рекомендуемый default: drag-move first, resize вторым PR.
- Экспортировать ли `ResourceTimelineChart` напрямую вместе с mode facade. Рекомендуемый default: да, экспортировать для advanced use, но основной путь документировать через `GanttChart mode`.
- Делать optimistic UI при drag. Рекомендуемый default: показывать preview во время drag, но после drop ждать backend и reload planner как source of truth.
