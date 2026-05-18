# PRD: Agent-First Ordinary Runtime on Pi Agent Core

## 1. Summary

The current ordinary agent flow is too slow and over-engineered for day-to-day project edits. It relies on staged semantic classification, deterministic mutation planning, fallback paths, and verification layers around the model. This PRD defines a test rewrite of the ordinary agent runtime as a true agent-first loop built on `@mariozechner/pi-agent-core`.

The goal is not to replace initial project generation. Initial generation remains as-is because it currently works acceptably. The rewrite targets natural-language requests against an existing Gantt project: inspecting tasks, adding tasks, editing metadata, moving hierarchy, shifting dates, deleting tasks, linking/unlinking dependencies, recalculating, and validating the schedule.

The new ordinary runtime should be fast, direct, and easy for the model to reason about: one stateful agent, a clear prompt, the existing normalized tool list, and minimal server-side orchestration.

## 2. Problem

The current system tries to compensate for model uncertainty with many layers:

- route interpretation
- staged mutation orchestration
- semantic intent classification
- semantic planning/resolution/compilation
- deterministic execution routing
- legacy fallback paths
- repair and verification logic

This makes simple user requests feel slow and unpredictable. It also prevents testing whether a well-prompted agent with good tools can perform better by choosing tools itself.

The desired experiment is a clean ordinary-agent path where the agent determines what to call and when, using only the normalized tools.

## 3. Goals

- Replace the ordinary `@qwen-code/sdk` runtime path with `@mariozechner/pi-agent-core`.
- Keep current initial generation unchanged.
- Let the agent choose tools directly from the normalized Gantt tool catalog.
- Remove staged/semantic/deterministic mutation layers from the ordinary runtime path.
- Optimize for first tool call speed and minimal total tool calls.
- Preserve product contracts: auth, AI limits, chat messages, WebSocket updates, history checkpoints, and undo/restore behavior.
- Produce short factual responses in the user's language.

## 4. Non-Goals

- Do not rewrite initial generation.
- Do not redesign the frontend chat UI.
- Do not remove history, undo, restore, or checkpoint behavior.
- Do not add new scheduling semantics unless a missing tool blocks the experiment.
- Do not emulate unsupported operations with hidden server-side workarounds.

## 5. User Experience

For an existing project, the user writes a normal verbal instruction:

- "добавь сдачу технадзору"
- "сдвинь штукатурку на 2 дня"
- "свяжи исполнительную документацию и акт приемки"
- "удали этап меблировки"
- "проверь график"

The system should:

1. Save the user message.
2. Start the Pi agent.
3. Stream short assistant text when the agent produces it.
4. Let the agent call the smallest necessary tools.
5. Broadcast updated tasks if the project changed.
6. Refresh history if a mutation was committed.
7. Finish the chat turn with `requestContextId` and `historyGroupId` metadata.

The assistant should answer in 1-2 short sentences, only stating what changed or why nothing changed.

## 6. Architecture

### 6.1 Routing

Keep the current high-level split:

- Empty project / bootstrap request: current `runInitialGeneration`.
- Existing project ordinary request: new Pi Agent Core runtime.

The ordinary path must not call:

- `runStagedMutation`
- semantic intent classifier
- semantic planner/resolver/compiler
- deterministic mutation execution routing
- legacy subprocess fallback
- repair/retry mutation passes

### 6.2 Pi Agent Runtime

Add a new server-side module, for example:

```text
packages/server/src/agent/pi-agent-runner.ts
```

The runner should:

- create a custom `Model<'openai-completions'>` from current environment variables:
  - `OPENAI_BASE_URL`
  - `OPENAI_MODEL`
  - `OPENAI_API_KEY`
- create `Agent` from `@mariozechner/pi-agent-core`
- set `thinkingLevel: "off"`
- set `toolExecution: "parallel"`
- provide compact conversation history
- provide the normalized Gantt tools as `AgentTool[]`
- subscribe to agent events:
  - `message_update`
  - `tool_execution_start`
  - `tool_execution_end`
  - `turn_end`
  - `agent_end`
