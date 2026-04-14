# Phase 43: initial-gen-no-regexp - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Source:** PRD Express Path (INITIAL-GENERATION-NO-HARDCODE-PRD.md)

<domain>
## Phase Boundary

Replace runtime semantic regex/keyword inference in the `initial-generation` intake path with one unified LLM-produced structured interpretation step.

This phase delivers:
- one strict-JSON interpretation contract for initial-generation intent, scope, ambiguity, profile, and worklist policy
- model-first semantic route/scope/classification/clarification decisions instead of runtime lexical matching
- server-side validation, enum normalization, and deterministic orchestration that consume the structured interpretation
- explicit separation between allowed technical parsing and forbidden semantic inference
- removal of semantic `regexp` / `includes` / hardcoded word-list logic from the initial-generation interpretation path
- structured logs and regression coverage for Russian and English paraphrases, ambiguous prompts, and conservative model-failure fallback

Out of scope for this phase:
- removing every regex from the repository
- replacing deterministic validation, normalization, or orchestration with freeform model behavior
- removing technical parsing for dates, ranges, numbering, list cleanup, JSON extraction, or whitespace normalization
- redesigning the already-shipped planning -> quality gate -> deterministic compile/commit architecture from Phase 41
- reopening the staged mutation architecture from Phase 42

</domain>

<decisions>
## Implementation Decisions

### Locked Product and Architecture Decisions
- Any semantic interpretation of the user request must come from an LLM in strict JSON.
- Route decision, scope detection, object profile, ambiguity, worklist policy, and fragment intent must not be derived from runtime keyword matching.
- The server must not infer semantics from specific user words.
- Prompting may include fixed enums, schemas, few-shot examples, and negative examples, but runtime lexical logic in code is not allowed.
- After interpretation, the server may only validate shape and enums, normalize technical structures, apply deterministic orchestration rules, and log structured decisions.
- The initial-generation flow must have one shared structured interpretation step; downstream modules must consume the same normalized contract instead of layering their own semantic heuristics.

### Module-Specific Replacement Decisions
- `packages/server/src/initial-generation/route-selection.ts` must stop using lexical fallback such as `looksLikeTargetedEdit(...)` for semantic routing.
- `packages/server/src/initial-generation/brief.ts` must stop deriving scope/domain semantics through `detectScopeSignals(...)` from raw text and instead consume structured interpretation fields.
- `packages/server/src/initial-generation/clarification-gate.ts` must stop using `hasAmbiguousListLanguage(...)` and `hasExplicitFragmentTarget(...)`; clarification decisions must come from the interpretation contract.
- `packages/server/src/initial-generation/classification.ts` must stop regex-based semantic classification of project archetype, object profile, planning mode, scope mode, and worklist policy.
- `packages/server/src/initial-generation/intake-normalization.ts` may keep technical parsing such as section ranges, floor extraction, list cleanup, numbering normalization, and whitespace cleanup, but it must not infer semantic scope intent from lexical markers.
- `packages/server/src/initial-generation/domain/assembly.ts` must not infer basement/handover or similar domain semantics directly from raw text; it must consume structured interpretation fields only.

### Contract and Fallback Decisions
- Introduce a unified structured interpretation contract with fixed enums for at least route, request kind, planning mode, scope mode, object profile, project archetype, worklist policy, clarification reason, and location scope.
- The contract may include `confidence` and `signals`, but those values are model-produced metadata, not code-derived keyword results.
- Conservative fallback is allowed only when the model is unavailable or output validation fails, and that fallback must remain technical/conservative rather than semantic-by-keyword.
- The server must validate the interpretation schema strictly and may perform one repair/retry pass if that pattern already exists in the surrounding architecture.
- Logs must capture the structured interpretation payload, validation verdict, fallback reason when used, and the normalized downstream decisions consumed by the planner/orchestrator.

### Testing and Verification Decisions
- Tests must cover Russian and English paraphrases that should map to the same structured result without code changes.
- Tests must cover ambiguous requests, partial-scope requests, explicit worklists, targeted-edit cases, and model-failure fallback.
- Regression checks must explicitly verify that the initial-generation interpretation path no longer contains runtime semantic `regexp`/`includes` logic for intent understanding.

