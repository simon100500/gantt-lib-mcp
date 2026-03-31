# Phase 36: Unified Scheduling Core - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/reference/unified-scheduling-core-prd.md)

<domain>
## Phase Boundary

Реализовать единую scheduling authority модель: все изменения проекта — typed commands, один scheduling core, server как единственный источник истины, deterministic/explainable/versioned результаты.

Фаза покрывает:
- Один shared scheduling core (`gantt-lib/core/scheduling`) для всех каналов (frontend preview, server commit, MCP, import)
- Command-driven mutation model: typed `ProjectCommand` discriminated union вместо raw field rewrites
- Project versioning с монотонным version counter
- Event log (`ProjectEvent`) с command + result + patches для каждой committed mutation
- Patch/result explainability (`Patch.reason`: direct_command / dependency_cascade / calendar_snap / parent_rollup / constraint_adjustment)
- Optimistic concurrency с `baseVersion` на commit endpoint
- Preview/commit parity — один core для обоих
- Три раздельных state-слоя на frontend: `confirmed`, `pending`, `dragPreview`
- Видимый snapshot = `confirmed + replay(pending)` или active dragPreview
- Миграция существующих mutation paths через command execution

Фаза НЕ покрывает:
- Full multiplayer OT/CRDT collaboration
- Permissions redesign
- Visual history UI (beyond basic persistence)
- Full undo/redo UI
- Semantic redesign dependency logic
- Full event-sourced reconstruction (модель snapshot + log, не чистый event sourcing)
</domain>

<decisions>
## Implementation Decisions

### One shared scheduling core — locked
- `gantt-lib/core/scheduling` — единственный execution engine
- Никаких отдельных local scheduler реализаций с authoritative статусом
- Все каналы: frontend preview, server commit, MCP, import — используют один и тот же импорт

### Core публичный API должен быть stabilized и экспортирован — locked
- Финализировать public API `gantt-lib/core/scheduling`
- Экспортировать stable command/result types как subpath export
- Non-React consumers должны мочь импортировать cleanly (без React/DOM зависимостей)
- Добавить packaging/tests для subpath export

### Server заменяет local authoritative scheduler — locked
- Убрать `gantt-lib-mcp` local authoritative scheduler path
- Переключить server execution на импортированный `gantt-lib/core/scheduling`
- Compatibility adapters — только там, где абсолютно необходимо

### Command model — typed discriminated union — locked
- `ProjectCommand` — discriminated union по `type`
- Минимальный набор команд: `move_task`, `resize_task`, `set_task_start`, `set_task_end`, `change_duration`, `create_task`, `delete_task`, `create_dependency`, `remove_dependency`, `change_dependency_lag`, `recalculate_schedule`, `reparent_task`, `reorder_task`
- `command.payload: unknown` — НЕ допустим
- Raw field-level updates становятся internal compatibility shims, не основным путём

### Command rules — locked
- Команды описывают intent, не низкоуровневые persistence mutations
- Изменение дат задачи НЕ мутирует lag молча
- Изменения linked tasks ДОЛЖНЫ идти через core execution
- Каждая committed команда возвращает: changed entities, conflicts, reasons, final snapshot/patch set

### Server command commit endpoint — locked
- Добавить/стандартизировать command commit endpoint
- Persist versioned project events в event log
- Return authoritative execution result (`ScheduleExecutionResult`)
- Optimistic concurrency с `baseVersion` + `clientRequestId`
- Commit semantics: atomic — либо полностью accepted, либо fully rejected (partial apply out of scope)
- Bumping project version атомарно
- Успех только после DB state + event log + version bump в одной транзакции

### CommitProjectCommandRequest/Response contracts — locked
```ts
type CommitProjectCommandRequest = {
  projectId: string;
  clientRequestId: string;
  baseVersion: number;
  command: ProjectCommand;
};

type CommitProjectCommandResponse =
  | { clientRequestId: string; accepted: true; baseVersion: number; newVersion: number; result: ScheduleExecutionResult; snapshot: ProjectSnapshot; }
  | { clientRequestId: string; accepted: false; reason: 'version_conflict' | 'validation_error' | 'conflict'; currentVersion: number; snapshot?: ProjectSnapshot; conflicts?: Conflict[]; };
```

