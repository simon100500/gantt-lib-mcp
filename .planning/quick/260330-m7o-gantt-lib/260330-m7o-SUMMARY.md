# Quick Task 260330-m7o Summary

## Scope

Добавлен проектный режим расчёта графика `ganttDayMode` с вариантами `business` и `calendar`, сохранением в БД и переключателем в меню `...` на toolbar над графиком.

## Delivered

- В Prisma `Project` появился `ganttDayMode` с дефолтом `business`, плюс migration `20260330130500_add_project_gantt_day_mode`.
- Backend теперь возвращает `ganttDayMode` во всех project payloads auth/share/project flow и принимает частичный `PATCH /api/projects/:id` для `name` и/или `ganttDayMode`.
- Frontend auth store хранит `ganttDayMode` в `project` и `projects`, обновляет его через единый `updateProject(...)` с auth-retry.
- Toolbar получил два пункта в меню `...`: `Рабочие дни` и `Календарные дни`; выбранный режим помечается checkmark.
- `ProjectWorkspace` мапит `ganttDayMode` в `GanttChart.businessDays`, shared view читает режим из share payload, guest mode остаётся на безопасном дефолте `business`.

## Verification

- `npm.cmd run build -w packages/web` — passed
- `npm.cmd run build -w packages/mcp` — passed
- `cmd /c npx tsc -p packages\\server\\tsconfig.json --noEmit` — passed
- `npm.cmd run build -w packages/server` — blocked by EPERM on locked files in `packages/server/dist`, не из-за type errors

## Notes

- `prisma generate` частично обновил client artifacts, но повторный запуск уткнулся в блокировку `packages/mcp/dist/prisma-client/query_engine-windows.dll.node`; для кода это не стало блокером, потому что `mcp` build уже прошёл после обновления generated typings.
