# PRD: Agent Run Reliability, Reconnect, and Mutation Feedback Refactor

## Status

Proposed

## Purpose

This PRD defines a server-centric refactor of the AI mutation execution lifecycle.

The immediate trigger is a class of production-facing failures where the system does one or more of the following:

- shows no visible progress after idle or reconnect
- applies a project mutation but reports that nothing was applied
- retries a creation flow and risks duplicate entities
- loses correspondence between actual mutation state and UI feedback

This document is not about improving the agent's language understanding in isolation.

It is about establishing one reliable execution contract across:

- web client
- websocket transport
- server run orchestration
- agent execution
- MCP mutation tooling
- authoritative backend command path

## Core Product Statement

The system must stop treating an AI mutation as an opaque text stream and start treating it as a durable server-coordinated run with explicit state, idempotent mutation semantics, and resumable feedback.

Target outcome:

> user sends one request -> server creates one tracked run -> run advances through explicit states -> any real mutation is verified from authoritative evidence -> reconnect resumes the same run -> the user sees truthful progress and truthful final outcome

## Current Diagnosis

The current architecture has the right truth boundary for schedule mutation:

- backend command commit is authoritative
- MCP is an orchestration layer
- server already performs mutation verification

But the run lifecycle around that truth boundary is still fragmented.

Observed defects:

- first request after idle can appear to hang with no actionable feedback
- websocket disconnects and reconnects do not reliably surface the current run state
- agent retries and transport retries can re-enter mutation flows without strong idempotency guarantees
- UI feedback is overly tied to streamed assistant output instead of authoritative run state
- verification can lag behind or disagree with actual project changes
- mutation telemetry and user-visible result can drift apart when SDK or transport events are partial
- create flows are especially exposed to duplicate application during retries

Conclusion:

> The mutation truth engine is mostly correct.  
> The run coordination, delivery guarantees, and user feedback protocol are not yet first-class.

## Product Goal

Establish a durable server-side execution protocol for AI runs so that:

- one user request maps to one authoritative run lifecycle
- reconnect resumes state instead of losing context
- retries do not duplicate committed mutations
- the UI always sees an explicit status, not silence
- final success/failure is derived from authoritative evidence

## Non-Goals

- no migration of backend domain logic into MCP or server orchestration
- no replacement of normalized MCP mutation tools as the primary MCP mutation surface
- no dependency on agent phrase-matching for correctness
- no requirement to redesign the full chat UI visual layer
- no speculative backend redesign unrelated to run reliability

## Users and Use Cases

### Primary users

- end users editing schedules via conversational input
- operators investigating production run failures
- developers maintaining agent/server/MCP interaction reliability

### Primary use cases

1. user sends a create or shift request after a period of inactivity
2. websocket disconnects during an in-flight run and later reconnects
3. agent calls mutation tools, but telemetry is partial or delayed
4. retry occurs after timeout or transport interruption
5. final UI response must correctly distinguish:
   - still running
   - reconnecting
   - mutation rejected
   - mutation applied
   - mutation already applied by a previous attempt

## Product Principles

1. The server owns run lifecycle truth.
2. The backend owns schedule mutation truth.
3. The agent owns interpretation and tool choice, not delivery guarantees.
4. Reconnect must resume an existing run, not create ambiguity.
5. User feedback must be driven by run state, not only token flow.
6. Mutation retries must be idempotent or explicitly suppressed.
7. Final outcome must be based on authoritative evidence, not assistant wording.
8. Silence is a bug. The UI must always have a visible execution state.
9. Deterministic server-side execution is preferred over agent execution whenever the task can be resolved algorithmically.
10. Paid model tokens are a scarce resource; the product should spend them only when ambiguity or open-ended interpretation cannot be resolved locally.

## Token Economy Principle

This refactor must explicitly improve not only reliability, but also AI cost discipline.

Target policy:

- do as much work as possible on the server, deterministically and effectively for free
- call the model only when the request cannot be completed safely through known rules, direct resolution, or authoritative local operations
- do not use the agent for lifecycle management, retries, reconnect handling, or duplicate suppression
- do not spend tokens to rediscover facts the server already has

Practical meaning:

- direct deterministic intents such as obvious create, exact-name shift, exact-name link, or exact-name status update should prefer server-side execution paths when they are safe
- the agent should be reserved for ambiguity resolution, fuzzy interpretation, multi-step planning, and requests where there is no clean deterministic shortcut
- retries after uncertain transport state should first reconcile against local authoritative evidence before considering any new model call
- reconnect should restore run state locally, not restart the agent unless strictly necessary

## Architectural Decision

This refactor is primarily a `packages/server` redesign with a small websocket/UI contract upgrade, but it explicitly allows targeted backend changes when they materially improve correctness, durability, idempotency, or observability.

Responsibility split:

- `packages/server`
  - run coordinator
  - attempt state machine
  - reconnect/resume semantics
  - idempotency and deduplication
  - authoritative outcome resolution
  - status broadcasting
- `packages/mcp`
  - keep normalized orchestration surface
  - preserve typed mutation result contract
  - provide enough telemetry for run attribution
- backend command path
  - remain the only mutation authority
  - may gain targeted support for run attribution, idempotency, or durable mutation evidence
- web client
  - render explicit run statuses
  - reattach to active run on reconnect

This is not an agent-centric refactor.

## Scope

### In Scope

- explicit server-side run state machine
- persistent or resumable active run tracking
- websocket status-event protocol for run progress
- reconnect/resume behavior for in-flight runs
- mutation idempotency for retries and transport failures
- server-side duplicate suppression for create and fast-path mutations
- unified authoritative outcome resolver
- regression coverage for idle, reconnect, retry, and partial telemetry cases
- targeted backend/API changes if they are the cleanest way to support:
  - run attribution
  - durable idempotency keys
  - committed mutation evidence lookup
  - reliable duplicate suppression

### Out of Scope

- major redesign of prompt strategy
- replacing current normalized MCP tool names
- speculative support for multi-user concurrent editing UX
- advanced analytics dashboards beyond debug logs and test coverage
- broad backend rewrites not connected to run reliability

## Problem Breakdown

## 1. Run Lifecycle Is Not a First-Class Protocol

Today the system behaves more like "start a model call and hope the surrounding layers line up."

What is missing:

- one explicit run object with stable identity
- one authoritative list of run phases
- one terminal outcome model
- one resume protocol after disconnect

Required direction:

- create a server-owned run coordinator
- represent each run with explicit state and timestamps
- make every websocket message attributable to a run
- make terminal states deterministic and inspectable

## 2. UI Feedback Is Too Dependent on Token Streaming

Streaming text is useful, but it is not a lifecycle contract.

Current failure modes:

- idle warmup appears as total silence
- reconnect can leave the user unsure whether anything is still running
- mutation may already be applied while the UI still waits for the "right" text event

Required direction:

- status events must be first-class
- token streaming becomes optional enrichment, not the only sign of life
- the UI must be able to render progress even when no assistant text has arrived yet

## 3. Retry Semantics Are Not Strong Enough for Mutation Safety

Any mutation retry must answer one question before doing more work:

> was the mutation already committed?

If the answer is "possibly yes," the system must verify before retrying.

Current risk:

- create flows may re-run after timeout or missing telemetry
- user-visible "nothing applied" can coexist with an actual project mutation

Required direction:

- explicit operation identity
- pre-retry reconciliation against authoritative evidence
- duplicate suppression for creation and direct fast-path commands

## 4. Verification Still Has Too Many Fragmented Signals

The system currently reasons over some combination of:

- request heuristics
- tool-use observations
- debug log recovery
- snapshot diff
- assistant response text

The direction is right, but the contract is not yet reduced to one simple law.

Required law:

> if authoritative commit evidence and project state confirm the mutation, the run must not end in a user-facing "nothing applied" state