### ScheduleExecutionResult model — locked
```ts
type ScheduleExecutionResult = {
  snapshot: ProjectSnapshot;
  changedTaskIds: string[];
  changedDependencyIds: string[];
  conflicts: Conflict[];
  patches: Patch[];
};
```

### ProjectEvent model — locked
```ts
type ProjectEvent = {
  id: string;
  projectId: string;
  baseVersion: number;
  version: number;
  applied: boolean;
  actorType: 'user' | 'agent' | 'system' | 'import';
  actorId?: string;
  coreVersion: string;
  command: ProjectCommand;
  result: { changedTaskIds: string[]; changedDependencyIds: string[]; conflicts: Conflict[]; };
  patches: Patch[];
  executionTimeMs: number;
  createdAt: string;
};
```

### Patch model — locked
```ts
type Patch = {
  entityType: 'task' | 'dependency';
  entityId: string;
  before: JsonValue;
  after: JsonValue;
  reason: 'direct_command' | 'dependency_cascade' | 'calendar_snap' | 'parent_rollup' | 'constraint_adjustment';
};
```

### Frontend state model — три слоя — locked
```ts
type ProjectState = {
  confirmed: { version: number; snapshot: ProjectSnapshot; };
  pending: { requestId: string; baseVersion: number; command: ProjectCommand; }[];
  dragPreview?: { command: ProjectCommand; snapshot: ProjectSnapshot; };
};
```

### Visible snapshot derivation rule — locked
```ts
function getVisibleSnapshot(state: ProjectState): ProjectSnapshot {
  if (state.dragPreview) return state.dragPreview.snapshot;
  let snapshot = state.confirmed.snapshot;
  for (const pending of state.pending) {
    snapshot = executeCommand(snapshot, pending.command).snapshot;
  }
  return snapshot;
}
```

### Frontend commit flow — locked
1. On submit: build typed command + `clientRequestId`
2. Add to `pending` as optimistic state
3. Send `command + baseVersion + clientRequestId` to server
4. On server response: match by `clientRequestId`, accept server snapshot as truth, update `confirmed`, remove from `pending`, clear/rebuild dragPreview

### Frontend MUST NOT — locked
- Persist raw guessed cascades как authoritative state
- Bypass core для linked task edits
- Использовать snapshot comparison как rule для accepting truth (только для debug/diagnostics)

### Scheduling behavior requirements — locked
1. Dependency preservation: type и lag остаются нетронутыми
2. Full cascade: вся affected chain пересчитывается
3. Strongest constraint wins для multiple predecessors
4. Calendar parity: business-day logic идентична в preview и commit
5. Hierarchy parity: parent summary ranges идентичны в preview и commit
6. Manual/locked tasks: не двигаются молча — либо block, либо explicit conflict
7. Explainability: каждое изменение attributable к причине (direct/cascade/rollup/calendar/constraint)

### MCP/Agent requirements — locked
- Предпочитать intent-level commands
- Не использовать raw dates когда есть dependencies
- Получать authoritative result с full changed set
- Уметь объяснить cascade в user-visible terms
- НЕ утверждать что изменилась только одна задача если cascade задел несколько

### Import requirements — locked
- Переводить импортированные изменения в commands/command batches
- Прогонять через тот же core execution path
- Produce versioned event records
- НЕ писать task rows напрямую как bypass вокруг scheduling

### Non-negotiable invariants — locked
1. One command engine
2. One authoritative persisted result
3. One concurrency model
4. No hidden lag rewrites
5. No separate scheduling rules by channel
6. Every committed change is explainable
7. Server-confirmed version — единственная truth boundary
8. Frontend predicts; server confirms
9. Current state — snapshot-based; history — log-assisted, not event-sourced-only

### Architectural position — locked
- НЕ full event sourcing
- Snapshot + log architecture
- Canonical current state — normalized project snapshot в DB
- Event log — для audit, replay, diagnostics, future undo/redo
- Full historical reconstruction from log alone — NOT required

