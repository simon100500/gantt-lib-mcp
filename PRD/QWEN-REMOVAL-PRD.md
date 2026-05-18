# PRD: Полный уход от `@qwen-code/sdk`

## 1. Summary

В репозитории одновременно живут два агентных runtime-подхода:

- `@mariozechner/pi-agent-core`
- `@qwen-code/sdk`

Это создаёт смешанную архитектуру: разные session-модели, разные event-модели, разная semantics вокруг multi-turn, разные точки отказа и лишний cognitive overhead при отладке. Этот PRD определяет полный и осознанный уход от `@qwen-code/sdk` из runtime-пути продукта с консолидацией всей агентной логики на Pi stack.

Цель не в косметической замене импорта. Цель в том, чтобы в продукте остался один агентный runtime, одна модель истории, один способ продолжения диалога, одна модель стриминга и одна operational surface для debugging/metrics.

## 2. Problem

Сейчас система архитектурно неоднородна:

- ordinary agent path уже частично использует Pi Agent Core;
- initial generation и часть вспомогательных flow всё ещё используют `@qwen-code/sdk`;
- в коде сосуществуют два разных представления "сессии";
- поведение follow-up сообщений зависит не только от продукта, но и от того, через какой runtime пошёл конкретный запрос;
- поддержка и диагностика усложняются, потому что нужно понимать два SDK и две execution-модели одновременно.

Практический эффект:

- трудно гарантировать единое chat behavior;
- трудно внедрять persistent session, пока часть потока остаётся на другом runtime;
- возрастает риск скрытых legacy-path regressions;
- растёт стоимость любого изменения в agent stack.

## 3. Goals

- Полностью убрать `@qwen-code/sdk` из продуктового runtime.
- Перевести все серверные agent flows на `@mariozechner/pi-agent-core` и `@mariozechner/pi-ai`.
- Установить одну единую модель:
  - один agent runtime;
  - один transcript lifecycle;
  - один event contract;
  - один подход к session continuation.
- Упростить отладку, логи, тестирование и сопровождение agent path.
- Подготовить кодовую базу к следующему шагу: persistent session на Pi.

## 4. Non-Goals

- Не переписывать всю бизнес-логику Gantt tools.
- Не делать одновременно большой redesign chat UI.
- Не менять продуктовые сценарии initial generation сверх необходимого для migration.
- Не внедрять persistent session в рамках этого документа. Этот PRD только про removal/consolidation runtime.

## 5. Scope

### In Scope

- `packages/server/src/agent.ts`
- `packages/server/src/agent/pi-agent-runner.ts`
- `packages/server/src/split-task.ts`
- `packages/server/src/agent/direct-tools.ts`
- любые runtime helper-ы, которые завязаны на event/message model `@qwen-code/sdk`
- package dependencies и lockfile
- тесты и e2e flows, которые сейчас implicitly ожидают Qwen SDK behavior

### Out of Scope

- frontend redesign
- migration истории сообщений в БД
- redesign normalized tool catalog
- product-level changes в undo/history UX

## 6. Current State

На момент написания:

- `@qwen-code/sdk` остаётся в зависимостях сервера;
- `query(...)` и SDK event guards используются в `agent.ts`;
- `split-task.ts` всё ещё использует `@qwen-code/sdk`;
- часть embedded/direct-tools слоя завязана на Qwen SDK integration surface;
- `pi-agent-core` уже присутствует и используется как активный runtime path.

Итог: Qwen не является "старой неиспользуемой зависимостью". Это ещё живой кусок runtime.

## 7. Product Requirement

После завершения migration весь пользовательский agent behavior должен идти через единый Pi runtime.

Это означает:

1. Каждый user turn обрабатывается Pi agent path.
2. Все tool calls идут через единый adapter над normalized tool catalog.
3. Все assistant events стримятся через один event contract.
4. Все agent logs, metrics и failure modes описываются одной runtime-моделью.
5. В продукте не остаётся участков, где chat continuity зависит от Qwen SDK semantics.

## 8. Architecture Target

## 8.1 One Runtime

Остаётся один базовый runtime:

- `@mariozechner/pi-agent-core`
- `@mariozechner/pi-ai`

Все server-side agent operations строятся вокруг:

- `Agent`
- `agent.prompt(...)`
- `agent.state.messages`
- `agent.subscribe(...)`
- `transformContext(...)`
- единых Pi-compatible `AgentTool[]`

## 8.2 One Model Adapter

Если нужен OpenAI-compatible transport, он должен жить в одном Pi-friendly model adapter слое, а не в отдельном агентном SDK.

## 8.3 One Event Surface

Сервер должен нормализовать только Pi events:

