---
phase: 43-initial-gen-no-regexp
verified: 2026-04-14T10:20:36Z
status: passed
score: 4/4 must-haves verified
---

# Phase 43: initial-gen-no-regexp Verification Report

**Phase Goal:** remove runtime semantic keyword/regexp heuristics from the initial-generation intake path by introducing one structured interpretation contract, reusing it across downstream consumers, and hardening telemetry/regression guards.
**Verified:** 2026-04-14T10:20:36Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | One shared strict-JSON interpretation step returns route, request kind, planning mode, scope mode, object profile, project archetype, worklist policy, clarification reason, and location scope for initial-generation intake | ✓ VERIFIED | Contract exists in `InitialRequestInterpretation` at `packages/server/src/initial-generation/types.ts:19-57`; interpreter validates and normalizes those fields in `packages/server/src/initial-generation/interpreter.ts:54-297, 436-492`. |
| 2 | `route-selection`, `classification`, `clarification-gate`, `brief`, and `domain/assembly` no longer derive semantics from runtime `regexp`, `includes`, or hardcoded lexical marker lists; only technical parsing remains | ✓ VERIFIED | Route selection uses interpreter output only at `packages/server/src/initial-generation/route-selection.ts:86-133`; classification projects from interpretation at `packages/server/src/initial-generation/classification.ts:84-106`; clarification uses structured fields at `packages/server/src/initial-generation/clarification-gate.ts:21-86`; brief consumes interpretation/classification at `packages/server/src/initial-generation/brief.ts:19-138`; domain assembly uses interpreted scope/profile plus technical location scope at `packages/server/src/initial-generation/domain/assembly.ts:25-135`; guard scans found no banned helpers in these files. |
| 3 | Conservative fallback is available for model failure or invalid output, but it uses project state and technical structure only, not semantic keyword inference | ✓ VERIFIED | Fallback derives route/scope from task count, hierarchy, worklist count, and location scope only in `packages/server/src/initial-generation/interpreter.ts:362-419`; route-selection fallback reasons map to project state only in `packages/server/src/initial-generation/route-selection.ts:54-84`; tests lock `model_unavailable`, `schema_invalid`, and `empty_response` behavior in `packages/server/src/initial-generation/interpreter.test.ts:180-199, 242-267` and `packages/server/src/agent.test.ts:220-271`. |
| 4 | Logs and regression tests cover Russian and English paraphrases, ambiguity, explicit worklists, targeted-edit cases, and model-failure fallback | ✓ VERIFIED | Orchestrator emits interpretation, validation, fallback, and normalized decision events in `packages/server/src/initial-generation/orchestrator.ts:376-420`; agent forwards interpretation evidence before branching in `packages/server/src/agent.ts:928-948`; test coverage exists in `packages/server/src/agent.test.ts:130-272, 347-354`, `packages/server/src/initial-generation/interpreter.test.ts:19-281`, and `packages/server/src/initial-generation/orchestrator.test.ts:352-533`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/server/src/initial-generation/types.ts` | Shared interpretation enums and typed contract | ✓ VERIFIED | Exists, substantive, exported contract at `:19-57`, consumed downstream. |
| `packages/server/src/initial-generation/interpreter.ts` | Strict JSON interpretation query, validation, repair, conservative fallback | ✓ VERIFIED | Exists, substantive prompt/validation/fallback flow at `:54-492`, used by route selection and orchestrator. |
| `packages/server/src/initial-generation/route-selection.ts` | Route selection derived from interpretation | ✓ VERIFIED | Exists, substantive interpreter-driven route choice at `:86-133`, no lexical helper fallback. |
| `packages/server/src/initial-generation/intake-normalization.ts` | Technical-only normalization helpers | ✓ VERIFIED | Exists, technical regex parsing only for whitespace/lists/ranges/floors/zones at `:7-164`; no semantic scope booleans remain. |
| `packages/server/src/initial-generation/classification.ts` | Projection from interpretation to downstream classification | ✓ VERIFIED | Exists, substantive projection logic at `:84-106`, wired into orchestrator. |
| `packages/server/src/initial-generation/orchestrator.ts` | Single interpretation call reused across intake path, with telemetry | ✓ VERIFIED | Exists, exactly one interpretation call at `:301-311`; reuses output across classification/clarification/domain/brief and logs telemetry at `:318-420`. |
| `packages/server/src/agent.test.ts` | Top-level route and guard regressions | ✓ VERIFIED | Exists, covers paraphrase, targeted-edit, fallback, and source guards at `:130-272, 319-354`. |
| `packages/server/src/initial-generation/interpreter.test.ts` | Interpreter and helper-regression guards | ✓ VERIFIED | Exists, covers paraphrase/worklist/repair/fallback and source-guard scans at `:19-281`. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `route-selection.ts` | `interpreter.ts` | Shared interpretation call before route choice is returned | ✓ WIRED | `interpretInitialRequest(...)` invoked at `packages/server/src/initial-generation/route-selection.ts:90`. |
| `interpreter.ts` | `types.ts` | Schema validation and normalized contract construction | ✓ WIRED | Interpreter imports and validates against typed enums/contracts at `packages/server/src/initial-generation/interpreter.ts:1-10, 54-297`. |
| `orchestrator.ts` | `interpreter.ts` | One shared interpretation call for the full intake path | ✓ WIRED | `deps.interpretRequest(...)` called once at `packages/server/src/initial-generation/orchestrator.ts:301-311`. |
| `classification.ts` | `types.ts` | Mapping from validated interpretation enums to classification output | ✓ WIRED | Classification imports `InitialRequestInterpretation` and projects its fields at `packages/server/src/initial-generation/classification.ts:1-6, 84-106`. |
| `domain/assembly.ts` | `brief.ts` | Common interpretation-driven object/scope inputs | ✓ WIRED | Both use the shared interpretation/classification/domain context path; orchestrator threads them together at `packages/server/src/initial-generation/orchestrator.ts:322-337`. |
| `agent.ts` | `orchestrator.ts` | Initial-generation lifecycle logs visible from production entrypoint | ✓ WIRED | Agent logs interpretation evidence then calls `runInitialGeneration(...)` at `packages/server/src/agent.ts:928-956`. |
| `orchestrator.test.ts` | `orchestrator.ts` | Structured log payload assertions | ✓ WIRED | Tests assert happy-path, repair, and fallback payloads at `packages/server/src/initial-generation/orchestrator.test.ts:352-533`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `route-selection.ts` | `interpreterResult.interpretation` | `interpretInitialRequest(...)` in `route-selection.ts:90-115` | Yes; route/confidence/reason derive directly from parsed or conservative fallback interpretation | ✓ FLOWING |
| `classification.ts` | `interpretation`, `locationScope` | `runInitialGeneration()` passes shared interpretation at `orchestrator.ts:318-321` | Yes; classification fields come from interpreted enums with technical location fallback only when interpretation scope is empty | ✓ FLOWING |
| `clarification-gate.ts` | `interpretation.clarification`, `classification.scopeMode` | `runInitialGeneration()` passes shared interpretation/classification at `orchestrator.ts:322-326` | Yes; ask/proceed decisions come from structured clarification fields | ✓ FLOWING |
| `brief.ts` | `interpretation`, `classification`, `domainSkeleton` | `runInitialGeneration()` builds brief from shared intake outputs at `orchestrator.ts:333-340` | Yes; object/scope summaries derive from structured enums and normalized technical scope | ✓ FLOWING |
| `domain/assembly.ts` | `interpretation`, `classification`, `clarificationDecision` | `runInitialGeneration()` passes all three at `orchestrator.ts:327-332` | Yes; fragment/profile decisions derive from interpreted scope plus technical location scope | ✓ FLOWING |
| `orchestrator.ts` | Telemetry payloads | `buildInterpretationTelemetry()` / `buildNormalizedDecisionTelemetry()` at `orchestrator.ts:222-261` | Yes; logs include real interpretation, validation, fallback, classification, clarification, brief, and domain skeleton fields | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Regression matrix for paraphrases, ambiguity, worklists, targeted edits, fallback, and telemetry | `npx tsx --test packages/server/src/agent.test.ts packages/server/src/initial-generation/interpreter.test.ts packages/server/src/initial-generation/classification.test.ts packages/server/src/initial-generation/clarification-gate.test.ts packages/server/src/initial-generation/domain/assembly.test.ts packages/server/src/initial-generation/orchestrator.test.ts` | 52 tests passed, 0 failed | ✓ PASS |
| Server compiles with the new intake contract | `npm run build -w packages/server` | `@gantt/mcp` build passed, `@gantt/server` build passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| `IGNR-01` | `43-01-PLAN.md` | Initial-generation intake uses one strict JSON interpretation contract returning route, request kind, planning mode, scope mode, object profile, project archetype, worklist policy, clarification, and location scope | ✓ SATISFIED | Contract in `packages/server/src/initial-generation/types.ts:19-57`; strict parser/validator in `packages/server/src/initial-generation/interpreter.ts:54-297, 436-492`. |
| `IGNR-02` | `43-02-PLAN.md` | Runtime code in the interpretation path does not derive semantics from keyword matching, `regexp`, `includes`, or lexical marker lists for route, scope, profile, or clarification | ✓ SATISFIED | Semantic consumers now project from interpretation in `route-selection.ts:86-133`, `classification.ts:84-106`, `clarification-gate.ts:21-86`, `brief.ts:19-138`, `domain/assembly.ts:25-135`; guard tests and source scans found no banned helpers. |
| `IGNR-03` | `43-02-PLAN.md` | Server validates interpretation output strictly, keeps only technical parsing outside the model, and uses conservative non-semantic fallback when model output is unavailable or invalid | ✓ SATISFIED | Validation/repair/fallback in `interpreter.ts:198-297, 362-492`; technical-only normalization in `intake-normalization.ts:7-164`; fallback tests in `interpreter.test.ts:180-199, 242-267`. |
| `IGNR-04` | `43-03-PLAN.md` | Logs and automated regressions cover Russian and English paraphrases, ambiguity, explicit worklists, targeted-edit cases, and model-failure fallback | ✓ SATISFIED | Telemetry events in `orchestrator.ts:376-420` and `agent.ts:928-948`; regression suites in `agent.test.ts:130-272, 347-354`, `interpreter.test.ts:19-281`, `orchestrator.test.ts:352-533`. |

Orphaned requirements for Phase 43: none. `REQUIREMENTS.md` maps only `IGNR-01` through `IGNR-04` to Phase 43, and all four appear in plan frontmatter.

### Anti-Patterns Found

No blocker or warning anti-patterns were confirmed in the verified intake-path files. Technical regex remains in `packages/server/src/initial-generation/intake-normalization.ts:7-164` for allowed structural parsing only.

### Human Verification Required

None. This phase is server-side and the goal is fully covered by code, source-guard scans, targeted automated tests, and a successful build.

### Gaps Summary

No gaps found. The codebase contains one structured interpretation contract, downstream consumers reuse that shared result, conservative fallback stays non-semantic, and telemetry plus regression guards lock the phase goal in place.

---

_Verified: 2026-04-14T10:20:36Z_
_Verifier: Claude (gsd-verifier)_
