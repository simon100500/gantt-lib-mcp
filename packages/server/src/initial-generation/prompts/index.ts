import { buildPartialScopeSchedulingLines, buildPartialScopeStructureLines } from './partial-scope.js';
import { buildLocationGranularityLines, buildPlanningContextLines, getPlanningMode } from './shared.js';
import type {
  PlannerPromptContext,
  SchedulingPromptInput,
  SchedulingRepairPromptInput,
  StructureRepairPromptInput,
} from './types.js';
import { buildWholeProjectSchedulingLines, buildWholeProjectStructureLines } from './whole-project.js';
import { buildWorklistSchedulingLines, buildWorklistStructureLines } from './worklist.js';

function buildModeSpecificStructureLines(input: Pick<PlannerPromptContext, 'brief' | 'classification'>): string[] {
  const planningMode = getPlanningMode(input);

  if (planningMode === 'partial_scope_bootstrap') {
    return buildPartialScopeStructureLines();
  }

  if (planningMode === 'worklist_bootstrap') {
    return buildWorklistStructureLines();
  }

  return buildWholeProjectStructureLines();
}

function buildModeSpecificSchedulingLines(input: Pick<PlannerPromptContext, 'brief' | 'classification'>): string[] {
  const planningMode = getPlanningMode(input);

  if (planningMode === 'partial_scope_bootstrap') {
    return buildPartialScopeSchedulingLines();
  }

  if (planningMode === 'worklist_bootstrap') {
    return buildWorklistSchedulingLines();
  }

  return buildWholeProjectSchedulingLines();
}

export function buildStructurePrompt(input: PlannerPromptContext): string {
  return [
    'Return strict StructuredProjectPlan JSON only. No markdown, no prose, no code fences.',
    'StructuredProjectPlan JSON only with keys: projectType, assumptions, phases.',
    'Each phase must have: phaseKey, title, subphases.',
    'Each subphase must have: subphaseKey, title, tasks.',
    'Each task must have: taskKey, title.',
    'Use exactly 3 hierarchy levels: phase -> subphase -> task.',
    'Do not output durationDays, dependencies, dates, sequencing metadata, or schedule dates.',
    'The main job of this step is to produce a clean WBS, not a compressed summary.',
    'Top-level phases must be logically coherent and domain-specific.',
    'One top-level phase = one workstream or one stage with one dominant readiness logic.',
    'Do not merge unrelated workstreams into one top-level phase just to reduce the phase count.',
    'If two activities have different crews, different prerequisites, or different completion criteria, separate them into different top-level phases or at least different subphases as appropriate.',
    'Prefer clear construction semantics over compact wording.',
    'Bad top-level titles: "Инженерное оснащение и контур здания", "Кровля и внутренняя отделка", "Фасады + электрика".',
    'Good top-level titles: "Нулевой цикл", "Несущий каркас", "Фасады и контур", "Инженерные системы", "Внутренняя отделка", "Благоустройство", "Сдача объекта".',
    'If the request implies a specialized facility, preserve the major functional workstreams instead of collapsing them into generic phases.',
    'Do not optimize for fewer phases. Optimize for correct decomposition.',
    'Do not use placeholder titles like "Этап 1", "Подэтап 2", "Задача 3".',
    'Each task title must describe exactly one construction operation.',
    'Each task title must have one dominant completion criterion and one dominant crew/work package.',
    'Do not combine different operations in one task title with "и", "/", "+", commas, or similar compound wording.',
    'If the wording implies multiple operations, split them into separate tasks or separate subphases.',
    'Task-level compound formulations are forbidden.',
    'Each subphase title must describe one coherent grouping, not multiple unrelated operations compressed together.',
    ...buildLocationGranularityLines(input),
    ...buildModeSpecificStructureLines(input),
    ...buildPlanningContextLines(input),
    `Starter schedule expectation: ${input.brief.starterScheduleExpectation}`,
    `Naming ban: ${input.brief.namingBan}`,
    `User request: ${input.userMessage}`,
  ].join('\n');
}