- `message_update`
- `tool_execution_start`
- `tool_execution_end`
- `turn_end`
- `agent_end`

Любая серверная telemetry и WebSocket streaming должны строиться только на этой модели.

## 8.4 One Tooling Contract

Все flows, включая:

- ordinary mutation/read
- split-task and similar structured mutation flows
- initial generation interpretation/planning where нужен агентный runtime

должны использовать либо:

- Pi agent loop;
- либо прямой вызов model/completion API без Qwen SDK.

Qwen как orchestration layer должен быть полностью удалён.

## 9. Migration Principles

### 9.1 No Dual Runtime Steady State

Параллельное постоянное существование Pi и Qwen недопустимо как конечное состояние. Временный dual-path возможен только на migration branch и только с явным kill plan.

### 9.2 Preserve Product Contracts

Migration не должна ломать:

- auth
- AI limits
- message persistence
- requestContextId/historyGroupId
- WebSocket token streaming
- tasks refresh
- history_changed
- done/error semantics

### 9.3 Preserve or Improve Observability

После удаления Qwen диагностика не должна стать хуже. Все существующие важные debug-сигналы должны получить Pi-equivalent.

### 9.4 Do Not Rebuild Business Logic Blindly

Если конкретный flow можно перевести на Pi adapter без переписывания доменной логики, так и нужно сделать. Цель — убрать Qwen runtime, а не устроить uncontrolled rewrite.

## 10. Workstreams

### Phase 1 — Inventory and Runtime Boundary Freeze

- Зафиксировать все реальные import/use sites `@qwen-code/sdk`.
- Разделить их на:
  - active product path
  - auxiliary scripts
  - dead/legacy path
- Для каждого use site определить target replacement:
  - Pi agent loop
  - прямой model helper
  - удаление без замены

### Phase 2 — Replace `agent.ts` Remaining Qwen Runtime Pieces

- Убрать из `agent.ts` использование Qwen query/event loop там, где оно ещё осталось.
- Перевести route interpretation / planner-like model calls либо на Pi-friendly abstraction, либо на direct model utility.
- Сохранить current behavior contract.

### Phase 3 — Replace `split-task.ts`

- Перевести `split-task.ts` на Pi runtime или специализированный direct call path.
- Если этот flow фактически не нуждается в полном agent loop, не притягивать агент насильно.
- Зафиксировать единый transcript/message persistence contract.

### Phase 4 — Replace Qwen-Specific Direct Tools Integration

- Переписать `direct-tools.ts` и связанные adapter-ы так, чтобы они не зависели от `@qwen-code/sdk`.
- Если нужен embedded server abstraction, она должна быть Pi-native или project-native.

### Phase 5 — Remove Dependency and Dead Code

- Удалить `@qwen-code/sdk` из `package.json`.
- Удалить неиспользуемые helpers, guards, compatibility comments и leftover abstractions.
- Обновить тесты, build и документацию.

## 11. Technical Requirements

- Никакой новый runtime path не должен импортировать `@qwen-code/sdk`.
- Никакой production flow не должен вызывать `query(...)` из Qwen SDK.
- Сигналы частичного текста, tool execution и completion должны собираться из Pi events.
- История сообщения пользователя и ассистента должна сохраняться через текущий `messageService`.
- Tool calling semantics должны остаться совместимыми с normalized tool catalog.

## 12. Risks

### 12.1 Hidden Behavioral Drift

Qwen и Pi могут по-разному вести себя на streaming/tool orchestration. Migration может незаметно изменить latency profile или tool ordering.

### 12.2 Initial Generation Coupling

Если initial-generation helper-ы слишком глубоко завязаны на Qwen query loop, migration может оказаться больше, чем кажется.

### 12.3 Observability Regression

При грубой замене можно потерять часть debug evidence, которая сейчас помогает расследовать route/tool issues.

### 12.4 Migration Fatigue

Если не зафиксировать чёткий список replace/remove targets, можно оставить "ещё один маленький Qwen path", и проект снова окажется в hybrid state.

## 13. Acceptance Criteria

- В production/runtime code больше нет импортов `@qwen-code/sdk`.
- `package.json` и `packages/server/package.json` не содержат `@qwen-code/sdk`.
- Все agent flows работают через Pi stack или через project-native direct model helpers.
- Ordinary runtime, split-task flow и связанные server-side agent paths проходят build и tests.
- В логах и telemetry нет зависимости от Qwen SDK event types.
- Новые баги по chat/session behavior не объясняются "этот flow ещё на Qwen".

## 14. Success Metric

Успехом считается состояние, в котором на вопрос "на чём у нас работает agent runtime?" существует один ответ:

- продуктовый agent runtime работает на Pi stack;
- Qwen SDK больше не участвует в серверном chat execution path.
