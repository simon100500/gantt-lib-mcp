# Мини-PRD: Сохранение состояния UI графика

## Контекст

При перезагрузке страницы сбрасывается:
- Режим масштаба (день/неделя/месяц) → всегда возвращается на "день"
- Состояние сворачивания задач → все задачи разворачиваются

Это раздражает пользователей — каждый раз заново настраивать вид.

## Задача

Сохранять состояние UI элементов локально в браузере (localStorage) и восстанавливать при загрузке.

## Что реализовать

### 1. Режим масштаба (viewMode)

**Файл**: `packages/web/src/stores/useUIStore.ts`

- Добавить `persist` middleware от Zustand
- Сохранять `viewMode` в localStorage ключ `gantt_view_mode`
- При инициализации читать из localStorage

### 2. Сворачивание задач (collapsedParentIds)

**Файл**: `packages/web/src/stores/useTaskStore.ts` (или создать `useCollapsedStore.ts`)

- Добавить поле `collapsedParentIds: Set<string>`
- Сохранять в localStorage ключ `gantt_collapsed_parents`
- Методы: `toggleCollapse(parentId)`, `collapseAll()`, `expandAll()`
- Сериализация Set → JSON Array для localStorage

### 3. Передача пропсов в GanttChart

**Файл**: `packages/web/src/components/GanttChart.tsx`

- Добавить пропы: `collapsedParentIds?: Set<string>`, `onToggleCollapse?: (parentId: string) => void`
- Передавать в `GanttLibChart`

### 4. Подключение в ProjectWorkspace

**Файл**: `packages/web/src/components/workspace/ProjectWorkspace.tsx`

- Читать `collapsedParentIds` из store
- Передавать в `GanttChart` вместе с `onToggleCollapse`

## Критические файлы

| Файл | Изменения |
|------|-----------|
| `src/stores/useUIStore.ts` | Добавить persist для viewMode |
| `src/stores/useTaskStore.ts` | Добавить collapsedParentIds + persist |
| `src/components/GanttChart.tsx` | Добавить пропы collapsedParentIds, onToggleCollapse |
| `src/components/workspace/ProjectWorkspace.tsx` | Подключить пропы из store |

## Верификация

1. Открыть график, переключить на "Неделя" → перезагрузить → режим должен остаться "Неделя"
2. Свернуть несколько задач → перезагрузить → задачи должны оставаться свёрнутыми
3. Проверить localStorage в DevTools — должны быть ключи `gantt_view_mode` и `gantt_collapsed_parents`

## Не делать

- Не трогать библиотеку gantt-lib — все нужные пропсы уже есть
- Не менять API MCP — это чисто frontend-состояние
- Не сохранять на сервере — только localStorage в браузере