- stream text deltas to WebSocket `{ type: "token" }`
- collect tool execution metadata:
  - tool name
  - mutating/read-only
  - accepted/rejected/error
  - changed task IDs
  - timing metrics

### 6.3 Tool Adapter

Build a Pi-compatible adapter over `NORMALIZED_TOOL_CATALOG`.

The adapter should:

- expose exactly the normalized tool names
- convert current JSON schema properties to TypeBox schemas
- call `executeToolCall(name, params, createToolContext(...))`
- use one shared history context for all mutating calls in a user turn
- avoid `includeSnapshot` by default for speed and small payloads
- return compact JSON text to the agent

Allowed tools:

- `get_project_summary`
- `get_schedule_slice`
- `find_tasks`
- `get_task_context`
- `create_tasks`
- `update_tasks`
- `move_tasks`
- `shift_tasks`
- `delete_tasks`
- `link_tasks`
- `unlink_tasks`
- `recalculate_project`
- `validate_schedule`

### 6.4 Product Contracts

The rewrite must preserve:

- auth middleware
- AI usage limit counting
- `messageService.add("user", ...)`
- `messageService.add("assistant", ...)`
- one `requestContextId` per user turn
- one `historyGroupId` checkpoint for mutating agent runs
- undoable history for accepted mutations
- WebSocket `tasks`
- WebSocket `history_changed`
- WebSocket `done`
- chat metadata linking user/assistant messages to history

Read-only runs should not create undoable history groups.

## 7. Agent Prompt

Use a short, explicit agent prompt inspired by autonomous-agent prompt design. The prompt should define responsibility, tool choice, speed rules, edge cases, and output format.

```text
Ты автономный агент управления Gantt-проектом. Ты работаешь только через инструменты проекта и должен быстро превратить естественный запрос пользователя в минимальный набор tool calls.

Твоя ответственность:
1. Понять, хочет пользователь чтение, изменение или проверку.
2. Найти минимальный нужный контекст.
3. Вызвать правильный инструмент.
4. Ответить кратко только по факту результата.

Инструменты:
- get_project_summary: краткое состояние проекта, версия, диапазон дат, количество задач, health flags.
- find_tasks: быстрый поиск задач по названию. Используй первым, когда пользователь называет задачу без ID.
- get_task_context: одна задача, родители, дети, соседи, predecessor/successor связи.
- get_schedule_slice: ветка, список задач или окно дат.
- create_tasks: создать одну задачу или небольшой фрагмент.
- update_tasks: изменить имя, цвет, прогресс; не использовать для дат и связей.
- move_tasks: изменить родителя или порядок задач.
- shift_tasks: сдвинуть даты на N календарных или рабочих дней.
- delete_tasks: удалить задачи.
- link_tasks: создать predecessor-successor связь.
- unlink_tasks: удалить связь.
- recalculate_project: пересчитать график, только когда пользователь просит пересчёт или это явно нужно после структурного изменения.
- validate_schedule: проверить график, только когда пользователь просит проверку или диагностику.

Процесс:
1. Если запрос read-only, используй read tool или ответь из уже доступного контекста.
2. Если запрос mutating и нужны taskId, сначала используй find_tasks.
3. Если результат find_tasks неоднозначен и выбор изменит проект, задай один короткий уточняющий вопрос.
4. Если taskId известен, сразу вызывай подходящий mutation tool.
5. Для одного намерения предпочитай один mutation tool.
6. Не делай validate_schedule после успешного изменения, если пользователь не просил проверить.
7. Не делай второй проход, если tool уже дал достаточный результат.

Правила:
- Никогда не выдумывай taskId.
- Не читай весь проект без необходимости.
- Не используй несколько инструментов там, где достаточно одного.
- Не пересказывай внутренний план.
- Если инструмент вернул rejected/error, не заявляй успех.
- Если доступные инструменты не покрывают запрос, скажи это прямо.
- Абсолютный перенос на дату сейчас не покрыт отдельным публичным инструментом; не имитируй его через ручной пересчёт.
- Отвечай на языке пользователя.
- Ответ: 1-2 коротких предложения, только результат.
```

