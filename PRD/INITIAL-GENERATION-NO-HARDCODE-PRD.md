# PRD: Initial Generation Without Hardcoded Semantics

## Problem

The current `initial-generation` flow still relies on runtime `regexp`, `includes`, and hardcoded lexical markers to infer request meaning.

This is brittle because:

- it fails on unseen phrasings;
- it does not scale across languages and writing styles;
- it mixes semantic interpretation with deterministic execution;
- it creates hidden routing and classification behavior that must be maintained by adding more words to code.

Examples of unwanted patterns:

- `looksLikeTargetedEdit(...)`
- `detectScopeSignals(...)`
- `hasAmbiguousListLanguage(...)`
- `hasExplicitFragmentTarget(...)`
- `inferWorklistPolicy(...)`

## Goal

Move `initial-generation` to this architecture:

- `LLM -> structured interpretation`
- `server -> validation / normalization / deterministic orchestration`

No runtime semantic regex or hardcoded word lists for understanding user intent.

The maximum allowed semantic guidance is:

- explicit enums;
- schema definitions;
- few-shot examples in prompts;
- negative examples in prompts.

## Non-Goals

- removing every regex from the codebase;
- replacing deterministic validation with freeform model behavior;
- removing technical parsing for formats like ranges, dates, numbering, JSON extraction, or whitespace normalization.

## Product Requirements

1. Any semantic interpretation of the user request must come from an LLM in strict JSON.
2. Route decision, scope detection, object profile, ambiguity, worklist policy, and fragment intent must not be derived from runtime keyword matching.
3. The server must not infer semantics from specific user words.
4. Prompting may include examples, schemas, and allowed enum values, but not runtime lexical logic in code.
5. After interpretation, the server may only:
   - validate shape and enums;
   - normalize technical structures;
   - apply deterministic orchestration rules;
   - log structured decisions.

## Target Contract

Introduce a unified structured interpretation step for initial generation, for example:

```json
{
  "route": "initial_generation|mutation",
  "confidence": 0.0,
  "requestKind": "whole_project|partial_scope|explicit_worklist|targeted_edit|ambiguous",
  "planningMode": "whole_project_bootstrap|partial_scope_bootstrap|worklist_bootstrap",
  "scopeMode": "full_project|partial_scope|explicit_worklist",
  "objectProfile": "unknown|office_fitout|kindergarten|residential_multi_section",
  "projectArchetype": "unknown|new_building|renovation",
  "locationScope": {
    "sections": ["5.1", "5.2"],
    "floors": ["1", "2"],
    "zones": ["подвал"]
  },
  "worklistPolicy": "strict_worklist|worklist_plus_inferred_supporting_tasks",
  "clarification": {
    "needed": true,
    "reason": "ambiguous_list|missing_scope|none"
  },
  "signals": ["..."]
}
```

## Components To Replace

### 1. `route-selection.ts`

Remove lexical fallback such as `looksLikeTargetedEdit()`.

Target behavior:

- model-first route decision;
- conservative technical fallback only if the model is unavailable;
- no semantic routing by words in code.

### 2. `brief.ts`

Remove lexical `detectScopeSignals()`.

Target behavior:

- scope and domain signals come from structured interpretation;
- brief assembly consumes structured fields instead of inferring them itself.

### 3. `clarification-gate.ts`

Remove:

- `hasAmbiguousListLanguage()`
- `hasExplicitFragmentTarget()`

Target behavior:

- clarification is based on structured interpretation fields;
- ambiguity decisions are model-produced, server-validated.

### 4. `classification.ts`

Remove regex-based classification of:

- project archetype;
- object profile;
- planning mode;
- scope mode.

Target behavior:

- all semantic classification comes from the structured interpretation step.

### 5. `intake-normalization.ts`

Split technical parsing from semantic inference.

Allowed:

- section range parsing like `5.1-5.4`;
- floor number extraction;
- list normalization;
- whitespace cleanup.

Not allowed:

- deriving semantic scope intent from lexical markers in runtime code.

### 6. `domain/assembly.ts`

Remove semantic regex hints such as basement / handover inference from raw text.

Target behavior:

- assembly uses only structured fields returned by interpretation.

### 7. Shared Initial-Generation Flow

Avoid multiple overlapping semantic layers.

Target behavior:

- one structured interpretation step;
- downstream modules consume the same normalized contract.

## Prompt Design Principles

- strict JSON only;
- fixed enum values;
- few-shot examples instead of hardcoded words in code;
- explicit instruction to infer meaning from request semantics, not keyword matching;
- examples for ambiguous cases and conservative outputs;
- examples for unseen phrasings that map to the same structured result.

## Success Criteria

- no runtime semantic `regexp/includes` in the `initial-generation` interpretation path;
- unseen phrasings work without code changes;
- route/classification/clarification decisions are logged as structured outputs;
- server behavior remains deterministic after interpretation;
- tests cover Russian and English paraphrases, ambiguous requests, and model-failure fallback.

## Risks

### 1. Unstable model output

Mitigation:

- strict schema;
- parser validation;
- repair retry;
- conservative fallback.

### 2. Loss of current heuristic shortcuts

Mitigation:

- use a cheap model for interpretation;
- keep prompts compact;
- use examples instead of runtime keyword logic.

### 3. Mixing technical parsing and semantic inference

Mitigation:

- explicitly separate those layers in module responsibilities.

## Rollout Plan

1. Add a unified `initial request interpretation` query returning strict JSON.
2. Convert `route-selection` to model-first behavior without lexical fallback.
3. Convert `classification`, `clarification`, and `brief` to consume structured fields.
4. Remove semantic regex and word lists from `initial-generation/*`.
5. Keep only technical format parsers and validation regex.
6. Add regression tests for paraphrases and previously unsupported phrasings.
