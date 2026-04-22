# PRD: Intent Routing, Fast Paths, and Agent Escalation for Conversational Gantt Edits

Date: 2026-04-22
Status: Proposed
Owner: Product / Backend / AI

## 1. Summary

The conversational edit system should stop treating every user mutation request as if it needs one generic agent loop.

Instead, the server should introduce a strict routing layer:

1. classify the request quickly
2. resolve the target entities
3. choose one of:
   - deterministic fast path
   - specialized fast executor
   - agent path
4. execute through authoritative server-side commands

This PRD is about speed, cost, and predictability.

The main product rule is:

> Users may speak freely, but the internal execution system must stay narrow, typed, and route-driven.

## 2. Problem

The current system still has a structural mismatch between:

- free-form user requests
- the set of actual server-side mutation capabilities
- the ordinary direct-tool mutation loop
- the special isolated handlers already present in the codebase

This creates a recurring failure mode:

- the user asks for a valid business operation
- the system broadly understands the wording
- but there is no sanctioned execution route for that operation
- so the request falls into a generic tool loop and ends with
  `Изменение не применилось: модель не выполнила ни одного валидного mutation tool call`

Example:

- `Разбей Бетонирование перекрытий 12-17 этажей поэтажно`

This is not primarily an LLM understanding problem.

It is a routing problem:

- the system lacks a first-class conversational route for structural decomposition
- the ordinary mutation tool loop does not expose a proper decomposition operation
- the specialized split flow exists, but chat does not know how to hand off into it

## 3. Product Goal

Build a conversational mutation architecture where the server decides early whether a request should be:

- handled by a cheap fast path
- handed to a specialized executor
- escalated to a real agent workflow

The desired result:

- ordinary low-risk edits are fast and cheap
- structural but well-bounded edits use special fast executors
- only genuinely complex planning requests pay the cost of agent execution

## 4. Non-Goals

- Do not move `packages/server/src/split-task.ts` back into the general mutation pipeline.
- Do not replace authoritative typed command execution with free-form tool mutation.
- Do not make decomposition a generic low-level storage primitive.
- Do not run a full agent loop for every mutation request.
- Do not introduce one giant universal `edit_gantt(anything)` tool.

## 5. Architectural Decision

Introduce a new top-level routing contract for conversational requests:

`user request -> intent router -> entity resolver -> route selector -> executor`

The core rule:

- fast route first
- specialized executor when available
- agent only when necessary

This is not a return to uncontrolled agentic mutation.

It is a tighter version of the current architecture:

- strict routing
- narrow execution paths
- authoritative commands only
- explicit escalation boundaries

## 6. Route Classes

### 6.1 Fast deterministic path

Used for small local edits that already map to an authoritative command shape.

Examples:

- shift one task
- change duration
- rename task
- create one task in resolved placement
- add or remove one dependency

Properties:

- one quick LLM classification at most
- no multi-turn agent reasoning
- direct resolve -> compile -> commit

### 6.2 Specialized fast executor path

Used for bounded operations that are more complex than one simple command, but are still narrow enough to avoid a general agent loop.

Examples:

- split one task into child tasks
- decompose one task by floors
- decompose one task by sections
- expand a local branch from a strict structured plan

Properties:

- early routing decides the executor class
- target must resolve confidently before execution
- the specialized executor may make one narrow LLM planning call
- execution remains deterministic and server-owned

Important rule:

This path does not mean “run agent with tools”.

It means:

- classify
- resolve
- call a dedicated executor
- commit authoritative commands

### 6.3 Agent path

Used only when the request genuinely requires:

- multiple context reads
- tradeoff analysis
- plan alternatives
- broad graph reasoning
- resource or critical-path-aware replanning
- unresolved ambiguity that cannot be safely auto-resolved

Examples:

- `переразложи внутреннюю отделку по этажам, но не сломай критический путь`
- `подтяни поставки под смр`
- `сделай график реалистичнее с учетом 2 бригад`

## 7. Intent Router Contract

The first step should return a strict route envelope, not a prose answer.

Example:

```json
{
  "route": "specialized_fast_path",
  "intent_family": "structure",
  "intent_type": "decompose_task",
  "confidence": 0.94,
  "risk_level": "s2",
  "executor": "split_task",
  "params": {
    "mode": "by_floor"
  },
  "ambiguities": []
}
```

Required fields:

- `route`: `fast_path` | `specialized_fast_path` | `agent_path` | `clarify`
- `intent_family`
- `intent_type`
- `confidence`
- `risk_level`
- `params`
- `ambiguities`

The router must be cheap, fast, and heavily schema-constrained.

The router must not:

- generate DB payloads
- call tools
- commit mutations
- guess task IDs

## 8. Risk Levels

Introduce four routing risk bands:

- `S0`: read-only and UI-safe
- `S1`: local low-impact mutation
- `S2`: structural bounded mutation
- `S3`: broad planning or high-impact mutation

Routing policy:

- `S0-S1` usually go to deterministic fast path
- `S2` usually go to specialized fast executors
- `S3` usually go to agent path

## 9. Entity Resolution

Intent routing is not enough.

The system must separately resolve:

- task references
- parent/container references
- group references
- current selection references
- current visible scope references

Resolver output should be explicit:

```json
{
  "resolved": true,
  "entities": [
    {
      "entityType": "task",
      "id": "task-123",
      "matchedBy": "name+scope",
      "score": 0.92
    }
  ]
}
```

For specialized executors, resolver confidence must be high before execution.

If confidence is low:

- do not silently fall into ordinary generic mutation loop
- either ask for clarification
- or escalate to agent path

## 10. Specialized Decomposition Route

The first specialized route to formalize is task decomposition.

### 10.1 Why this route matters

The product already has a separate split flow in:

- `packages/server/src/split-task.ts`

That isolation is valuable:

- the path is fast
- the prompt is narrow
- the contract is explicit
- the behavior is easier to debug than full agent mutation

The missing piece is not execution.

The missing piece is conversational handoff into that executor.

### 10.2 Product decision

Do not absorb split execution into the general mutation pipeline.

Instead:

- make chat capable of routing into it
- keep the executor isolated

### 10.3 Route-level intent

Add a route-level conversational intent:

- `intent_type = decompose_task`

Important clarification:

This is a routing and orchestration primitive.

It is not a new low-level authoritative command primitive.

The actual write path may still compile into existing `create_task`, `create_tasks_batch`, `create_dependency`, and related typed commands.

## 11. Decomposition Executor Contract

For decomposition requests, the resolver should produce:

```json
{
  "executor": "split_task",
  "targetTaskId": "task-123",
  "targetTaskName": "Бетонирование перекрытий 12-17 этажей",
  "mode": "by_floor",
  "range": {
    "from": 12,
    "to": 17
  }
}
```

Then the executor performs:

1. load target task
2. load current children
3. run one narrow decomposition planning query if needed
4. compile structured child tasks
5. commit authoritative commands
6. return clear diff/result

This must remain a short, bounded execution path.

It must not become a multi-turn tool-calling loop.

## 12. Agent Escalation Rules

Escalate to agent path only when one or more are true:

- route confidence is too low
- resolver cannot confidently identify targets
- request implies tradeoffs across multiple graph areas
- request explicitly asks for options or optimization
- request requires resource-aware or critical-path-aware reasoning
- request cannot be satisfied by an existing specialized executor

Do not escalate just because a request is phrased naturally.

## 13. Response Model

The assistant should stop overusing generic “готово” or generic failure strings.

For successful fast or specialized routes, responses should be operational:

- what was recognized
- what was changed
- how many tasks changed
- whether there are warnings

Examples:

- `Разбил «Бетонирование перекрытий 12-17 этажей» на 6 дочерних задач по этажам.`
- `Сдвинул «Монолит, корпус 1» на 3 рабочих дня. Пересчитано 14 зависимых задач.`

For failed routing:

- say what failed
- say which route was attempted
- avoid generic “no valid mutation tool call” when the real problem was routing or resolution

## 14. Success Metrics

Measure the system operationally, not only by classifier accuracy.

Primary metrics:

- share of mutation requests completed without manual repair
- median end-to-end latency
- share of requests handled by fast path
- share of requests handled by specialized fast executors
- share of requests escalated to agent path
- rate of wrong auto-application
- rate of explicit user undo after AI mutation
- rate of generic “no valid mutation tool call” failures

Critical target:

The generic no-tool-call failure should become rare for valid user intents.

## 15. Implementation Scope

### Phase 1: Introduce route envelope

- add a lightweight intent router contract
- add route classes
- log route decisions before execution

### Phase 2: Add specialized fast executor handoff

- add `decompose_task` as a route-level intent
- wire confident decomposition requests into the isolated split executor
- forbid silent fallthrough into generic ordinary mutation loop for this class

### Phase 3: Expand specialized executor catalog

- by-floor decomposition
- by-section decomposition
- local branch expansion from a strict structured plan

### Phase 4: Tighten agent boundary

- reserve agent path for true `S3` work
- make route decisions visible in logs and tests
- reduce ordinary loop usage for requests that already have dedicated executors

## 16. Non-Negotiable Rules

1. Specialized fast executors remain isolated from the general mutation pipeline.
2. Chat may hand off into a specialized executor, but does not replace it.
3. `decompose_task` is a routing primitive, not a low-level mutation command.
4. All committed writes still go through authoritative typed command execution.
5. Low-confidence structural requests must not silently degrade into the generic ordinary mutation loop.
6. Agent path is an escalation route, not the default mutation mechanism.

## 17. Expected Outcome

After this PRD is implemented:

- simple mutations are cheap and fast
- decomposition-style structural requests no longer die in the ordinary tool loop
- existing isolated fast executors remain valuable and first-class
- agent usage becomes more intentional and more expensive only where justified

The core product behavior should feel like this:

> free-form language on the outside, strict route-driven execution on the inside