## 5. Idle and Reconnect Paths Need Explicit Handling

The first request after idle is operationally different:

- session may need warmup
- websocket may reconnect mid-flight
- SDK/MCP sidecars may need time to become responsive

This is not a corner case. It is a normal product path and must be handled as such.

## Target Runtime Model

### Run Identity

Each user request that enters agent execution produces a durable server-side run:

```ts
type AgentRunRecord = {
  runId: string;
  projectId: string;
  sessionId: string;
  requestMessageId: string;
  userMessage: string;
  createdAt: string;
  updatedAt: string;
  state: AgentRunState;
  activeAttempt: number | null;
  terminalOutcome?: AgentRunOutcome;
};
```

### Run States

Minimum state model:

```ts
type AgentRunState =
  | 'queued'
  | 'session_connecting'
  | 'agent_starting'
  | 'agent_running'
  | 'mutation_observed'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Notes:

- `session_connecting` covers idle warmup and websocket/session reattachment
- `mutation_observed` means the server saw mutation evidence, not merely that the user requested it
- `verifying` is explicit and user-visible

### Status Event Contract

The websocket layer must emit structured run events:

```ts
type AgentRunStatusEvent =
  | { type: 'run_started'; runId: string; state: 'queued' | 'session_connecting'; }
  | { type: 'run_state'; runId: string; state: AgentRunState; detail?: string; }
  | { type: 'tool_called'; runId: string; toolName: string; }
  | { type: 'project_changed'; runId: string; changedTaskIds: string[]; }
  | { type: 'run_completed'; runId: string; outcome: AgentRunOutcome; message: string; }
  | { type: 'run_failed'; runId: string; outcome: AgentRunFailure; message: string; }
  | { type: 'run_resumed'; runId: string; state: AgentRunState; };
```

Client rendering requirement:

- the UI must render status based on these events even if assistant token flow is empty

### Outcome Contract

Server terminal outcomes must be explicit:

```ts
type AgentRunOutcome =
  | 'read_only_answered'
  | 'mutation_applied'
  | 'mutation_rejected'
  | 'mutation_not_attempted'
  | 'mutation_already_applied'
  | 'run_timeout_recovered'
  | 'run_timeout_failed';
