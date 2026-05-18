# PRD: Persistent Session для agent chat на Pi

## 1. Summary

Сейчас chat history в продукте хранится, но не живёт как настоящая долговременная agent session. Каждый новый backend-run в основном создаёт новый агентный execution context и вручную подмешивает в него часть предыдущих сообщений или summary.

Это делает чат похожим на чат в UI, но не на полноценную persistent agent session. Короткие follow-up ответы вроде:

- `во всех`
- `туда же`
- `после этого`
- `как в пункте 1.4.1`

работают только настолько, насколько правильно собран и передан контекст в конкретный run.

Этот PRD определяет переход на persistent session поверх `@mariozechner/pi-agent-core`, где приложение явно управляет transcript lifecycle, summary, compaction и session restore между отдельными backend-run’ами.

## 2. Problem

Текущая модель имеет фундаментальное ограничение:

- `agent.prompt()` умеет продолжать живую сессию только внутри конкретного живого `Agent`-объекта;
- `sessionId` в PI нужен для provider caching, а не для автоматического восстановления истории;
- если backend каждый раз создаёт новый `Agent`, то без явного restore это новый runtime context;
- если передаётся только кусок истории, поведение follow-up зависит от качества этого кусочка.

Практически это означает:

- история есть в БД, но continuity частично "собирается вручную";
- короткие ответы особенно хрупки;
- routing и execution могут по-разному трактовать один и тот же follow-up;
- нет единого session contract: что именно считается памятью агента, где она хранится, как компактифицируется, как восстанавливается.

## 3. Goals

- Ввести явную persistent session model для agent chat.
- Сделать continuation между отдельными backend-run’ами штатной и детерминированной.
- Сохранить transcript, session summary и рабочий short-term context как first-class data model.
- Снизить вероятность misrouting для кратких follow-up сообщений.
- Сделать chat behavior ближе к "нормальному чату", но без иллюзии магической SDK-памяти.
- Использовать штатные возможности PI:
  - `agent.state.messages`
  - `transformContext`
  - `continue()`
  - `followUp()`

## 4. Non-Goals

- Не переносить всю историю всех проектов целиком в память постоянно.
- Не хранить бесконечный raw transcript без compaction.
- Не полагаться на `sessionId` как на средство восстановления истории.
- Не делать full redesign frontend chat UI в этой задаче.
- Не решать одновременно migration off-Qwen; это отдельный PRD.

## 5. Core Product Requirement

Система должна вести себя как persistent project-scoped chat session:

1. У проекта есть долговременная conversation/session state.
2. Новый user turn поднимает этот state и продолжает его, а не начинает "почти новый" run.
3. Короткие follow-up ответы интерпретируются в контексте unresolved prior turn.
4. Длинная история не тащится целиком каждый раз: используется compaction и summary.
5. После каждого turn состояние сессии сохраняется в форме, пригодной для следующего restore.

## 6. Product Behavior

### 6.1 Что должен чувствовать пользователь

Пользователь должен иметь право писать:

- `во всех`
- `да`
- `сделай так же`
- `нет, только в секции 1В`
- `а теперь свяжи их`

и ожидать, что система:

- помнит, о чём был предыдущий незавершённый или уточняющий ход;
- не трактует такие реплики как standalone bootstrap request;
- не требует на каждом шаге заново пересобирать большой prompt вручную.

### 6.2 Что должен гарантировать backend

Backend должен гарантировать:

- есть canonical transcript;
- есть compact session memory;
- есть способ восстановить agent context на следующий run;
- есть правила pruning/compaction;
- есть единый момент сохранения session state после завершения turn.

## 7. Architectural Principle

Persistent session в PI не возникает сама по себе. Её создаёт приложение.

Правильная модель:

- приложение хранит transcript и session memory;
- при новом run оно восстанавливает `agent.state.messages` или производный compact context;
- `transformContext` отвечает за pruning/compaction перед модельным вызовом;
- после turn приложение сохраняет обновлённый state обратно.

Неправильная модель:

- считать, что `sessionId` сам поднимет старую историю;
- каждый раз создавать новый run с голым prompt и надеяться, что summary "как-нибудь хватит".

## 8. Data Model

Нужны явные сущности session layer.

### 8.1 Canonical Transcript

Уже существующие сообщения пользователя и ассистента в БД остаются source of truth для аудита и UI.

Transcript нужен для:

- отображения чата;
- расследований;
- rebuild session memory при необходимости;
- branch/restore semantics, если они появятся позже.

### 8.2 Session Snapshot

Нужна отдельная persistent сущность, например `agent_session_state`, содержащая:

- `projectId`
- `sessionKey` или другой project-scoped identifier
- `messagesSnapshot` или compact restorable message state
- `rollingSummary`
- `openThreads`
- `lastRequestContextId`
- `updatedAt`
- metadata по compaction version/schema

Эта сущность не должна быть просто копией всего transcript. Это operational restore state.

### 8.3 Open Thread Markers

Нужен явный слой для unresolved context:

- последнее уточнение от ассистента;
- активный target entity set;
- active operation kind:
  - split
  - move
  - create
  - link
  - validate

Именно этот слой критичен для follow-up сообщений вроде `во всех`.

## 9. Session Lifecycle

## 9.1 Session Restore

На новый user turn backend:

1. загружает canonical transcript;
2. загружает последний session snapshot;
3. восстанавливает initial agent messages из snapshot;
4. добавляет новый user message;
5. запускает Pi agent.

Если snapshot отсутствует:

- строит initial compact context из последних сообщений и/или summary;
- создаёт новый session snapshot.