### Migration phasing — Claude's Discretion
- PRD предлагает 6 фаз миграции — конкретный breakdown задач решает planner
- Порядок: stabilize core → replace local server scheduler → command endpoint → frontend preview parity → import parity → explainability/replay

### Test requirements — locked
Core tests: FS/SS/FF/SF, positive/negative lag, multiple predecessors, chain cascade, business-day, calendar-day, parent rollup, locked/manual conflict, deterministic ordering, patch reason generation

Parity tests: same command на frontend snapshot vs server snapshot; drag preview vs commit result; MCP `move_task` vs UI move; import command batch vs direct API command

Concurrency tests: stale `baseVersion`, current `baseVersion`, replay exact event on historical snapshot

### Claude's Discretion
- Конкретная файловая структура для shared core export в `gantt-lib`
- Порядок задач и wave assignments
- DB schema для `ProjectEvent` и `ProjectVersion`
- HTTP endpoint naming conventions
- Rollout strategy для существующих web/MCP hooks
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / planning references
- `.planning/reference/unified-scheduling-core-prd.md` — canonical PRD для Phase 36
- `.planning/reference/scheduling-core-adoption-prd.md` — PRD Phase 35 (предшественник)
- `.planning/phases/35-scheduling-core-adoption/35-CONTEXT.md` — решения Phase 35
- `.planning/phases/35-scheduling-core-adoption/35-VERIFICATION.md` — verified результаты Phase 35
- `.planning/ROADMAP.md` — roadmap placement
- `.planning/STATE.md` — active planning state

### Upstream shared core (gantt-lib) — subpath export target
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/execute.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/cascade.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/commands.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/dependencies.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/hierarchy.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/src/core/scheduling/validation.ts`
- `D:/Проекты/gantt-lib/packages/gantt-lib/package.json` — exports config

### Current MCP server implementation (to migrate)
- `packages/mcp/src/scheduler.ts` — текущий local scheduler (to be replaced)
- `packages/mcp/src/services/task.service.ts` — TaskService с current mutation logic
- `packages/mcp/src/index.ts` — MCP tool definitions
- `packages/mcp/src/types.ts` — типы

### Web frontend integration points (to migrate)
- `packages/web/src/hooks/useBatchTaskUpdate.ts`
- `packages/web/src/hooks/useAutoSave.ts`

### Server integration
- `packages/server/src/agent.ts`

</canonical_refs>

<specifics>
## Specific Ideas

### Phase 35 foundation
Phase 35 выполнила: headless scheduling core port в MCP, command-level mutations (move_task/resize_task/recalculate_schedule), server-authoritative persistence, true changed-set contract, regression test suite. Phase 36 строится на этой основе и выполняет более широкую интеграцию — shared export из gantt-lib, command endpoint с versioning/event log, frontend state model, MCP/import channel parity.

### Snapshot + log (не event sourcing)
Явный выбор архитектуры: DB хранит canonical current state как normalized snapshot. Event log — дополнение для audit/replay/debug. Полная реконструкция из log alone — не требуется. Это снижает complexity по сравнению с pure event sourcing.

### Parity test key scenarios
- Frontend preview на snapshot A + `move_task(X, delta=3)` → должен дать тот же result что server commit с тем же snapshot и командой
- MCP `move_task` и UI drag на ту же задачу в том же project state → идентичный cascade

### Risks
- Frontend preview и server commit могут расходиться если используют разные adapter layers вокруг одного core
- Import migration может выявить legacy assumptions в task persistence
- Compatibility shims могут lingering и сохранять bypass paths
- Pending-command replay нестабилен если command definitions не детерминированы
</specifics>

<deferred>
## Deferred Ideas

- Full multiplayer OT/CRDT collaboration
- Permissions redesign
- Billing/plan enforcement unrelated to scheduling
- Visual history UI beyond basic event persistence
- Full undo/redo UI
- Semantic redesign dependency logic beyond current intended model
- Patch-only responses (без snapshot) как оптимизация — будущая работа после первой реализации
- Full historical reconstruction from event log alone

</deferred>

---

*Phase: 36-unified-scheduling-core*
*Context gathered: 2026-03-31 via PRD Express Path*
