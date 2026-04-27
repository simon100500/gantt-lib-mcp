# Semantic Planner Implementation Plan

## Goal

Replace the current coarse staged mutation classifier with a new mutation flow:

1. semantic planner LLM
2. target resolver
3. compiler -> authoritative commands
4. fallback only if planner returns ambiguity

Verification is intentionally removed as a separate stage. The system should rely on:

- authoritative command acceptance
- strict compiler behavior
- resolver ambiguity handling before commit

## Non-Goals

- No full changed-set verification
- No post-commit semantic diffing
- No ordinary-path silent takeover for resolved mutations
- No return to free-form SDK-driven write loops

## Target Architecture

### 1. Semantic Planner LLM

The model returns a structured semantic mutation plan instead of a coarse `intentType`.

Planner responsibilities:

- understand the user request
- split complex edits into ordered semantic operations
- choose semantic duration mode
- describe placement intent for added tasks
- explicitly mark ambiguity instead of guessing

Planner must not:

- generate DB command payloads
- guess task IDs
- perform direct writes

### 2. Target Resolver

The resolver maps planner hints to concrete task/container IDs using project state.

Resolver responsibilities:

- resolve task target from title/path/context
- resolve placement anchors
- resolve parent/container targets
- detect ambiguity and stop before compile

Resolver output should contain:

- resolved IDs
- confidence
- ambiguity reason when unresolved

### 3. Compiler -> Authoritative Commands

The compiler transforms resolved semantic operations into authoritative commands only.

Compiler responsibilities:

- apply server-side defaults
- preserve deterministic scheduling policy
- map one semantic operation to one or more typed commands

Examples:

- add after anchor -> `create_task` with dependency
- change duration by delta -> `change_duration`
- move in hierarchy -> `reparent_task`
- link tasks -> `create_dependency`

### 4. Fallback Only On Ambiguity

Fallback is allowed only when:

- planner returns ambiguity
- resolver cannot confidently resolve the target
- compiler does not support the semantic shape

Fallback is not allowed:

- when planner returned a resolved plan
- when compiler can build authoritative commands
- as a silent replacement for the main path

## Semantic Plan Schema v1

```ts
type SemanticMutationPlan = {
  ambiguity: 'none' | 'low_confidence_target' | 'missing_anchor' | 'unsupported';
  explanation?: string;
  operations: SemanticOperation[];
};

type SemanticOperation =
  | {
      action: 'change_duration';
      targetHint: string;
      durationMode: 'absolute_days' | 'delta_days' | 'multiplier';
      durationValue: number;
      anchor?: 'start' | 'end';
    }
  | {
      action: 'add_task';
      title: string;
      taskType?: 'task' | 'milestone';
      durationDays?: number;
      placement: {
        mode: 'after' | 'before' | 'inside_tail';
        anchorHint?: string;
        parentHint?: string;
      };
    }
  | {
      action: 'move_task';
      targetHint: string;
      moveMode: 'to_date' | 'relative_delta' | 'to_parent';
      targetDate?: string;
      deltaDays?: number;
      parentHint?: string;
    }
  | {
      action: 'rename_task';
      targetHint: string;
      newTitle: string;
    }
  | {
      action: 'delete_task';
      targetHint: string;
    }
  | {
      action: 'link_tasks';
      predecessorHint: string;
      successorHint: string;
      dependencyType?: 'FS' | 'SS' | 'FF' | 'SF';
      lagDays?: number;
    }
  | {
      action: 'unlink_tasks';
      predecessorHint: string;
      successorHint: string;
    }
  | {
      action: 'move_in_hierarchy';
      targetHint: string;
      parentHint: string | null;
    };
```

## Core Policy Defaults

These defaults must live in compiler policy, not only in prompt text.

- duration changes modify `end` by default
- start date must remain unchanged unless the user explicitly requests otherwise
- additive duration phrases like `на 20 дней` mean delta, not absolute duration
- multiplicative phrases like `в 2 раза` mean scale duration, anchored to `end` by default
- placement phrases like `в конце работ` mean semantic placement, not standalone insertion
- if ambiguity remains after resolution, stop and fallback instead of guessing

## Rollout Plan

### Phase 1. Introduce Semantic Planner

Create a new planner layer alongside the current mutation stack.

