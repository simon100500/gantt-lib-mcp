# Phase 25: Interactive Preview - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

## Phase Boundary

Добавляем интерактивный gantt chart на маркетинговую страницу getgantt.ru. Пользователи могут попробовать drag-to-edit без авторизации — живой демо-опыт.

**Deliverables:**
- gantt-lib интегрирован в packages/site через npm
- Интерактивный график заменяет анимированный GanttPreview.tsx
- 5 демо-задач с drag-to-edit (drag, stretch, collapse/expand)
- Быстрая загрузка, минимальный overhead

**Out of scope:**
- Сохранение изменений (no backend sync)
- Авторизация для демо
- Content pages (Phase 26)
- Domain separation (Phase 27)

## Implementation Decisions

### Integration Approach
- **D-01:** Прямой npm import gantt-lib в packages/site. Используем как React компонент в Astro island. Быстрая загрузка, минимальный overhead для демо-данных. iframe не используем — хуже производительность.

### Demo Data
- **D-02:** Те же 5 этапов из GanttPreview.tsx:
  1. Исследование (Анализ) — синий
  2. Дизайн (UI/UX) — фиолетовый
  3. Разработка (Frontend + API) — cyan
  4. Тестирование (QA) — оранжевый
  5. Релиз (Deploy) — зеленый

### Interaction Scope
- **D-03:** Полный drag-to-edit опыт:
  - Drag задач по timeline (onTasksChange)
  - Stretch duration (растягивание для изменения длительности)
  - Collapse/expand parent tasks (если есть иерархия)
  - Все возможности как в настоящем app

### Placement
- **D-04:** Интерактивный график заменяет анимированный GanttPreview.tsx на главной странице. Плавный переход от AI demo к интерактивному опыту.

### State Persistence
- **D-05:** Никакого сохранения. Изменения только в памяти браузера, теряются при перезагрузке. Это preview, не редактор.

### Claude's Discretion
- Exact timings для анимаций (если нужны fade-in эффекты при загрузке)
- Initial view state (zoom level, scroll position)
- Mobile optimization details (touch events, scrollbar handling)
- Error handling (если gantt-lib не загрузился)

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` — INTER-01 through INTER-05 (Interactive Gantt Preview)

### Existing Implementations
- `packages/web/src/components/GanttChart.tsx` — Референс как использовать gantt-lib с React wrapper
- `packages/web/src/types.ts` — Task interface, TaskDependency, ValidationResult
- `packages/site/src/components/GanttPreview.tsx` — Текущий анимированный preview (для замены)

### Project Context
- `.planning/ROADMAP.md` — Phase 25: Interactive Preview
- `.planning/STATE.md` — Project state, Phase 24 complete

### Prior Context
- `.planning/phases/24-astro-site-foundation/24-CONTEXT.md` — Astro site foundation, design system colors
- `.planning/phases/22-zustand-frontend-refactor/22-CONTEXT.md` — Frontend patterns (если нужен референс)

## Existing Code Insights

### Reusable Assets
- **gantt-lib:** `import { GanttChart } from 'gantt-lib'` — основной компонент
- **Task interface:** `{ id, name, startDate, endDate, color, parentId, progress, dependencies }`
- **Colors:** Индего-фиолетовая схема из packages/web (D-06 from Phase 24)
- **GanttChart.tsx:** Полный wrapper с ref, scroll methods, collapse handlers

### Established Patterns
- **React wrapper pattern:** forwardRef + useImperativeHandle для gantt-lib
- **Task state:** onTasksChange callback для drag-to-edit
- **Astro islands:** `<GanttPreview client:load />` pattern уже используется

### Integration Points
- **New component:** `InteractiveGantt.tsx` или заменить существующий `GanttPreview.tsx`
- **Demo tasks:** Hardcoded array из 5 задач (no backend)
- **Homepage:** `src/pages/index.astro` — Hero section использует GanttPreview

## Specific Ideas

- 5 задач с colors matching текущему preview — визуальная консистентность
- Полный drag-to-edit позволяет пользователям "почувствовать" продукт перед регистрацией
- Быстрая загрузка через прямой import лучше iframe для conversion rate
- Нет сохранения — снижает сложность, пользователи понимают что это preview

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 25-interactive-preview*
*Context gathered: 2026-03-24*