## 9.2 Turn Execution

Во время turn:

- используется один Pi `Agent`;
- `agent.prompt()` продолжает восстановленный контекст;
- если нужен follow-up внутри активной сессии без нового внешнего run, допустимы `continue()` и `followUp()`;
- `transformContext(...)` гарантирует bounded context size.

## 9.3 Session Save

После завершения turn backend должен сохранить:

- новые transcript messages;
- обновлённый session snapshot;
- обновлённый rolling summary;
- обновлённые open thread markers;
- compaction metadata.

## 10. Context Strategy

## 10.1 Three-Layer Memory Model

Нужны три слоя памяти:

### Layer A — Full Transcript

Полная история в БД.

Используется для:

- UI
- аудит
- rebuild
- debugging

### Layer B — Rolling Summary

Компактная narrative summary прошлой беседы.

Используется для:

- long-range continuity;
- экономии context window;
- восстановления смысла старых turns без raw replay.

### Layer C — Active Working Set

Короткий оперативный контекст последних релевантных turns и unresolved thread state.

Используется для:

- текущего routing;
- интерпретации follow-up;
- точной работы на следующем ходе.

Именно Layer C должен быть приоритетным для коротких ответов.

## 10.2 Compaction

`transformContext` должен выполнять bounded compaction policy:

- держать последние N релевантных сообщений полностью;
- держать system/session instructions;
- держать open thread markers;
- заменять старые blocks rolling summary, а не сырым transcript;
- не раздувать prompt за счёт уже закрытых веток.

## 10.3 Restore Fidelity

Восстановленный session state не обязан быть byte-identical полному transcript. Он обязан быть operationally sufficient:

- понимать текущую задачу;
- помнить unresolved clarification;
- сохранять недавние references;
- не терять важные entity bindings.

## 11. Routing Requirement

Route selection и intent interpretation должны работать не только от текущего user message, но от session state:

- rolling summary
- active working set
- unresolved clarification markers
- recent assistant question

Короткий follow-up не должен классифицироваться как initial generation, если:

- проект непустой;
- в active thread есть mutation/split/edit flow;
- предыдущий assistant turn был уточняющим вопросом по существующим задачам.

## 12. PI Usage Rules

### 12.1 What PI Gives Us

PI даёт нам полезные примитивы:

- `agent.state.messages`
- `agent.prompt(...)`
- `continue()`
- `followUp()`
- `transformContext(...)`

### 12.2 What PI Does Not Give Automatically

PI не делает за приложение:

- долговременное восстановление истории между backend-run’ами;
- canonical transcript storage;
- open-thread semantics;
- project-scoped session persistence;
- automatic resume of prior chat from mere `sessionId`.

### 12.3 Required App Responsibilities

Приложение обязано само реализовать:

- session snapshot persistence;
- transcript-to-session restore;
- compaction policy;
- summary refresh policy;
- unresolved-thread tracking.

## 13. UX and Failure Semantics

Если session snapshot повреждён или отсутствует:

- система не должна silently invent context;
- нужно восстановиться из transcript + summary;
- если unresolved thread восстановить нельзя, assistant должен задать короткий clarification question вместо ложной уверенности.

Если контекст слишком длинный:

- система должна compact-ить его автоматически;
- а не silently отбрасывать критически важный active thread.

## 14. Phases

### Phase 1 — Define Session State Contract

- Зафиксировать schema session snapshot.
- Зафиксировать memory layers.
- Определить open-thread model.
- Определить compaction versioning.

### Phase 2 — Build Persistence Layer

- Добавить storage для session snapshot.
- Добавить read/write APIs в server/runtime layer.
- Связать snapshot с project/chat scope.

### Phase 3 — Restore and Save in Agent Runtime

- Перед каждым новым turn восстанавливать session state.
- После turn сохранять updated session state.
- Перевести route selection на session-aware input.

### Phase 4 — Add Compaction and Summary Refresh

- Встроить `transformContext`.
- Реализовать rolling summary refresh policy.
- Ограничить prompt growth.

### Phase 5 — Harden Follow-Up Semantics

- Добавить тесты на:
  - `во всех`
  - `да`
  - `только в 1В`
  - `сделай так же`
  - `а теперь свяжи их`
- Подтвердить, что unresolved clarification reliably survives cross-run continuation.

## 15. Risks

### 15.1 Snapshot Drift

Если session snapshot и canonical transcript расходятся, agent может продолжать не тот контекст.

### 15.2 Over-Compaction

Слишком агрессивный summary/prune может выбросить критичные entity bindings.

### 15.3 Under-Compaction

Если тащить слишком много raw history, latency и cost будут расти, а качество может падать из-за шумного prompt.

### 15.4 False Confidence

Если active thread markers определяются слишком грубо, агент может уверенно применить follow-up не к тем задачам.

## 16. Acceptance Criteria

- Новый user turn продолжает сохранённую project-scoped agent session, а не стартует с пустого runtime context.
- Session restore не зависит от `sessionId` как магического resume-mechanism.
- Route selection использует session-aware context.
- Короткие follow-up ответы корректно работают после отдельного backend-run.
- Есть compaction policy с bounded context growth.
- Есть durable session snapshot помимо полного transcript.
- Если snapshot недоступен, система умеет rebuild-иться из transcript/summary без silent context loss.

## 17. Success Metric

Успехом считается состояние, в котором поведение chat continuity объясняется просто:

- у проекта есть долговременная agent session;
- приложение явно сохраняет и восстанавливает её поверх PI;
- короткие follow-up больше не зависят от случайно удачного ручного подмешивания истории.