### the agent's Discretion
- Exact file boundaries for the new interpretation query, schema helpers, and shared normalized-contract module.
- Exact enum names and whether the final contract matches the PRD example verbatim or with a close typed variant.
- Whether route-selection owns the interpretation call directly or delegates to a dedicated interpreter module used by route/classification/clarification/brief assembly.
- Exact repair/fallback mechanics, as long as runtime semantic keyword logic is not reintroduced.
- The exact split of plan files, provided the plan set cleanly covers contract introduction, downstream module migration, and regression/observability hardening.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Prior Architecture
- `INITIAL-GENERATION-NO-HARDCODE-PRD.md` — authoritative scope, contract, and success criteria for this phase.
- `.planning/phases/41-initial-gen-refactor/41-CONTEXT.md` — prior locked decisions for the current `initial_generation` architecture this phase must preserve while changing semantic intake.
- `.planning/phases/41-initial-gen-refactor/41-01-PLAN.md` — route/model shell decisions and existing route-selection boundary.
- `.planning/phases/41-initial-gen-refactor/41-02-PLAN.md` — brief/domain-reference/planner validation contracts that now need structured interpretation inputs instead of lexical inference.
- `.planning/phases/41-initial-gen-refactor/41-04-PLAN.md` — end-to-end orchestration and observability expectations that this phase must extend rather than replace.

### Current Initial-Generation Semantic Intake
- `packages/server/src/initial-generation/route-selection.ts` — current model-first route selection still contains semantic lexical fallback via `looksLikeTargetedEdit(...)`.
- `packages/server/src/initial-generation/classification.ts` — current regex-based semantic classification for project archetype, object profile, planning mode, scope mode, and worklist policy.
- `packages/server/src/initial-generation/clarification-gate.ts` — current ambiguity and fragment-target decisions driven by raw-text lexical checks.
- `packages/server/src/initial-generation/brief.ts` — current brief assembly that still derives semantic scope signals from raw text.
- `packages/server/src/initial-generation/intake-normalization.ts` — current mixed layer that needs semantic-vs-technical parsing separation.
- `packages/server/src/initial-generation/domain/assembly.ts` — current domain assembly path that must consume structured semantics instead of raw-text hints.
- `packages/server/src/initial-generation/orchestrator.ts` — shared lifecycle wiring and current debug-log event boundaries.
- `packages/server/src/initial-generation/types.ts` — existing initial-generation type surface that will likely need the structured interpretation contract.

### Test and Entry Surfaces
- `packages/server/src/agent.ts` — production entrypoint for route selection and initial-generation orchestration.
- `packages/server/src/agent.test.ts` — top-level routing and regression coverage.
- `packages/server/src/initial-generation/classification.test.ts` — current semantic classification regression surface.
- `packages/server/src/initial-generation/clarification-gate.test.ts` — current clarification regression surface.
- `packages/server/src/initial-generation/planner.test.ts` — planner-facing tests that may need to consume the new interpretation contract.
- `packages/server/src/initial-generation/domain/assembly.test.ts` — domain assembly regression surface tied to semantic inputs.
- `packages/server/src/initial-generation/orchestrator.test.ts` — end-to-end orchestration/logging surface.

### Roadmap and Project State
- `.planning/ROADMAP.md` — active roadmap entry and dependency on Phase 42.
- `.planning/STATE.md` — project decisions/history and roadmap evolution notes.
- `.planning/REQUIREMENTS.md` — current requirements file; this phase is PRD-driven and likely needs new REQ IDs only if the roadmap is updated separately.

</canonical_refs>

<specifics>
## Specific Ideas

- Prefer a dedicated shared interpreter module that returns one typed `InitialRequestInterpretation` consumed by route selection, classification, clarification, brief assembly, and domain assembly.
- Keep technical parsing helpers for items like `5.1-5.4`, floor numbers, numbering, and whitespace normalization, but move them behind a clearly non-semantic normalization boundary.
- Replace runtime keyword logic with prompt-time examples covering broad generation, targeted edit, explicit worklist, partial scope, ambiguity, Russian phrasing, and English paraphrases.
- Ensure model-failure fallback is conservative and does not silently recreate the old heuristic keyword classifier under a different name.
- Add regression checks that specifically search the initial-generation interpretation path for forbidden semantic helpers and lexical marker lists.

</specifics>

<deferred>
## Deferred Ideas

- Repository-wide removal of every semantic regex outside the initial-generation interpretation path
- Broader multi-lingual/domain expansion beyond what is needed to eliminate hardcoded semantics in this phase
- Reworking Phase 41 planner/compiler quality criteria beyond the interpretation-input changes required here

</deferred>

---

*Phase: 43-initial-gen-no-regexp*
*Context gathered: 2026-04-14 via PRD Express Path*
