# Implementation Plan: Agent Run Reliability Refactor

## Status

Draft

## Purpose

This document turns [agent-run-reliability-refactor-prd.md](D:/Projects/gantt-lib-mcp/.planning/reference/agent-run-reliability-refactor-prd.md) into an implementation strategy with explicit architectural options.

It also adds one non-negotiable product constraint:

> maximize free deterministic server execution and minimize paid model-token usage.

The system should keep the "magic" where it is valuable, but it should not spend tokens on work the server can do safely and deterministically.

## Decision Frame

There are three viable implementation directions.

## Option A: Server-First Without Backend Schema Changes

### Summary

Implement `RunCoordinator`, reconnect state, local idempotency heuristics, and deterministic routing entirely in `packages/server`, using existing command/project event behavior plus debug logs and snapshot reconciliation.

### Advantages

- fastest path to initial stabilization
- low schema risk
- minimal migration overhead
- can ship incrementally

### Disadvantages

- idempotency remains partly heuristic
- duplicate suppression for create flows is weaker than ideal
- reconnect reconciliation still depends on indirect evidence in some cases
- operational debugging remains more difficult than necessary

### Token Economy

- good improvement from deterministic routing
- moderate improvement on retries
- still risks extra agent attempts when evidence is incomplete

### Verdict

Good as a short emergency stabilization layer, but not ideal as the final architecture.

## Option B: Server-First With Minimal Backend Reliability Extensions

### Summary

Keep orchestration primarily in `packages/server`, but add small backend support for:

- run-attributed command commits
- durable idempotency keys
- lookup of committed mutation evidence by run or operation identity

### Advantages

- strongest correctness-to-complexity ratio
- makes retry safety explicit instead of heuristic
- reduces false negatives in verification
- supports reconnect and duplicate suppression cleanly
- improves observability with authoritative evidence

### Disadvantages

- requires targeted backend/API changes
- needs careful migration and compatibility handling

### Token Economy

- best practical outcome
- highest chance of preventing unnecessary repeat agent runs
- allows server to answer "already applied / already rejected / still verifying" locally and cheaply

### Verdict

Recommended.

This is the best balance of reliability, implementation cost, and token discipline.

## Option C: Backend-Heavy Run Persistence

### Summary

Push much more of run coordination and lifecycle durability into database-backed backend models from the start.

### Advantages

- strongest durability
- good auditability
- future-friendly for more advanced session continuity

### Disadvantages

- highest implementation cost
- larger schema and migration surface
- slower time to stabilize current production issues
- easy to overbuild

### Token Economy

- potentially excellent long-term
- but expensive to deliver and unnecessary for the first correction pass

### Verdict

Not recommended for the first pass.

## Recommended Architecture

Choose **Option B: server-first with minimal backend reliability extensions**.

Core rule:

- orchestration stays in server
- mutation truth stays in backend
- agent handles only interpretation where deterministic routing cannot fully solve the request

## Recommended Backend Extensions

These are the only backend changes worth making in the first pass.

### 1. Idempotency Key on Commit

Add optional request metadata such as:

```ts
type CommitMetadata = {
  runId?: string;
  attempt?: number;
  idempotencyKey?: string;
};
```

Purpose:

- suppress duplicate commits on retry
- allow authoritative lookup by request identity

### 2. Run-Attributed Project Event Data

Persist run attribution on committed project events:

- `runId`
- `attempt`
- `idempotencyKey`
- optional `requestMessageId`

Purpose:

- reconcile retries safely
- prove mutation success without depending on SDK telemetry
- make production forensics straightforward

### 3. Mutation Evidence Lookup

Provide a server-usable way to ask:

- was this operation already committed?
- what changed?
- was it accepted or rejected?

This can be:

- a dedicated service method
- a query over `ProjectEvent`
- or a lightweight internal backend helper

It does not need to become a public product API if internal service access is enough.

## Deterministic Routing Strategy

The system should route requests in this order:

1. `deterministic local path`
2. `deterministic local path with authoritative lookup`
3. `agent path`

### Deterministic Local Path

Use this when:

- target is exact or safely enumerable
- operation shape is explicit
- no exploratory reasoning is needed

Examples:

- `добавь задачу Монтаж светильников`
- `сдвинь штукатурку стен на неделю`
- `сделай задачу Монтаж светильников выполненной на 100%`

### Deterministic Local Path With Authoritative Lookup

Use this when:

- retry or reconnect introduced uncertainty
- server needs to decide whether work already happened
- the action might already be committed

Examples:

- create timed out after command commit
- reconnect happened after mutation but before final response
- duplicate message arrives while previous run may still be completing

### Agent Path

Use this when:

- user intent is fuzzy
- target selection is ambiguous and cannot be safely resolved locally
- request requires planning or exploratory reasoning
- operation combines several open-ended steps

Examples:

- `опаздываем со штукатуркой, подвинь всё разумно`
- `добавь блок электрики после черновых работ и свяжи как правильно`
- `сделай расписание аккуратнее и логичнее`

## Planned Execution Phases

## Phase 1: Run Coordinator Foundation

Deliverables:

- `RunCoordinator`
- explicit run states
- status event protocol
- active-run resume contract

Main files:

- `packages/server/src/agent.ts`
- `packages/server/src/ws.ts`
- `packages/server/src/run-coordinator.ts`

## Phase 2: Deterministic Routing Layer

Deliverables:

- pre-agent routing decision
- cheap deterministic handlers for common direct mutations
- standardized fallback from deterministic path to agent path

Main files:

- `packages/server/src/agent.ts`
- extracted `packages/server/src/deterministic-mutations.ts`

Success metric:

- common direct mutation flows complete with zero model calls

## Phase 3: Backend Idempotency and Evidence

Deliverables:

- commit metadata support
- idempotency key handling
- run-attributed project event persistence
- mutation evidence lookup service

Main files:

- backend command service and types
- project event persistence
- server reconciliation helpers

Success metric:

- retry safety becomes authoritative instead of heuristic

## Phase 4: Unified Verification and Reconnect Recovery

Deliverables:

- one outcome resolver
- reconnect-safe completion
- no false "nothing applied" when mutation evidence exists

Success metric:

- same final outcome whether completion is observed live or recovered after reconnect

## Phase 5: Regression Matrix and Token Budget Validation

Deliverables:

- regression suite for idle, reconnect, duplicate create, partial telemetry, and deterministic path routing
- lightweight counters for:
  - model calls per run
  - deterministic vs agent path ratio
  - recovered vs replayed retries

Success metric:

- measurable drop in paid-model usage for common direct mutations

## Guardrails

1. Do not push orchestration policy into backend domain logic.
2. Do not create a second mutation truth path.
3. Do not spend model tokens to recover run state that the server or backend can determine locally.
4. Do not keep deterministic fast paths as ad hoc exceptions; they must use the same run coordinator and outcome contract.
5. Do not add backend surface area unless it directly improves durability, idempotency, or authoritative evidence.

## Recommendation

Implement the refactor as:

- server-first lifecycle redesign
- deterministic-first request routing
- minimal backend extensions for idempotency and evidence
- agent reserved for ambiguity and non-deterministic planning

This gives the best blend of:

- reliability
- understandable architecture
- low operational cost
- disciplined token spending
