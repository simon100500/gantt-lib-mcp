# Phase 37: Calendar Source of Truth Cleanup - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Source:** Post-phase follow-up from Phase 36 scheduling work

<domain>
## Phase Boundary

Убрать остаточный hardcode праздничных дат из server и web scheduling paths и довести архитектуру до состояния, где календарь живет только в БД и серверных payload.

Фаза покрывает:
- Удаление hardcoded `systemDefaultCalendarDays` из `packages/mcp/src/services/projectScheduleOptions.ts`
- Удаление `packages/web/src/lib/russianHolidays2026.ts` из frontend scheduling path
- Server/API выдачу effective calendar days для текущего проекта или shared project
- Передачу `calendarDays` и `calendarId` в web из сервера
- Построение `weekendPredicate` / `customDays` во frontend только из server payload
- Выравнивание всех scheduling paths на один и тот же набор calendar days

Фаза НЕ покрывает:
- Новый UI для редактирования календарей
- Редизайн схемы БД календарей
- Новый seed/calendar authoring workflow
- Расширение набора календарей beyond existing `ru-default`
</domain>

<current_state>
## Current State

Уже существует:
- таблицы БД `work_calendars`, `calendar_days`, `projects.calendar_id`
- migration применена
- `ru-default` уже seeded в БД
- server runtime уже умеет читать календарь из БД через `packages/mcp/src/services/projectScheduleOptions.ts`

Остаточный hardcode все еще есть в двух местах:
- `packages/mcp/src/services/projectScheduleOptions.ts`
- `packages/web/src/lib/russianHolidays2026.ts`

Проблема:
- один и тот же календарь задублирован в server и web
- при изменении holiday set server и web могут разъехаться
- БД уже стала source of truth, но код частично живет по старой модели
</current_state>

<objectives>
## Target Outcome

Ключевая цель фазы:
- БД и сервер являются единственным source of truth для рабочих/нерабочих дней
- Во frontend не остается статического списка российских праздников

Что должно быть сделано:
1. Убрать hardcoded `systemDefaultCalendarDays` из server helper.
2. Оставить в server только fallback уровня "если БД пуста, это ошибка/empty result", а не встроенный календарь.
3. Убрать `packages/web/src/lib/russianHolidays2026.ts` из frontend scheduling path.
4. Сделать API выдачи effective calendar days для текущего проекта или shared project.
5. Передавать календарные дни в web из сервера и строить `weekendPredicate` / `customDays` уже из server payload.
6. Привести `ProjectWorkspace` и frontend `getProjectScheduleOptions(...)` к работе от `calendarDays` / `calendarId`, а не от локального hardcode.
7. Проверить все path'ы:
   - live drag preview
   - post-drop preview
   - pending replay
   - authoritative server execution
   чтобы они использовали один и тот же набор `calendarDays`.
</objectives>

<verification>
## Verification Focus

Планирование и реализация должны явно проверить:
- что frontend preview и server execution используют одинаковые calendar days
- что shared/read-only project path получает тот же effective calendar payload
- что отсутствие календарных дней в БД не маскируется hardcoded fallback'ом
- что `packages/web/src/lib/russianHolidays2026.ts` больше не участвует в scheduling flow
</verification>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `packages/mcp/src/services/projectScheduleOptions.ts`
- `packages/web/src/lib/russianHolidays2026.ts`
- `packages/web/src/components/ProjectWorkspace` (точный файл определить на этапе планирования)
- frontend `getProjectScheduleOptions(...)` call sites
</canonical_refs>

---

*Phase: 37-calendar-source-of-truth-cleanup*
*Context gathered: 2026-04-01*
