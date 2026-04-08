---
status: partial
phase: 41-initial-gen-refactor
source: [41-VERIFICATION.md]
started: 2026-04-08T14:51:04.0689575+03:00
updated: 2026-04-08T14:51:04.0689575+03:00
---

## Current Test

awaiting human testing against remediation contract

## Tests

### 1. Run the mandatory prompt `Нарисуй график строительства жилого дома на 3 этажа + гараж` in a real empty project
expected: Route is `initial_generation`; the same runId contains route_selection, route_decision_evidence, planning_output, compile_verdict, and initial_generation_result; the committed result contains at least 4 top-level phases, at least 8 task nodes, at least 3 dependency links, and at least 2 cross-phase dependency chains
result: pending

### 2. Run the remaining broad prompts from docs.md in real empty projects
expected: Each prompt routes through initial_generation, produces subject-specific hierarchy with visible dependency links, avoids clarifying questions, and never passes validation if the route silently falls back to mutation
result: pending

### 3. Inspect a real server debug log for one initial-generation run
expected: The log contains route_selection, route_decision_evidence, object_type_inference, model_routing_decision, planning_output, plan_quality_verdict, compile_verdict, and initial_generation_result for the same runId, plus route confidence and compiled dependency counts
result: pending

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- Validation must fail if tasks were created through `mutation` instead of `initial_generation`.
- Validation must fail if `planning_output` or `compile_verdict` is missing for the tested run.
- Validation must fail if a broad starter schedule has no dependency graph in the committed result.