export function buildStructureRepairPrompt(input: StructureRepairPromptInput): string {
  return [
    'Return a fully corrected StructuredProjectPlan JSON only.',
    'Keep the same overall project intent but fix the structural violations below.',
    'Still forbid durations, dependencies, or dates.',
    'Still require exactly 3 hierarchy levels: phase -> subphase -> task.',
    `Validation reasons: ${input.verdict.reasons.join(', ')}`,
    `Validation metrics: ${JSON.stringify(input.verdict.metrics)}`,
    `Previous JSON: ${JSON.stringify(input.structure)}`,
    buildStructurePrompt(input),
  ].join('\n');
}

export function buildSchedulingPrompt(input: SchedulingPromptInput): string {
  return [
    'Return strict ScheduledProjectPlan JSON only. No markdown, no prose, no code fences.',
    'ScheduledProjectPlan JSON only with keys: projectType, assumptions, phases.',
    'Preserve the exact same phases, subphases, task keys, titles, and hierarchy from the provided structure.',
    'You may add only durationDays, dependsOn, startDate, and endDate to leaf tasks.',
    'Every leaf task must get integer durationDays >= 1.',
    'If you output explicit task dates, output both startDate and endDate in YYYY-MM-DD format.',
    'Use explicit task dates when the user request contains concrete calendar dates or a fixed overall date window.',
    'When explicit user dates are available, preserve those dates and fit the schedule inside that user-provided window instead of anchoring from today or the server date.',
    'Every dependsOn entry must reference an existing taskKey and use one of FS, SS, FF, SF.',
    'dependsOn must be an array of objects only.',
    'Each dependency object must have exactly this shape: { "taskKey": "EXISTING_TASK_KEY", "type": "FS", "lagDays": 0 }.',
    'Do not output dependency strings such as "TASK_AFS", "TASK_A;FS", "TASK_A FS", or any other shorthand.',
    'Do not output nodeKey inside dependsOn when taskKey can be used.',
    'Do not output dependsOn as a string, map, tuple, semicolon format, or compact notation.',
    'Good example: { "taskKey": "PAINT_WALLS", "title": "Окраска стен", "durationDays": 3, "dependsOn": [{ "taskKey": "PUTTY_WALLS", "type": "FS", "lagDays": 0 }] }',
    'Good example with lag: { "taskKey": "FLOOR_FINISH", "title": "Укладка чистового покрытия", "durationDays": 2, "dependsOn": [{ "taskKey": "SELF_LEVELING", "type": "FS", "lagDays": 1 }] }',
    'Bad examples: "dependsOn": ["PUTTY_WALLSFS"], "dependsOn": ["PUTTY_WALLS;FS"], "dependsOn": ["PUTTY_WALLS FS"], "dependsOn": [{ "nodeKey": "PUTTY_WALLS", "type": "FS" }].',
    'If a dependency is uncertain, omit it instead of inventing or corrupting it.',
    'Do not create, delete, rename, merge, split, or move nodes.',
    'Do not add dependencies to phases or subphases.',
    ...buildLocationGranularityLines(input),
    ...buildModeSpecificSchedulingLines(input),
    ...buildPlanningContextLines(input),
    `User request: ${input.userMessage}`,
    `Locked structure: ${JSON.stringify(input.structure)}`,
  ].join('\n');
}

export function buildSchedulingRepairPrompt(input: SchedulingRepairPromptInput): string {
  return [
    'Return a fully corrected ScheduledProjectPlan JSON only.',
    'Do not change the locked structure or any titles.',
    'Fix dependsOn formatting if needed.',
    'Output dependsOn only as arrays of objects with taskKey, type, lagDays.',
    'Never use dependency shorthand strings, semicolon-delimited references, compact references, or nodeKey-only references.',
    `Validation reasons: ${input.verdict.reasons.join(', ')}`,
    `Validation metrics: ${JSON.stringify(input.verdict.metrics)}`,
    `Previous JSON: ${JSON.stringify(input.scheduled)}`,
    buildSchedulingPrompt(input),
  ].join('\n');
}