## 8. Agent Trigger Contract

Use this runtime when an authenticated user sends a natural-language request against an existing Gantt project:

- inspect tasks
- add tasks
- rename or update metadata
- move hierarchy
- shift dates
- delete tasks
- link or unlink dependencies
- recalculate schedule
- validate schedule

Do not use this runtime for empty-project initial generation. Route that to the existing initial-generation pipeline.

## 9. Important Design Decisions

### 9.1 Keep History and Undo

The agent can be autonomous, but project mutations must remain recoverable. The runtime must keep checkpoint/history behavior because the frontend already depends on `historyGroupId` for preview and restore.

### 9.2 Use `find_tasks` as the Primary Fast Lookup

The prompt must make `find_tasks` a first-class tool. Most verbal user requests mention task names, not IDs. A fast ranked search is the main way to avoid full project reads.

### 9.3 No Hidden Safety Rails in Ordinary Path

The test is only meaningful if ordinary requests are handled by the agent and tools, not by the old semantic planner. Failures should be visible and measurable.

### 9.4 Do Not Fake Unsupported Absolute Date Moves

The current tool catalog supports relative shifts through `shift_tasks`, but does not expose a clean absolute `move_to_date` tool. The agent should not pretend this is supported. If this becomes important, add a new normalized tool explicitly.

## 10. Acceptance Criteria

- Existing empty-project generation still works through the current initial-generation pipeline.
- Existing-project chat requests use Pi Agent Core, not `@qwen-code/sdk`.
- Ordinary path does not call staged mutation or semantic mutation modules.
- Agent can call normalized tools directly.
- A successful mutation updates the UI through `tasks`, refreshes history through `history_changed`, and finishes with `done`.
- A read-only request can finish without creating undoable history.
- Rejected tool calls produce a short failure answer, not a success claim.
- First tool call latency is logged.
- Total tool call count per request is logged.
- Assistant responses remain short and in the user's language.

## 11. Test Plan

### Unit Tests

- Pi tool adapter exposes exactly `NORMALIZED_TOOL_CATALOG` names.
- JSON schema conversion supports:
  - string
  - number
  - boolean
  - array
  - object
  - enum
  - optional fields
- Mutating tool calls share one `historyGroupId` and one `requestContextId`.
- Read-only tool calls do not create undoable history.
- Custom model builder uses current environment and `api: "openai-completions"`.

### Runner Tests

- Empty project routes to existing initial generation.
- Non-empty project routes to Pi ordinary agent.
- `message_update` text deltas become WebSocket `token` messages.
- Successful mutation broadcasts `tasks`, `history_changed`, and `done`.
- Rejected mutation returns a short failure message and emits `done`.
- A mutating-looking request with no valid tool call returns a short no-change message without retry.

### Prompt/Behavior Tests

- "добавь сдачу технадзору" uses `create_tasks` after minimal context if needed.
- "сдвинь штукатурку на 2 дня" uses `find_tasks`, then `shift_tasks`.
- "свяжи исполнительную документацию и акт приемки" uses `find_tasks`, then `link_tasks`.
- "проверь график" uses `validate_schedule`.
- "перенеси фундамент на 2026-05-10" does not fake unsupported absolute move.

## 12. Rollout

Implement behind a feature flag first:

```text
GANTT_AGENT_RUNTIME=pi
```

Suggested modes:

- `legacy`: current ordinary runtime
- `pi`: new Pi Agent Core ordinary runtime

Default can remain current runtime until smoke tests pass. After validation, switch default to `pi` and keep legacy only temporarily for rollback.

## 13. Open Follow-Up

If absolute date moves are common, add a dedicated normalized tool:

```text
move_tasks_to_date
```

This should be a separate change because the current experiment is specifically about replacing the runtime and prompt, not expanding the scheduling API.
