# Phase 41 Manual Verification

## Scope Guards

- Phase 41 adds no new MCP tools.
- Failed initial generation does not fall back to normal mutation-agent execution.
- The broad initial-generation flow не задает уточняющих вопросов even for vague prompts.

## Prompt Matrix

| Prompt | Expected object/domain baseline | Expected checks |
| --- | --- | --- |
| `Построй типичный график строительства` | Broad construction baseline with private-house style depth | Subject specificity, at least three top-level phases, realistic sequence, no clarifying question |
| `Построй график строительства детского садика` | Kindergarten-specific approvals, shell, MEP, finishing, handover | Subject specificity, hierarchy depth, realistic sequence, no clarifying question |
| `Построй график ремонта офиса 300 м2` | Office renovation / fit-out with survey, partitions, MEP, low-current, finishing | Subject specificity, realistic sequence, no clarifying question, area-aware scope |
| `Построй график строительства частного дома из газобетона` | Private-house baseline with shell, roof, envelope closure, engineering, finishing | Subject specificity, hierarchy depth, realistic sequence, no clarifying question |
| `Построй график` | Fallback broad construction interpreted as a strong private residential house baseline | Subject specificity, hierarchy depth, realistic sequence, no clarifying question |

## Operator Checklist

1. Start with an empty project and submit each prompt exactly as written above.
2. Confirm the route is `initial_generation` in the server debug log and that the lifecycle shows `route_selection`, `object_type_inference`, `model_routing_decision`, `planning_output`, `plan_quality_verdict`, `compile_verdict`, and `initial_generation_result`.
3. Inspect the created task tree and verify it has meaningful phase/container names instead of filler like `Этап 1` or `Task 2`.
4. Check that the hierarchy is deep enough to be usable: top-level phases contain concrete child tasks, not a flat list.
5. Check that the sequence is realistic for the subject area and that obvious engineering or finishing work is not scheduled before prerequisite shell work.
6. Confirm the assistant reply does not ask a clarifying question for any of the five prompts.
7. If salvage occurs, confirm the assistant says the starter schedule was built partially or `частично` without exposing compiler internals.
