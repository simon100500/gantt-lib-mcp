# Phase 35: scheduling-core-adoption - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/reference/scheduling-core-adoption-prd.md)

<domain>
## Phase Boundary

Перенести scheduling semantics из актуального `gantt-lib` в `gantt-lib-mcp` как headless server-side engine и подключить его к task mutations, MCP tools, agent verification и persisted UI flow.

Фаза покрывает:
- headless pure scheduling module внутри `packages/mcp/src/`
- command-level mutations (`move_task`, `resize_task`, `recalculate_schedule`)
- server-authoritative persistence и true changed-set contract
- agent/tool guidance для intent-based schedule mutations
- web flow, где клиент применяет итоговый server result

Фаза не покрывает:
- semantic rewrite dependency behavior
- новый persisted public contract без `startDate/endDate`
- blind parity с upstream bugs из Phase 28 `gantt-lib`
</domain>

<decisions>
## Implementation Decisions

### Scheduling core must become pure and headless
- Вынести scheduling logic в reusable pure module под `packages/mcp/src/`
- Не тянуть React/DOM/UI concerns из `gantt-lib`
- Опорой служит `gantt-lib@0.61.0` core scheduling, а не текущий `TaskScheduler`

### Adopt current library behavior, but not confirmed upstream defects
- Сохранять user-visible scheduling semantics `gantt-lib`, если они выглядят intentional
- Не копировать слепо три подтверждённых upstream gaps из PRD
- Каждое intentional divergence от upstream из-за confirmed bug должно быть явно задокументировано

### Command surface is required, raw date rewrites are compatibility-only
- Сервер должен уметь выполнять `move_task`, `resize_task`, `recalculate_schedule`
- Совместимость `update_task(startDate/endDate)` сохраняется, но linked mutations должны маршрутизироваться через scheduling engine
- Agent/tool contract должен выражать scheduling intent, а не низкоуровневый raw date rewrite

### Persist and verify true diffs only
- После schedule command сервер грузит полный project snapshot, исполняет command, сохраняет все changed tasks transactionally
- Parent summary ranges пересчитываются после child/successor changes
- Результат команды должен возвращать true `changedTasks`/`changedIds`, а не full snapshot alias

### Test strategy is regression-first
- Добавить regression tests на FS/SS/FF/SF, positive/negative lag, business/calendar days, chains, multiple predecessors, parent recompute, cycle detection, missing dependency, changed-set contract
- Обязательный regression: successor с двумя roots/predecessors и разными constraint dates
- Обязательный regression: `resize_task(anchor='end')` держит `startDate` fixed, `anchor='start'` держит `endDate` fixed

### Claude's Discretion
- Точная файловая декомпозиция scheduling module внутри `packages/mcp/src/`
- Выбор между локальным port и thin wrapper над shared copied code из `gantt-lib`
- Формат patch metadata и response envelope для MCP/server/web
- Точный rollout order между MCP command surface и web persistence reconciliation
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / planning references
- `.planning/reference/scheduling-core-adoption-prd.md` — canonical PRD and guardrails
- `.planning/ROADMAP.md` — roadmap placement for Phase 35
- `.planning/STATE.md` — active planning state

### Upstream behavioral reference
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/execute.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/cascade.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/commands.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/dependencies.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/hierarchy.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/validation.ts`

### Current MCP implementation to replace or wrap
- `packages/mcp/src/scheduler.ts`
- `packages/mcp/src/services/task.service.ts`
- `packages/mcp/src/index.ts`
- `packages/mcp/src/types.ts`
- `packages/mcp/src/scheduler.test.ts`

### Agent + server integration points
- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`

### Web integration points
- `packages/web/src/hooks/useBatchTaskUpdate.ts`
- `packages/web/src/hooks/useAutoSave.ts`
- `packages/web/src/components/GanttChart.tsx`
- `packages/web/src/components/workspace/ProjectWorkspace.tsx`
</canonical_refs>

<specifics>
## Specific Ideas

### Known upstream gaps that must stay explicit during adoption
- `resizeTaskWithCascade('end', ...)` bug in old upstream semantics must not define MCP command semantics
- `recalculateProjectSchedule()` must use a continuously updated working snapshot or deterministic constraint pass, not independent root cascades
- `ScheduleCommandResult` in MCP must report true diff only

### Existing MCP mismatches observed from code
- `packages/mcp/src/scheduler.ts` is a simplified cascade engine with string-date math and no business-day mode
- `TaskService.runScheduler()` currently updates tasks one-by-one after `recalculateDates()` and does not expose command-level schedule metadata
- `update_task` currently returns heuristic `affectedTasks`/`allTasks` blobs instead of a strict scheduling result contract
- Agent flow in `packages/server/src/agent.ts` verifies broad task-list changes, but prompt/tool surface still centers on generic CRUD operations

### Suggested plan decomposition
1. Port and harden scheduling core + regression coverage
2. Integrate command execution into TaskService/MCP tools and true diff persistence
3. Make server result authoritative for agent/web save flows and tighten mutation verification
</specifics>

<deferred>
## Deferred Ideas

- Unifying `gantt-lib` and `gantt-lib-mcp` onto one physically shared package after migration
- Big-bang replacement of every task CRUD path in one pass
- Any dependency-semantics redesign beyond parity + documented bugfixes
</deferred>

---
*Phase: 35-scheduling-core-adoption*
*Context gathered: 2026-03-31 via PRD Express Path*
