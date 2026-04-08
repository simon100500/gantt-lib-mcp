# Phase 41 Manual Verification

## Scope Guards

- Phase 41 adds no new MCP tools.
- Failed initial generation does not fall back to normal mutation-agent execution.
- The broad initial-generation flow не задает уточняющих вопросов even for vague prompts.

## Prompt Matrix

| Prompt | Expected object/domain baseline | Expected checks |
| --- | --- | --- |
| `Нарисуй график строительства жилого дома на 3 этажа + гараж` | Mandatory regression prompt: broad empty-project generation with separate house + garage streams | Route must be `initial_generation`, full two-stage lifecycle, at least 4 top-level phases, at least 8 task nodes, at least 3 dependency links, at least 2 cross-phase chains, no clarifying question |
| `Построй типичный график строительства` | Broad construction baseline with private-house style depth | Subject specificity, dependency graph present, realistic sequence, no clarifying question |
| `Построй график строительства детского садика` | Kindergarten-specific approvals, shell, MEP, finishing, handover | Subject specificity, hierarchy depth, dependency graph present, no clarifying question |
| `Построй график ремонта офиса 300 м2` | Office renovation / fit-out with survey, partitions, MEP, low-current, finishing | Subject specificity, dependency graph present, no clarifying question, area-aware scope |
| `Построй график строительства частного дома из газобетона` | Private-house baseline with shell, roof, envelope closure, engineering, finishing | Subject specificity, hierarchy depth, dependency graph present, material-aware scope |
| `Построй график` | Fallback broad construction interpreted as a strong private residential house baseline | Subject specificity, hierarchy depth, dependency graph present, no clarifying question |

## Operator Checklist

1. Start with an empty project and submit each prompt exactly as written above. The first prompt with `Нарисуй график строительства жилого дома на 3 этажа + гараж` is mandatory and blocks sign-off.
2. Confirm the route is `initial_generation` in the server debug log. If the route is `mutation`, the run fails validation even if tasks were created.
3. Confirm the same `runId` contains the full reconstructable chain: `route_selection`, `route_decision_evidence`, `object_type_inference`, `model_routing_decision`, `planning_output`, `plan_quality_verdict`, `compile_verdict`, `initial_generation_result`.
4. Inspect `route_decision_evidence` and verify it includes confidence, explicit signals, and an empty-project broad-request rationale. Phrase-specific routing is not an acceptable explanation.
5. Inspect `planning_output` and verify `phaseCount`, `taskNodeCount`, `dependencyCount`, and `crossPhaseDependencyCount` are present and above the broad-request floor for starter schedules.
6. Inspect `compile_verdict` and verify `compiledTaskCount`, `compiledDependencyCount`, and `topLevelPhaseCount` are present. A broad starter schedule with `compiledDependencyCount = 0` fails validation.
7. Inspect the created task tree and verify it has meaningful phase/container names instead of filler like `Этап 1` or `Task 2`.
8. Check that the hierarchy is deep enough to be usable: at least 4 top-level phases and at least 8 task nodes remain after compile, with concrete child tasks instead of a flat outline.
9. Check that the sequence is realistic for the subject area and that at least two dependency chains cross top-level phases when the object obviously requires them.
10. Confirm dependency links are visible in the committed schedule itself, not only in logs.
11. Confirm the assistant reply does not ask a clarifying question for any of the prompts.
12. If salvage occurs, confirm the assistant says the starter schedule was built partially or `частично` without exposing compiler internals.

## False Positives

- Task creation alone is not success.
- Assistant success text alone is not success.
- If `planning_output` is missing, validation fails.
- If `compile_verdict` is missing, validation fails.
- If the route was `mutation`, validation fails.
- If the dependency graph is empty for a broad starter schedule, validation fails.
