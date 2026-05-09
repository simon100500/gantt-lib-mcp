# Continue — Initial Generation streaming/remediation

## Last action

Initial-generation preview was moved earlier and then upgraded to token-stream driven best-effort preview. Current server state:
- `packages/server/src/agent/pi-model.ts` now uses `@mariozechner/pi-ai` `stream()` and forwards `text_delta`
- `packages/server/src/agent.ts` passes planner `onTextDelta`
- `packages/server/src/initial-generation/orchestrator.ts` builds provisional preview from partial model text and merges snapshots to avoid hard UI resets

Build/test evidence:
- `npm run build -w packages/server`
- `node --test --import tsx packages/server/src/initial-generation/orchestrator.test.ts`

## Next action

Work the three open issues in this order, then add an E2E/debug harness:

1. Fix over-strict initial-generation routing/classification so prompts with 3-4 work directions are enriched as broad project requests, while true user-authored full structures/worklists still stay strict.
2. Fix degenerate hierarchy generation so we do not emit `parent -> subparent -> single task` chains when the middle node adds no value.
3. Fix duplicate late-stage preview refinement so once token-stream preview already reached near-final structure, we do not visibly replay the same tree again with trivial renames/translations.
4. Add E2E coverage plus a debug capture mode that records raw planner token stream / preview waves for failing runs.

## Why

The current system is better than before, but still wrong in three product-critical ways:
- generation got poorer because the “explicit worklist / strict follow user items” rules became too aggressive
- hierarchy quality is low because we keep meaningless one-child containers
- streaming UX still wastes time: long initial wait, then near-final structure appears, then similar structure is replayed again as if new work happened

These are now more important than incremental preview transport tweaks.

## Open threads

- The likely source of issue 1 is the `explicitWorkItems` / `worklist_bootstrap` path in:
  - `packages/server/src/initial-generation/classification.ts`
  - `packages/server/src/initial-generation/brief.ts`
  - `packages/server/src/initial-generation/prompts/index.ts`
  - `packages/server/src/initial-generation/prompts/shared.ts`
  - `packages/server/src/initial-generation/planner.ts` helpers like `buildFlatWorklistStructure()` and `buildDeterministicScheduledWorklist()`
- The likely source of issue 2 is not just rendering. Check structure creation and flattening:
  - `packages/server/src/initial-generation/planner.ts`
  - `packages/server/src/initial-generation/quality-gate.ts`
  - possibly prompt rules pushing a forced 3-level hierarchy even when one subphase contains one task
- The likely source of issue 3 is mixed preview sources:
  - token-stream partial preview from `buildLoosePreviewTasks()`
  - post-stage preview from `onStructureReady` / `onScheduledReady`
  - plus semantic changes like English keys/titles becoming Russian finalized titles
- The user specifically noticed “almost final structure appears, then same structure gets refined again”. This needs a real debug trace, not guesswork.

## Do not

- Do NOT slow the generation pipeline with sleeps, staged fake delays, or extra model passes just for UX.
- Do NOT change prompts to explicitly ask the model to first output structure and then something else. Keep the product pipeline semantics the same.
- Do NOT require strict validity for streaming preview. Best-effort partial preview is acceptable.
- Do NOT treat every 3-4 item prompt as a strict explicit worklist. Need softer separation between:
  - broad request that names several work directions and still needs enrichment
  - genuinely user-authored ready structure/worklist
- Do NOT fix the duplicate-preview issue only in the UI. First verify whether server is emitting semantically redundant preview waves.

## Debug plan

Add a reproducible debug path for one initial-generation run:
- capture raw `text_delta` stream from `structure_planning`
- capture raw `text_delta` stream from `schedule_metadata`
- capture every `preview_tasks_replace` wave with:
  - wave number
  - source (`structure_phases`, `structure_subphases`, `scheduled_tasks`)
  - task count
  - compact tree summary (`id`, `name`, `parentId`)
- capture final authoritative `tasks`

Preferred artifact:
- write a per-run debug file under `.planning/debug/` or `.artifacts/` with the exact sequence

This should let the next agent answer:
- was the duplicate refinement caused by token-stream parser churn?
- or by `onStructureReady` / `onScheduledReady` re-emitting equivalent trees?
- or by real planner text drift (e.g. English placeholders becoming Russian finalized labels)?

## E2E requirements

Add at least one E2E/integration test covering:
- input with 3-4 named work directions that should still expand into a richer project graph
- assertion that final graph is meaningfully richer than the raw 3-4 directions
- assertion that hierarchy does not contain excessive one-child container chains
- assertion that preview waves are monotonic enough:
  - later preview should not materially shrink the visible tree before final `tasks`
  - redundant replay of equivalent tree should be rejected or coalesced

If browser E2E is too heavy for first pass, add a server-side orchestrator/integration test with recorded preview wave sequence and tree-shape assertions.

## Modified files

- `packages/server/src/agent/pi-model.ts`
- `packages/server/src/agent.ts`
- `packages/server/src/initial-generation/orchestrator.ts`
- `packages/server/src/initial-generation/planner.ts`

## Suggested first reads

Real files to open first:
- `packages/server/src/initial-generation/classification.ts`
- `packages/server/src/initial-generation/brief.ts`
- `packages/server/src/initial-generation/planner.ts`
- `packages/server/src/initial-generation/orchestrator.ts`
- `packages/server/src/initial-generation/prompts/index.ts`
- `packages/server/src/initial-generation/prompts/shared.ts`
- `packages/server/src/initial-generation/orchestrator.test.ts`
