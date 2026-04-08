# Session Handoff

## Scope

This handoff continues Phase 41 remediation work after the move to:

- `LLM generates structure`
- `server deterministically compiles and commits`

The current focus is not generic refactoring.
The focus is closing the product gaps still visible in live runs.

## Current Status

### Completed in this session

1. Added raw planner request/response logging for initial generation

Files:

- [orchestrator.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\orchestrator.ts)
- [orchestrator.test.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\orchestrator.test.ts)

New log events:

- `planner_query_request`
- `planner_query_response`
- `planner_query_failed`

These now capture:

- prompt
- model
- stage
- response
- response length
- duration

2. Fixed the batch commit transaction timeout issue

Files:

- [command.service.ts](D:\Projects\gantt-lib-mcp\packages\mcp\src\services\command.service.ts)

What changed:

- Prisma interactive transaction options are now actually passed into `$transaction`
- parent-link updates for batch create were collapsed from many `tx.task.update()` calls into one bulk SQL update

Result:

- the previous `P2028 Transaction not found` failure on large `create_tasks_batch` commits is no longer the primary blocker

3. Wrote remediation plan for the next step

File:

- [PLAN.md](D:\Projects\gantt-lib-mcp\.planning\phases\41-initial-gen-refactor\remediation5\PLAN.md)

## Confirmed Findings

### 1. Dependencies are being lost by the parser

This is the main functional bug still open.

Evidence:

- live logs show raw scheduling output intended to carry dependencies
- `scheduling_gate_verdict` still reports:
  - `dependencyCount: 0`
  - `tasksWithoutDependenciesCount: all tasks`
- `compile_verdict` shows:
  - `compiledDependencyCount: 0`

Root cause:

- the scheduling prompt instructs the model to reference predecessors by `taskKey`
- the parser in `planner.ts` reads dependency references from `nodeKey`
- valid dependency references are therefore normalized away

Relevant file:

- [planner.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\planner.ts)

Relevant lines to inspect next:

- scheduling prompt
- dependency normalization

### 2. Compound titles are still being generated

Examples observed in live output:

- `Возведение несущих конструкций техподполья и обратная засыпка`
- `Укладка гидроизоляционного ковра и устройство парапетов`

Product direction clarified by user:

- do not solve this with hard validation / rejection
- do not delete or prune generated work
- solve it in prompting only

This means:

- strengthen structure prompt
- strengthen structure repair prompt
- do not add a blocking gate for compound titles

### 3. UX latency is still poor

Current behavior:

- user waits through planner + scheduling + compile + final commit before seeing any chart result

The stack already supports WebSocket streaming:

- `token`
- `tasks`
- `done`

The next UX step should be:

- preview-first rendering
- final DB commit remains authoritative

## Important User Constraints

These were explicitly stated and should not be violated:

1. Do not introduce validation that rejects compound titles.
2. Do not delete or drop work because wording is imperfect.
3. Prefer solving naming quality in the prompt.
4. The UI may show provisional graph state before final DB commit.

## Recommended Next Actions

### First

Fix dependency parsing compatibility in:

- [planner.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\planner.ts)

Required behavior:

- accept dependency references from `taskKey`
- keep `nodeKey` as backward-compatible fallback

### Second

Tighten structure prompt and structure repair prompt in:

- [planner.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\planner.ts)

Add explicit wording:

- one task = one construction operation
- no combined task titles
- if multiple operations are present, split into separate tasks or subphases
- task-level compound formulations are forbidden

Do not add a new gate reason for this.

### Third

Add preview-first UX:

- extend WS message schema in [ws.ts](D:\Projects\gantt-lib-mcp\packages\server\src\ws.ts)
- wire preview handling in [App.tsx](D:\Projects\gantt-lib-mcp\packages\web\src\App.tsx)
- broadcast provisional graph from [orchestrator.ts](D:\Projects\gantt-lib-mcp\packages\server\src\initial-generation\orchestrator.ts) before final commit

## Useful Live Log Signals

For future debugging, inspect:

- `planner_query_request`
- `planner_query_response`
- `structure_plan_output`
- `schedule_metadata_output`
- `scheduling_gate_verdict`
- `executable_plan_output`
- `compile_verdict`

Primary log file:

- `D:\Projects\gantt-lib-mcp\.planning\debug\server-agent.log`

## Live Run Snapshot

Latest successful commit run during this session:

- runId: `9ae91000-5d52-4e5b-af25-e0dd72b14cdf`

Observed outcome:

- final commit succeeded
- tasks were persisted
- dependencies were still zero
- compound task titles were still present

That means persistence is no longer the main blocker.
The current blocker is quality and dependency preservation.

## Build State

Verified during this session:

- `npm run build -w packages/mcp`
- `npm run build -w packages/server`

Both passed after the transaction-path fix.