Add files:

- `packages/server/src/mutation/semantic-types.ts`
- `packages/server/src/mutation/semantic-planner.ts`
- `packages/server/src/mutation/semantic-planner.test.ts`

Tasks:

- define planner schema
- add planner prompt and parser
- support first operations:
  - `change_duration`
  - `add_task`
- add live LLM regression tests for:
  - `увеличь ... в 2 раза`
  - `увеличь ... на 20 дней`
  - `добавь ... в конце работ`

### Phase 2. Build Operation-Based Resolver

Add files:

- `packages/server/src/mutation/semantic-resolver.ts`
- `packages/server/src/mutation/semantic-resolver.test.ts`

Tasks:

- resolve `targetHint` to task ID
- resolve add-task placement anchors
- resolve parent/container matches
- return structured ambiguity instead of weak guesses

Resolver output should be detached from old `intentType` contracts.

### Phase 3. Build Semantic Compiler

Add files:

- `packages/server/src/mutation/semantic-compiler.ts`
- `packages/server/src/mutation/semantic-compiler.test.ts`

Tasks:

- compile `change_duration`
- compile `add_task`
- compile `move_task`
- compile `rename_task`
- compile `delete_task`
- compile `link_tasks`
- compile `unlink_tasks`
- compile `move_in_hierarchy`

Compiler must emit existing authoritative typed commands only.

### Phase 4. Rewire Orchestrator

Refactor:

- `packages/server/src/mutation/orchestrator.ts`

Tasks:

- call semantic planner first
- if `ambiguity !== none`, return fallback status
- otherwise call semantic resolver
- if resolver unresolved, return fallback status
- otherwise compile commands
- execute authoritative commands directly
- treat successful authoritative commit as completion

There should be no heavy post-commit verification stage.

### Phase 5. Restrict Agent Fallback Behavior

Refactor:

- `packages/server/src/agent.ts`

Tasks:

- route targeted mutation requests into semantic planner path first
- allow fallback only when planner/resolver/compiler returns ambiguity or unsupported shape
- forbid ordinary path from silently taking over resolved mutation requests
- keep legacy path only for explicit ambiguity and unsupported semantic shapes

## Migration Strategy

Use a feature flag during rollout.

Recommended flag:

- `USE_SEMANTIC_PLANNER=true`

Rollout steps:

1. implement planner in parallel with current path
2. log old and new mutation interpretations side by side
3. switch duration and add-task requests first
4. switch move/link/unlink next
5. remove old intent-classifier path after stability

## File Plan

### New Files

- `packages/server/src/mutation/semantic-types.ts`
- `packages/server/src/mutation/semantic-planner.ts`
- `packages/server/src/mutation/semantic-planner.test.ts`
- `packages/server/src/mutation/semantic-resolver.ts`
- `packages/server/src/mutation/semantic-resolver.test.ts`
- `packages/server/src/mutation/semantic-compiler.ts`
- `packages/server/src/mutation/semantic-compiler.test.ts`

### Refactor Existing Files

- `packages/server/src/mutation/orchestrator.ts`
- `packages/server/src/mutation/execution.ts`
- `packages/server/src/agent.ts`

### Compatibility Layer To Remove Later

- `packages/server/src/mutation/intent-classifier.ts`
- `packages/server/src/mutation/plan-builder.ts`

## Test Strategy

Focus on three layers:

- planner schema tests
- resolver tests
- compiler tests

And one integration layer:

- live LLM semantic planner tests

Minimum live prompts:

- `увеличь срок штукатурки в 2 раза`
- `увеличь Покраска стен в МОП на 20 дней`
- `добавь сдачу ГАСН в конце работ`
- `перенеси электрику внутрь этапа "Инженерные системы"`

## Expected Outcome

This design should restore much of the semantic flexibility of the old agentic flow while keeping:

- strict write control
- deterministic authoritative execution
- clear ambiguity boundaries
- lower chaos than direct free-form SDK tool usage

## First Implementation Slice

The recommended first slice is:

1. semantic planner v1
2. resolver for single-task references
3. compiler for:
   - `change_duration`
   - `add_task`
4. orchestrator wiring for those two actions only
5. fallback for everything else

This is the smallest useful path that should already outperform the current coarse classifier on real mutation phrasing.