```

### Mutation Evidence Hierarchy

Authoritative evidence should be evaluated in this order:

1. backend command commit result or persisted project event tied to the run/operation
2. project snapshot diff
3. normalized mutation tool result payload
4. MCP debug-log recovery
5. assistant text

Assistant text must never outrank authoritative mutation evidence.

## Functional Requirements

## FR-1: Server-Owned Run Coordinator

The server must expose one internal coordinator responsible for:

- creating run identity
- recording state transitions
- tracking attempts
- deciding retry vs verify vs complete
- broadcasting run status

This coordinator must become the only place where run lifecycle policy is implemented.

## FR-2: Durable Active Run Resume

When a websocket client reconnects, the server must be able to answer:

- is there an active run for this session/project?
- what state is it in?
- what was the latest visible assistant text?
- has a mutation already been observed or applied?

The client must resume from that state instead of waiting blindly.

## FR-3: Silence Watchdog

If a run produces no tokens and no state updates for a bounded interval, the server must emit a status update such as:

- reconnecting
- still processing
- verifying authoritative result

The product requirement is not the exact wording.
The requirement is that total silence is not allowed.

## FR-3A: Token-Aware Retry Policy

Retry policy must be optimized for correctness first, but also for token economy.

Required behavior:

- do not automatically re-run the agent when the server can reconcile outcome locally
- do not spend a second model attempt if authoritative evidence already proves mutation success or rejection
- prefer local deterministic recovery paths over model retries
- classify failures into:
  - recoverable locally
  - requires agent retry
  - requires user clarification

## FR-4: Mutation Idempotency

Each mutation-capable attempt must have a stable operation identity sufficient to prevent duplicate application.

Minimum requirements:

- create flows must not create duplicates during retry/reconnect
- fast-path direct commands must not reapply blindly after uncertain transport state
- pre-retry verification must check for already-applied mutation before replay

Possible implementation directions:

- per-run operation keys
- run-attributed project events
- lightweight semantic dedupe for create_task and batch create fragments

The exact mechanism may vary, but duplicate prevention is mandatory.

## FR-5: Retry Reconciliation Before Replay

On timeout, disconnect, or partial telemetry, the server must reconcile before retrying:

1. check authoritative mutation records
2. compare current project state against the pre-run snapshot
3. inspect observed mutation calls
4. decide:
   - already applied
   - definitely not applied
   - uncertain, require safe retry path

Blind replay is not acceptable for mutation operations.

## FR-6: Unified Outcome Resolver

The server must replace ad hoc mutation result interpretation with one outcome resolver that returns:

- terminal outcome classification
- user-facing message class
- changed entity footprint
- mismatch or inconsistency diagnostics

This resolver must be used by both agent-path and fast-path mutations.

## FR-7: Reconnect-Safe UI Contract

The client must:

- subscribe to active run state after reconnect
- render current run state immediately
- append streamed assistant text only if/when available
- handle `project_changed` independently from final assistant prose

The UI must not assume that "no text yet" means "nothing happened."

## FR-8: Idle Warmup Visibility

The first run after idle must surface explicit progress states such as:

- waking agent runtime
- reconnecting execution channel
- running mutation
- verifying result

This requirement exists because the user complaint is fundamentally about trust and visibility, not just throughput.

## FR-9: Fast-Path Compatibility

Any direct server shortcut such as cheap shift/create paths must integrate with the same run coordinator.

Fast paths must:

- emit the same run states
- use the same outcome resolver
- use the same idempotency rules
- produce the same reconnect behavior

Fast path cannot remain a side-channel with weaker guarantees.

## FR-9A: Deterministic Intent Routing

Before invoking the agent, the server should evaluate whether the request can be satisfied by a deterministic route.

Examples of good deterministic candidates:

- direct create with a clearly extractable task title
- exact-name or duplicate-name shift with an explicit delta
- exact-name link or unlink requests
- straightforward progress or metadata updates with one unambiguous target

Required rule:

> if the server can complete the request safely with authoritative local logic, it should do so without calling the model

The agent should be invoked only when:

- intent remains ambiguous
- target resolution is fuzzy
- the user asks for a broader planning or restructuring operation
- the operation requires exploratory reasoning rather than direct execution

## FR-10: Observability and Debuggability

Debug logs must allow post-mortem answers to:

- what run existed?
- what state transitions occurred?
- what attempt mutated?
- was the mutation committed?
- why did the user see the final message they saw?

This is required to stop chasing production bugs through loosely related logs.

## Non-Functional Requirements

## NFR-1: Correctness

- no duplicate task creation from retry/reconnect for the same user request
- no user-facing "nothing applied" when authoritative mutation evidence confirms a change

## NFR-2: Availability

- reconnect must restore visibility into active runs without requiring manual refresh loops

## NFR-3: Latency Transparency

- if a request is slow, the system must say that it is slow rather than appearing broken

## NFR-4: Incremental Adoption

- rollout must be possible without rewriting the full agent stack in one change

## NFR-5: Architectural Safety

- backend changes are allowed, but they must strengthen the existing authority boundary rather than bypass it
- any backend additions should reduce orchestration ambiguity, not create a second mutation protocol

## NFR-6: Token Efficiency

- common direct mutations should complete with zero model calls whenever safe deterministic routing is possible
- reconnect and verification flows should not consume model tokens unless local evidence is insufficient
- retries should minimize repeated context loading and avoid repeated full agent runs

## Proposed Implementation Phases

## Phase 1: Run Contract and Coordinator

Deliverables:

- documented run state machine
- server `RunCoordinator`
- run state persistence or durable in-memory contract
- one normalized terminal outcome model

Files likely involved:

- `packages/server/src/agent.ts`
- `packages/server/src/ws.ts`
- new `packages/server/src/run-coordinator.ts`
- server debug logging utilities

## Phase 2: Status Event Protocol and Client Resume

Deliverables:

- websocket run status events
- client reconnect/resume flow
- idle silence watchdog
- UI status rendering for in-flight runs

Files likely involved:

- `packages/server/src/ws.ts`
- websocket route/session handlers
- `packages/web/src/...` chat and connection state modules

## Phase 3: Idempotency and Retry Reconciliation

Deliverables:

- stable operation identity
- pre-retry reconciliation
- duplicate suppression for create and fast-path mutations
- mutation replay rules

Files likely involved:

- `packages/server/src/agent.ts`
- command attribution/debug logging
- possible run metadata persistence helpers

## Phase 4: Unified Outcome Resolver

Deliverables:

- one authoritative mutation outcome resolver
- unified handling for agent path and fast path
- elimination of false "no valid mutation tool call" user outcomes when mutation is confirmed

Files likely involved:

- `packages/server/src/agent.ts`
- related tests and debug log helpers

## Phase 5: Regression and Production Hardening

Deliverables:

- end-to-end regression matrix
- reconnect, idle, retry, partial telemetry, and duplicate-create tests
- rollout safety checklist

## Acceptance Criteria

The refactor counts as successful only if all of the following are true:

1. After idle, a user request immediately surfaces visible run status even before assistant text appears.
2. If websocket reconnect occurs during execution, the client resumes the existing run state and does not look stalled.
3. A single create request does not create duplicate tasks because of retry or reconnect.
4. If a mutation was committed, the final user-facing outcome cannot be `mutation_not_attempted`.
5. Fast-path and agent-path mutations produce the same class of lifecycle events and terminal outcomes.
6. Operators can explain any failure from logs without reconstructing the story manually across unrelated signals.

## Test Matrix

Minimum regression scenarios:

1. first mutation request after idle runtime warmup
2. websocket disconnect before first token, run later succeeds
3. websocket disconnect after mutation commit but before final response
4. create request times out after commit evidence exists
5. create request times out before any mutation evidence exists
6. MCP tool telemetry missing but snapshot diff confirms mutation
7. duplicate retry of the same create request
8. fast-path shift during reconnect
9. agent-path mutation rejected cleanly by tool result
10. read-only request with reconnect noise must not look like mutation failure

## Risks

- introducing run persistence can increase complexity if done too broadly
- partially upgrading websocket protocol without client adoption can create inconsistent UX
- overengineering idempotency may slow delivery if applied to every conceivable mutation before handling the common create/shift paths
- targeted backend additions can accidentally create a second coordination surface if not kept tightly scoped

## Mitigations

- keep the first pass focused on active-run durability and mutation dedupe
- if backend additions are made, constrain them to authority-strengthening primitives such as:
  - idempotency keys
  - run-attributed project events
  - mutation evidence lookup
- roll out behind internal flags if needed
- prioritize create and direct schedule edits before broader mutation classes

## Open Questions

1. Should run state be persisted in the database or kept in durable process memory for the first pass?
2. Do we need a dedicated `AgentRun` table, or is structured debug/event logging sufficient initially?
3. Should backend `ProjectEvent` or commit contracts be extended with `runId`, `attempt`, or `idempotencyKey`?
4. Should user-visible assistant text be saved incrementally during long runs or only on terminal completion?
5. How much of reconnect resume should be client-pulled versus server-pushed?
6. Do we want cancellation as part of this phase or defer it until the lifecycle protocol is stable?

## Recommended Initial Constraint

Prefer server-side implementation first, but do not avoid backend changes when they are clearly the cleaner authority-preserving solution.

The strongest allowed backend additions for this refactor are:

- run-attributed mutation evidence
- durable idempotency keys
- committed operation lookup by run or request identity
- explicit reconciliation helpers for retry safety

The main rule is not "do not touch backend."

The main rule is:

> do not create a second truth path or move orchestration logic down into the domain layer.
