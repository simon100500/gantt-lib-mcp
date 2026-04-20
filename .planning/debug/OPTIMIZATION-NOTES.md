# Optimization Notes

## 1. Expand Fast Mutation Routing

Biggest expected win.

Problem:
- simple requests like `Добавь X в Y` can still fall into the ordinary agent path
- that path can take `80+ s`

What to do:
- expand fast mutation routing beyond `в конце` / `после`
- include patterns such as:
  - `добавь X в Y`
  - `добавь X в раздел Y`
  - `добавь X в электрику / отделку / ...`
  - `перенеси X в Y`
  - `сдвинь X`
  - `переименуй X`

Expected impact:
- seconds to tens of seconds saved on common targeted edits

## 2. Server-Injected Context Instead of Tool Read

Do not make the model read the project first through tools when the server can prepare the needed context directly.

Current slow pattern:
- read project
- think
- mutate

Preferred pattern:
- server injects compact mutation context up front:
  - target candidates
  - branch tail
  - nearby siblings
  - current version

Expected impact:
- seconds saved
- fewer tool roundtrips
- lower token waste

## 3. Continue Trimming `commitCommand()`

Part of the reread cost is already reduced, but `execution_committed` still takes several seconds.

Next step:
- add precise internal timing around `commitCommand()` steps

Measure separately:
- dependency persistence
- final dependency read
- event write
- scheduling / recalc

Expected impact:
- likely additional reduction inside the remaining `4-5 s` authoritative commit window

## 4. Shrink Model Payload for Mutation Paths

Possible waste remains in prompt size and history size for targeted mutation requests.

What to reduce:
- conversation history
- oversized system prompt in mutation-only paths
- irrelevant instructions inherited from ordinary conversational mode

Expected impact:
- lower latency
- lower token cost

## 5. Reduce Tool Hops

Where possible, keep the flow to:
- one semantic stage
- one authoritative commit
- one verification stage

Avoid:
- extra read tools
- extra think/read cycles
- unnecessary intermediate tool calls

Expected impact:
- lower latency
- less failure surface

## 6. Dedicated Lightweight Mutation Agent Profile

For targeted edits, use a minimal profile:
- short prompt
- cheap model
- no general conversational overhead

Expected impact:
- lower latency
- lower cost for routine project edits

## Priority

Highest-value next steps:
1. expand fast routing for `Добавь X в Y` style requests
2. inject compact server-built context into mutation paths

Secondary step:
3. instrument and further trim `commitCommand()`
