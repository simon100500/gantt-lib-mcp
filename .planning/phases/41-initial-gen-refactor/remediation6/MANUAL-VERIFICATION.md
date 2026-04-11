# Remediation 6 Manual Verification

Date: 2026-04-11

Scope: server-side planning pipeline verification for the four PRD prompts using the built `packages/server/dist/initial-generation/*` modules.

## Observed Behavior

| Prompt | Observed planning mode | Clarification result | Observed scope behavior | Status |
| --- | --- | --- | --- | --- |
| `График строительства детского сада на 3 этажа` | `whole_project_bootstrap` | `proceed_with_assumptions` | Whole-project kindergarten skeleton with approvals, shell, MEP, finishing, and handover milestones | PASS |
| `график передачи конструкций подвала секции 5.1-5.4` | `partial_scope_bootstrap` | `proceed_with_assumptions` | Fragment-scoped basement handover skeleton constrained to sections `5.1-5.4` with no whole-project expansion in boundaries | PASS |
| Explicit work list for fragment package (`Разработка котлована` -> `Бетонирование фундаментной плиты`) | `worklist_bootstrap` | `proceed_with_assumptions` | User work items preserved as source-of-truth input; scope boundary stays inside explicit work list | PASS |
| `график подвала секции 5.1-5.4` | `partial_scope_bootstrap` | `ask` with `fragment_target_ambiguity` | Exactly one high-impact clarification offered; fallback assumption stays on basement handover target | PASS |

## Notes

- Whole-project prompt classified as `new_building` + `kindergarten`, confidence `0.78`.
- Basement handover prompt classified as `new_building` + `residential_multi_section`, confidence `0.83`, with extracted sections `5.1-5.4`.
- Explicit work-list prompt classified as `unknown` archetype/profile with `strict_worklist` policy and `high` source confidence.
- Ambiguous fragment prompt produced one structured clarification question:
  `Какой итог нужен по фрагменту 5.1, 5.2, 5.3, 5.4: передача конструкций или полное завершение работ?`

## Command Used

```powershell
@'
import { normalizeInitialRequest } from './packages/server/dist/initial-generation/intake-normalization.js';
import { classifyInitialRequest } from './packages/server/dist/initial-generation/classification.js';
import { decideInitialClarification } from './packages/server/dist/initial-generation/clarification-gate.js';
import { assembleDomainSkeleton } from './packages/server/dist/initial-generation/domain/assembly.js';
'@ | node --input-type=module -
```
