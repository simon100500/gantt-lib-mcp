import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGenerationBrief } from './brief.js';
import { classifyInitialRequest } from './classification.js';
import { decideInitialClarification } from './clarification-gate.js';
import { assembleDomainSkeleton } from './domain/assembly.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import { parseModelJson } from './json-response.js';
import { planInitialProject } from './planner.js';
import {
  evaluateSchedulingQuality,
  evaluateStructureQuality,
} from './quality-gate.js';

describe('initial-generation quality gate', () => {
  it('flags weak structures with placeholder titles and shallow decomposition', () => {
    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
    });

    const verdict = evaluateStructureQuality({
      projectType: 'private_residential_house',
      assumptions: [],
      phases: [
        {
          phaseKey: 'phase-1',
          title: 'Этап 1',
          subphases: [
            {
              subphaseKey: 'subphase-1',
              title: 'Подэтап 1',
              tasks: [{ taskKey: 'task-1', title: 'Задача 1' }],
            },
          ],
        },
      ],
    }, brief, 'Построй график');

    assert.equal(verdict.accepted, false);
    assert.ok(verdict.reasons.includes('too_few_phases'));
    assert.ok(verdict.reasons.includes('placeholder_titles'));
  });

  it('keeps scheduling output from renaming or restructuring the locked hierarchy', () => {
    const structure = {
      projectType: 'private_residential_house',
      assumptions: [],
      phases: [
        {
          phaseKey: 'phase-shell',
          title: 'Инженерное оснащение и контур здания',
          subphases: [
            {
              subphaseKey: 'subphase-shell',
              title: 'Контур',
              tasks: [
                { taskKey: 'task-1', title: 'Монтаж стен' },
                { taskKey: 'task-2', title: 'Устройство кровли' },
              ],
            },
          ],
        },
        {
          phaseKey: 'phase-finish',
          title: 'Отделка',
          subphases: [
            {
              subphaseKey: 'subphase-finish',
              title: 'Чистовая',
              tasks: [
                { taskKey: 'task-3', title: 'Отделка стен' },
                { taskKey: 'task-4', title: 'Монтаж дверей' },
              ],
            },
          ],
        },
        {
          phaseKey: 'phase-site',
          title: 'Подготовка участка',
          subphases: [
            {
              subphaseKey: 'subphase-site',
              title: 'Подготовка',
              tasks: [
                { taskKey: 'task-5', title: 'Разбивка осей' },
                { taskKey: 'task-6', title: 'Ограждение' },
              ],
            },
          ],
        },
        {
          phaseKey: 'phase-foundation',
          title: 'Фундамент',
          subphases: [
            {
              subphaseKey: 'subphase-foundation',
              title: 'Бетонные работы',
              tasks: [
                { taskKey: 'task-7', title: 'Котлован' },
                { taskKey: 'task-8', title: 'Бетонирование' },
              ],
            },
          ],
        },
      ],
    };
    const brief = buildGenerationBrief({
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
    });

    const scheduled = {
      ...structure,
      phases: structure.phases.map((phase) => ({
        ...phase,
        subphases: phase.subphases.map((subphase) => ({
          ...subphase,
          tasks: subphase.tasks.map((task) => ({
            ...task,
            title: task.taskKey === 'task-1' ? 'Переименованная задача' : task.title,
            durationDays: 2,
            dependsOn: [],
          })),
        })),
      })),
    };

    const schedulingVerdict = evaluateSchedulingQuality(structure, scheduled, {
      projectType: scheduled.projectType,
      assumptions: scheduled.assumptions,
      nodes: [
        { nodeKey: 'phase-shell', title: 'Инженерное оснащение и контур здания', kind: 'phase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'subphase-shell', title: 'Контур', parentNodeKey: 'phase-shell', kind: 'subphase', durationDays: 1, dependsOn: [] },
        { nodeKey: 'task-1', title: 'Переименованная задача', parentNodeKey: 'subphase-shell', kind: 'task', durationDays: 2, dependsOn: [] },
      ],
    });

    assert.ok(schedulingVerdict.reasons.includes('titles_changed'));
  });

  it('flags partial-scope plans that leak out-of-scope section identifiers', () => {
    const normalizedRequest = normalizeInitialRequest('график передачи конструкций подвала секции 5.1-5.4');
    const classification = classifyInitialRequest(normalizedRequest);
    const clarificationDecision = decideInitialClarification(normalizedRequest, classification);
    const domainSkeleton = assembleDomainSkeleton({
      normalizedRequest,
      classification,
      clarificationDecision,
    });
    const brief = buildGenerationBrief({
      userMessage: normalizedRequest.normalizedRequest,
      normalizedRequest,
      classification,
      clarificationDecision,
      domainSkeleton,
    });

    const verdict = evaluateStructureQuality({
      projectType: 'residential_multi_section',
      assumptions: [],
      phases: [
        {
          phaseKey: 'phase-fragment',
          title: 'Локальный фрагмент',
          subphases: [
            {
              subphaseKey: 'subphase-fragment',
              title: 'Работы по секциям',
              tasks: [
                { taskKey: 'task-1', title: 'Возведение стен секции 5.1' },
                { taskKey: 'task-2', title: 'Устройство перекрытий секции 5.6' },
              ],
            },
          ],
        },
      ],
    }, {
      brief,
      userMessage: normalizedRequest.normalizedRequest,
      normalizedRequest,
      classification,
      domainSkeleton,
    });

    assert.ok(verdict.reasons.includes('scope_boundary_violation'));
  });
});

describe('initial-generation json response parsing', () => {
  it('extracts the first balanced JSON object from a noisy model response', () => {
    const parsed = parseModelJson(`Ниже корректный JSON.\n{"projectType":"private_house","assumptions":["a"],"phases":[]}\nГотово.`) as { projectType: string };

    assert.equal(parsed.projectType, 'private_house');
  });
});

describe('initial-generation planner', () => {
  it('builds a two-step whole-project plan and forbids structural edits in scheduling prompt', async () => {
    const prompts: Array<{ stage: string; model: string; prompt: string }> = [];
    const normalizedRequest = normalizeInitialRequest('График строительства жилого дома на 3 этажа + гараж');
    const classification = classifyInitialRequest(normalizedRequest);
    const clarificationDecision = decideInitialClarification(normalizedRequest, classification);
    const domainSkeleton = assembleDomainSkeleton({
      normalizedRequest,
      classification,
      clarificationDecision,
    });

    const result = await planInitialProject({
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
      brief: buildGenerationBrief({
        userMessage: 'График строительства жилого дома на 3 этажа + гараж',
        normalizedRequest,
        classification,
        clarificationDecision,
        domainSkeleton,
      }),
      normalizedRequest,
      classification,
      clarificationDecision,
      domainSkeleton,
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage, prompt, model }) => {
        prompts.push({ stage, prompt, model });

        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: ['Жилой дом с гаражом'],
            phases: [
              {
                phaseKey: 'phase-site',
                title: 'Подготовка участка',
                subphases: [
                  {
                    subphaseKey: 'subphase-site-layout',
                    title: 'Организация площадки',
                    tasks: [
                      { taskKey: 'task-survey', title: 'Геодезическая разбивка' },
                      { taskKey: 'task-fence', title: 'Ограждение площадки' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-site-access',
                    title: 'Временная инфраструктура',
                    tasks: [
                      { taskKey: 'task-roads', title: 'Временные дороги' },
                      { taskKey: 'task-camp', title: 'Бытовой городок' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-foundation',
                title: 'Нулевой цикл',
                subphases: [
                  {
                    subphaseKey: 'subphase-earthworks',
                    title: 'Земляные работы',
                    tasks: [
                      { taskKey: 'task-pit', title: 'Разработка котлована' },
                      { taskKey: 'task-base', title: 'Подготовка основания' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-concrete',
                    title: 'Фундамент',
                    tasks: [
                      { taskKey: 'task-rebar', title: 'Армирование фундамента' },
                      { taskKey: 'task-concrete', title: 'Бетонирование фундамента' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-shell',
                title: 'Коробка дома',
                subphases: [
                  {
                    subphaseKey: 'subphase-house',
                    title: 'Надземная часть',
                    tasks: [
                      { taskKey: 'task-walls', title: 'Возведение стен' },
                      { taskKey: 'task-slabs', title: 'Устройство перекрытий' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-garage',
                    title: 'Гараж и кровля',
                    tasks: [
                      { taskKey: 'task-garage', title: 'Возведение гаража' },
                      { taskKey: 'task-roof', title: 'Монтаж кровли' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-finish',
                title: 'Внутренние работы',
                subphases: [
                  {
                    subphaseKey: 'subphase-mep',
                    title: 'Инженерные системы',
                    tasks: [
                      { taskKey: 'task-mep-rough', title: 'Черновой монтаж инженерии' },
                      { taskKey: 'task-mep-final', title: 'Чистовой монтаж инженерии' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-finish',
                    title: 'Отделка и сдача',
                    tasks: [
                      { taskKey: 'task-finish', title: 'Чистовая отделка' },
                      { taskKey: 'task-handover', title: 'Подготовка к сдаче' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'private_residential_house',
          assumptions: ['Жилой дом с гаражом'],
          phases: [
            {
              phaseKey: 'phase-site',
              title: 'Подготовка участка',
              subphases: [
                {
                  subphaseKey: 'subphase-site-layout',
                  title: 'Организация площадки',
                  tasks: [
                    { taskKey: 'task-survey', title: 'Геодезическая разбивка', durationDays: 2, dependsOn: [] },
                    { taskKey: 'task-fence', title: 'Ограждение площадки', durationDays: 3, dependsOn: [{ nodeKey: 'task-survey', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-site-access',
                  title: 'Временная инфраструктура',
                  tasks: [
                    { taskKey: 'task-roads', title: 'Временные дороги', durationDays: 3, dependsOn: [{ nodeKey: 'task-fence', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-camp', title: 'Бытовой городок', durationDays: 2, dependsOn: [{ nodeKey: 'task-roads', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-foundation',
              title: 'Нулевой цикл',
              subphases: [
                {
                  subphaseKey: 'subphase-earthworks',
                  title: 'Земляные работы',
                  tasks: [
                    { taskKey: 'task-pit', title: 'Разработка котлована', durationDays: 4, dependsOn: [{ nodeKey: 'task-camp', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-base', title: 'Подготовка основания', durationDays: 2, dependsOn: [{ nodeKey: 'task-pit', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-concrete',
                  title: 'Фундамент',
                  tasks: [
                    { taskKey: 'task-rebar', title: 'Армирование фундамента', durationDays: 3, dependsOn: [{ nodeKey: 'task-base', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-concrete', title: 'Бетонирование фундамента', durationDays: 3, dependsOn: [{ nodeKey: 'task-rebar', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-shell',
              title: 'Коробка дома',
              subphases: [
                {
                  subphaseKey: 'subphase-house',
                  title: 'Надземная часть',
                  tasks: [
                    { taskKey: 'task-walls', title: 'Возведение стен', durationDays: 7, dependsOn: [{ nodeKey: 'task-concrete', type: 'FS', lagDays: 1 }] },
                    { taskKey: 'task-slabs', title: 'Устройство перекрытий', durationDays: 5, dependsOn: [{ nodeKey: 'task-walls', type: 'SS', lagDays: 2 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-garage',
                  title: 'Гараж и кровля',
                  tasks: [
                    { taskKey: 'task-garage', title: 'Возведение гаража', durationDays: 4, dependsOn: [{ nodeKey: 'task-walls', type: 'SS', lagDays: 1 }] },
                    { taskKey: 'task-roof', title: 'Монтаж кровли', durationDays: 4, dependsOn: [{ nodeKey: 'task-slabs', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-finish',
              title: 'Внутренние работы',
              subphases: [
                {
                  subphaseKey: 'subphase-mep',
                  title: 'Инженерные системы',
                  tasks: [
                    { taskKey: 'task-mep-rough', title: 'Черновой монтаж инженерии', durationDays: 5, dependsOn: [{ nodeKey: 'task-roof', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-mep-final', title: 'Чистовой монтаж инженерии', durationDays: 4, dependsOn: [{ nodeKey: 'task-mep-rough', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-finish',
                  title: 'Отделка и сдача',
                  tasks: [
                    { taskKey: 'task-finish', title: 'Чистовая отделка', durationDays: 6, dependsOn: [{ nodeKey: 'task-mep-final', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-handover', title: 'Подготовка к сдаче', durationDays: 2, dependsOn: [{ nodeKey: 'task-finish', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    assert.equal(result.structureVerdict.accepted, true);
    assert.equal(result.schedulingVerdict.accepted, true);
    assert.equal(result.plan.nodes.filter((node) => node.kind === 'phase').length, 4);
    assert.equal(result.plan.nodes.filter((node) => node.kind === 'subphase').length, 8);
    assert.equal(result.plan.nodes.filter((node) => node.kind === 'task').length, 16);
    assert.deepEqual(prompts.map(({ stage }) => stage), ['structure_planning', 'schedule_metadata']);
    assert.equal(prompts[0]?.model, 'gpt-strong');
    assert.equal(prompts[1]?.model, 'gpt-cheap');
    assert.match(prompts[0]?.prompt ?? '', /Do not output durationDays/i);
    assert.match(prompts[0]?.prompt ?? '', /Do not optimize for fewer phases/i);
    assert.match(prompts[0]?.prompt ?? '', /Good top-level titles/i);
    assert.match(prompts[0]?.prompt ?? '', /Each task title must describe exactly one construction operation/i);
    assert.match(prompts[0]?.prompt ?? '', /Task-level compound formulations are forbidden/i);
    assert.match(prompts[0]?.prompt ?? '', /If the request implies a specialized facility, preserve the major functional workstreams/i);
    assert.match(prompts[0]?.prompt ?? '', /Planning mode: whole_project_bootstrap/i);
    assert.match(prompts[0]?.prompt ?? '', /Domain skeleton stages:/i);
    assert.match(prompts[0]?.prompt ?? '', /Rule pack mandatory families:/i);
    assert.match(prompts[1]?.prompt ?? '', /Do not create, delete, rename, merge, split, or move nodes/i);
    assert.match(prompts[1]?.prompt ?? '', /Each dependency object must have exactly this shape/i);
  });

  it('repairs structure once before moving to scheduling', async () => {
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'График строительства частного дома',
      brief: buildGenerationBrief({
        userMessage: 'График строительства частного дома',
      }),
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage }) => {
        calls += 1;

        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-1',
                title: 'Этап 1',
                subphases: [
                  {
                    subphaseKey: 'subphase-1',
                    title: 'Подэтап 1',
                    tasks: [{ taskKey: 'task-1', title: 'Задача 1' }],
                  },
                ],
              },
            ],
          });
        }

        if (stage === 'structure_planning_repair') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-prep',
                title: 'Подготовка участка',
                subphases: [
                  {
                    subphaseKey: 'subphase-prep-layout',
                    title: 'Разбивка и ограждение',
                    tasks: [
                      { taskKey: 'task-layout', title: 'Геодезическая разбивка' },
                      { taskKey: 'task-fence', title: 'Монтаж ограждения' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-prep-temp',
                    title: 'Временная инфраструктура',
                    tasks: [
                      { taskKey: 'task-road', title: 'Временные подъезды' },
                      { taskKey: 'task-camp', title: 'Бытовой городок' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-foundation',
                title: 'Фундамент',
                subphases: [
                  {
                    subphaseKey: 'subphase-foundation-earth',
                    title: 'Земляные работы',
                    tasks: [
                      { taskKey: 'task-pit', title: 'Котлован' },
                      { taskKey: 'task-base', title: 'Подготовка основания' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-foundation-concrete',
                    title: 'Бетонные работы',
                    tasks: [
                      { taskKey: 'task-rebar', title: 'Армирование' },
                      { taskKey: 'task-concrete', title: 'Бетонирование' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-shell',
                title: 'Коробка дома',
                subphases: [
                  {
                    subphaseKey: 'subphase-shell-walls',
                    title: 'Стены и перекрытия',
                    tasks: [
                      { taskKey: 'task-walls', title: 'Стены' },
                      { taskKey: 'task-slabs', title: 'Перекрытия' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-shell-roof',
                    title: 'Кровля',
                    tasks: [
                      { taskKey: 'task-roof-frame', title: 'Стропильная система' },
                      { taskKey: 'task-roof-cover', title: 'Кровельное покрытие' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-finish',
                title: 'Внутренние работы',
                subphases: [
                  {
                    subphaseKey: 'subphase-finish-mep',
                    title: 'Инженерные системы',
                    tasks: [
                      { taskKey: 'task-mep-rough', title: 'Черновая инженерия' },
                      { taskKey: 'task-mep-final', title: 'Чистовая инженерия' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-finish-interior',
                    title: 'Отделка',
                    tasks: [
                      { taskKey: 'task-finish-rough', title: 'Черновая отделка' },
                      { taskKey: 'task-finish-final', title: 'Чистовая отделка' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'private_residential_house',
          assumptions: [],
          phases: [
            {
              phaseKey: 'phase-prep',
              title: 'Подготовка участка',
              subphases: [
                {
                  subphaseKey: 'subphase-prep-layout',
                  title: 'Разбивка и ограждение',
                  tasks: [
                    { taskKey: 'task-layout', title: 'Геодезическая разбивка', durationDays: 1, dependsOn: [] },
                    { taskKey: 'task-fence', title: 'Монтаж ограждения', durationDays: 2, dependsOn: [{ nodeKey: 'task-layout', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-prep-temp',
                  title: 'Временная инфраструктура',
                  tasks: [
                    { taskKey: 'task-road', title: 'Временные подъезды', durationDays: 2, dependsOn: [{ nodeKey: 'task-fence', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-camp', title: 'Бытовой городок', durationDays: 2, dependsOn: [{ nodeKey: 'task-road', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-foundation',
              title: 'Фундамент',
              subphases: [
                {
                  subphaseKey: 'subphase-foundation-earth',
                  title: 'Земляные работы',
                  tasks: [
                    { taskKey: 'task-pit', title: 'Котлован', durationDays: 3, dependsOn: [{ nodeKey: 'task-camp', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-base', title: 'Подготовка основания', durationDays: 2, dependsOn: [{ nodeKey: 'task-pit', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-foundation-concrete',
                  title: 'Бетонные работы',
                  tasks: [
                    { taskKey: 'task-rebar', title: 'Армирование', durationDays: 2, dependsOn: [{ nodeKey: 'task-base', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-concrete', title: 'Бетонирование', durationDays: 2, dependsOn: [{ nodeKey: 'task-rebar', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-shell',
              title: 'Коробка дома',
              subphases: [
                {
                  subphaseKey: 'subphase-shell-walls',
                  title: 'Стены и перекрытия',
                  tasks: [
                    { taskKey: 'task-walls', title: 'Стены', durationDays: 5, dependsOn: [{ nodeKey: 'task-concrete', type: 'FS', lagDays: 1 }] },
                    { taskKey: 'task-slabs', title: 'Перекрытия', durationDays: 3, dependsOn: [{ nodeKey: 'task-walls', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-shell-roof',
                  title: 'Кровля',
                  tasks: [
                    { taskKey: 'task-roof-frame', title: 'Стропильная система', durationDays: 3, dependsOn: [{ nodeKey: 'task-slabs', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-roof-cover', title: 'Кровельное покрытие', durationDays: 3, dependsOn: [{ nodeKey: 'task-roof-frame', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-finish',
              title: 'Внутренние работы',
              subphases: [
                {
                  subphaseKey: 'subphase-finish-mep',
                  title: 'Инженерные системы',
                  tasks: [
                    { taskKey: 'task-mep-rough', title: 'Черновая инженерия', durationDays: 4, dependsOn: [{ nodeKey: 'task-roof-cover', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-mep-final', title: 'Чистовая инженерия', durationDays: 2, dependsOn: [{ nodeKey: 'task-mep-rough', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-finish-interior',
                  title: 'Отделка',
                  tasks: [
                    { taskKey: 'task-finish-rough', title: 'Черновая отделка', durationDays: 4, dependsOn: [{ nodeKey: 'task-mep-final', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-finish-final', title: 'Чистовая отделка', durationDays: 3, dependsOn: [{ nodeKey: 'task-finish-rough', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    assert.equal(result.repairAttempted, true);
    assert.equal(result.structureVerdict.accepted, true);
    assert.equal(result.schedulingVerdict.accepted, true);
    assert.equal(calls, 3);
  });

  it('drops malformed scheduling dependencies instead of failing the whole graph', async () => {
    const result = await planInitialProject({
      userMessage: 'График строительства детского сада на 3 этажа',
      brief: buildGenerationBrief({
        userMessage: 'График строительства детского сада на 3 этажа',
      }),
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'kindergarten',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-a',
                title: 'Подготовка',
                subphases: [
                  {
                    subphaseKey: 'subphase-a1',
                    title: 'Подготовка площадки',
                    tasks: [
                      { taskKey: 'T-01.1.1', title: 'Ограждение площадки' },
                      { taskKey: 'T-01.1.2', title: 'Временные сети' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-a2',
                    title: 'Разбивка',
                    tasks: [
                      { taskKey: 'T-01.2.1', title: 'Вынос осей' },
                      { taskKey: 'T-01.2.2', title: 'Подготовка котлована' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-b',
                title: 'Нулевой цикл',
                subphases: [
                  {
                    subphaseKey: 'subphase-b1',
                    title: 'Основание',
                    tasks: [
                      { taskKey: 'T-02.1.1', title: 'Подготовка основания' },
                      { taskKey: 'T-02.1.2', title: 'Армирование' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-b2',
                    title: 'Фундамент',
                    tasks: [
                      { taskKey: 'T-02.2.1', title: 'Бетонирование' },
                      { taskKey: 'T-02.2.2', title: 'Гидроизоляция' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-c',
                title: 'Каркас',
                subphases: [
                  {
                    subphaseKey: 'subphase-c1',
                    title: 'Нижние этажи',
                    tasks: [
                      { taskKey: 'T-03.1.1', title: 'Первый этаж' },
                      { taskKey: 'T-03.1.2', title: 'Второй этаж' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-c2',
                    title: 'Верхний этаж',
                    tasks: [
                      { taskKey: 'T-03.2.1', title: 'Третий этаж' },
                      { taskKey: 'T-03.2.2', title: 'Перекрытие' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-d',
                title: 'Внутренние работы',
                subphases: [
                  {
                    subphaseKey: 'subphase-d1',
                    title: 'Инженерия',
                    tasks: [
                      { taskKey: 'T-04.1.1', title: 'Электрика' },
                      { taskKey: 'T-04.1.2', title: 'Вентиляция' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-d2',
                    title: 'Отделка',
                    tasks: [
                      { taskKey: 'T-04.2.1', title: 'Штукатурка' },
                      { taskKey: 'T-04.2.2', title: 'Окраска' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'kindergarten',
          assumptions: [],
          phases: [
            {
              phaseKey: 'phase-a',
              title: 'Подготовка',
              subphases: [
                {
                  subphaseKey: 'subphase-a1',
                  title: 'Подготовка площадки',
                  tasks: [
                    { taskKey: 'T-01.1.1', title: 'Ограждение площадки', durationDays: 2, dependsOn: [] },
                    { taskKey: 'T-01.1.2', title: 'Временные сети', durationDays: 3, dependsOn: [{ type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    const malformedTask = result.plan.nodes.find((node) => node.nodeKey === 'T-01.1.2');
    assert.ok(malformedTask);
    assert.equal(malformedTask?.kind, 'task');
    assert.deepEqual(malformedTask?.dependsOn, []);
    assert.ok(result.plan.nodes.filter((node) => node.kind === 'task').length >= 2);
  });

  it('accepts scheduling dependencies referenced by taskKey', async () => {
    const result = await planInitialProject({
      userMessage: 'График строительства детского сада на 3 этажа',
      brief: buildGenerationBrief({
        userMessage: 'График строительства детского сада на 3 этажа',
      }),
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'kindergarten',
            assumptions: [],
            phases: [
              {
                phaseKey: 'phase-1',
                title: 'Подготовка',
                subphases: [
                  {
                    subphaseKey: 'subphase-1',
                    title: 'Организация площадки',
                    tasks: [
                      { taskKey: 'task-a', title: 'Ограждение площадки' },
                      { taskKey: 'task-b', title: 'Временные сети' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-2',
                    title: 'Разработка основания',
                    tasks: [
                      { taskKey: 'task-c', title: 'Разработка котлована' },
                      { taskKey: 'task-d', title: 'Подготовка основания' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-2',
                title: 'Коробка',
                subphases: [
                  {
                    subphaseKey: 'subphase-3',
                    title: 'Несущие конструкции',
                    tasks: [
                      { taskKey: 'task-e', title: 'Армирование фундамента' },
                      { taskKey: 'task-f', title: 'Бетонирование фундамента' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-4',
                    title: 'Надземная часть',
                    tasks: [
                      { taskKey: 'task-g', title: 'Возведение стен' },
                      { taskKey: 'task-h', title: 'Устройство перекрытий' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-3',
                title: 'Инженерия',
                subphases: [
                  {
                    subphaseKey: 'subphase-5',
                    title: 'Черновой монтаж',
                    tasks: [
                      { taskKey: 'task-i', title: 'Монтаж вентиляции' },
                      { taskKey: 'task-j', title: 'Монтаж электрики' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-6',
                    title: 'Чистовой монтаж',
                    tasks: [
                      { taskKey: 'task-k', title: 'Пусконаладка' },
                      { taskKey: 'task-l', title: 'Сдача систем' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'phase-4',
                title: 'Отделка',
                subphases: [
                  {
                    subphaseKey: 'subphase-7',
                    title: 'Черновая отделка',
                    tasks: [
                      { taskKey: 'task-m', title: 'Штукатурка стен' },
                      { taskKey: 'task-n', title: 'Стяжка пола' },
                    ],
                  },
                  {
                    subphaseKey: 'subphase-8',
                    title: 'Чистовая отделка',
                    tasks: [
                      { taskKey: 'task-o', title: 'Окраска стен' },
                      { taskKey: 'task-p', title: 'Укладка покрытия пола' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'kindergarten',
          assumptions: [],
          phases: [
            {
              phaseKey: 'phase-1',
              title: 'Подготовка',
              subphases: [
                {
                  subphaseKey: 'subphase-1',
                  title: 'Организация площадки',
                  tasks: [
                    { taskKey: 'task-a', title: 'Ограждение площадки', durationDays: 2, dependsOn: [] },
                    { taskKey: 'task-b', title: 'Временные сети', durationDays: 2, dependsOn: [{ taskKey: 'task-a', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-2',
                  title: 'Разработка основания',
                  tasks: [
                    { taskKey: 'task-c', title: 'Разработка котлована', durationDays: 3, dependsOn: [{ taskKey: 'task-b', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-d', title: 'Подготовка основания', durationDays: 2, dependsOn: [{ taskKey: 'task-c', type: 'FS', lagDays: 1 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-2',
              title: 'Коробка',
              subphases: [
                {
                  subphaseKey: 'subphase-3',
                  title: 'Несущие конструкции',
                  tasks: [
                    { taskKey: 'task-e', title: 'Армирование фундамента', durationDays: 2, dependsOn: [{ taskKey: 'task-d', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-f', title: 'Бетонирование фундамента', durationDays: 2, dependsOn: [{ taskKey: 'task-e', type: 'FS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-4',
                  title: 'Надземная часть',
                  tasks: [
                    { taskKey: 'task-g', title: 'Возведение стен', durationDays: 4, dependsOn: [{ taskKey: 'task-f', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-h', title: 'Устройство перекрытий', durationDays: 3, dependsOn: [{ taskKey: 'task-g', type: 'SS', lagDays: 1 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-3',
              title: 'Инженерия',
              subphases: [
                {
                  subphaseKey: 'subphase-5',
                  title: 'Черновой монтаж',
                  tasks: [
                    { taskKey: 'task-i', title: 'Монтаж вентиляции', durationDays: 3, dependsOn: [{ taskKey: 'task-h', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-j', title: 'Монтаж электрики', durationDays: 3, dependsOn: [{ taskKey: 'task-i', type: 'SS', lagDays: 0 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-6',
                  title: 'Чистовой монтаж',
                  tasks: [
                    { taskKey: 'task-k', title: 'Пусконаладка', durationDays: 2, dependsOn: [{ taskKey: 'task-j', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-l', title: 'Сдача систем', durationDays: 1, dependsOn: [{ taskKey: 'task-k', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'phase-4',
              title: 'Отделка',
              subphases: [
                {
                  subphaseKey: 'subphase-7',
                  title: 'Черновая отделка',
                  tasks: [
                    { taskKey: 'task-m', title: 'Штукатурка стен', durationDays: 4, dependsOn: [{ taskKey: 'task-l', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-n', title: 'Стяжка пола', durationDays: 3, dependsOn: [{ taskKey: 'task-m', type: 'SS', lagDays: 1 }] },
                  ],
                },
                {
                  subphaseKey: 'subphase-8',
                  title: 'Чистовая отделка',
                  tasks: [
                    { taskKey: 'task-o', title: 'Окраска стен', durationDays: 2, dependsOn: [{ taskKey: 'task-n', type: 'FS', lagDays: 0 }] },
                    { taskKey: 'task-p', title: 'Укладка покрытия пола', durationDays: 2, dependsOn: [{ taskKey: 'task-o', type: 'FS', lagDays: 0 }] },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    const taskB = result.scheduled.phases[0]?.subphases[0]?.tasks[1];
    assert.deepEqual(taskB?.dependsOn, [{ nodeKey: 'task-a', type: 'FS', lagDays: 0 }]);
    assert.equal(result.schedulingVerdict.metrics.dependencyCount > 0, true);
  });

  it('keeps nodeKey compatibility for scheduling dependencies', async () => {
    const result = await planInitialProject({
      userMessage: 'График строительства детского сада на 3 этажа',
      brief: buildGenerationBrief({
        userMessage: 'График строительства детского сада на 3 этажа',
      }),
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'kindergarten',
            assumptions: [],
            phases: Array.from({ length: 4 }, (_, phaseIndex) => ({
              phaseKey: `phase-${phaseIndex + 1}`,
              title: `Этап ${phaseIndex + 1} работ`,
              subphases: Array.from({ length: 2 }, (_, subphaseIndex) => ({
                subphaseKey: `subphase-${phaseIndex + 1}-${subphaseIndex + 1}`,
                title: `Подэтап ${phaseIndex + 1}.${subphaseIndex + 1} работ`,
                tasks: Array.from({ length: 2 }, (_, taskIndex) => {
                  const serial = phaseIndex * 4 + subphaseIndex * 2 + taskIndex + 1;
                  return {
                    taskKey: `task-${serial}`,
                    title: `Операция ${serial}`,
                  };
                }),
              })),
            })),
          });
        }

        const tasks = Array.from({ length: 16 }, (_, index) => ({
          taskKey: `task-${index + 1}`,
          title: `Операция ${index + 1}`,
          durationDays: 1 + (index % 3),
          dependsOn: index === 0 ? [] : [{ nodeKey: `task-${index}`, type: 'FS', lagDays: 0 }],
        }));

        return JSON.stringify({
          projectType: 'kindergarten',
          assumptions: [],
          phases: Array.from({ length: 4 }, (_, phaseIndex) => ({
            phaseKey: `phase-${phaseIndex + 1}`,
            title: `Этап ${phaseIndex + 1} работ`,
            subphases: Array.from({ length: 2 }, (_, subphaseIndex) => ({
              subphaseKey: `subphase-${phaseIndex + 1}-${subphaseIndex + 1}`,
              title: `Подэтап ${phaseIndex + 1}.${subphaseIndex + 1} работ`,
              tasks: tasks.slice((phaseIndex * 4) + (subphaseIndex * 2), (phaseIndex * 4) + (subphaseIndex * 2) + 2),
            })),
          })),
        });
      },
    });

    const task2 = result.scheduled.phases[0]?.subphases[0]?.tasks[1];
    assert.deepEqual(task2?.dependsOn, [{ nodeKey: 'task-1', type: 'FS', lagDays: 0 }]);
    assert.equal(result.schedulingVerdict.metrics.dependencyCount > 0, true);
  });

  it('accepts string shorthand scheduling dependencies from logs', async () => {
    const result = await planInitialProject({
      userMessage: 'График строительства загородного дома в 2 этажа',
      brief: buildGenerationBrief({
        userMessage: 'График строительства загородного дома в 2 этажа',
      }),
      structureModelDecision: { selectedModel: 'gpt-strong' },
      schedulingModelDecision: { selectedModel: 'gpt-cheap' },
      sdkQuery: async ({ stage }) => {
        if (stage === 'structure_planning') {
          return JSON.stringify({
            projectType: 'private_house',
            assumptions: [],
            phases: [
              {
                phaseKey: 'P01',
                title: 'Подготовка',
                subphases: [
                  {
                    subphaseKey: 'SP01.1',
                    title: 'Мобилизация',
                    tasks: [
                      { taskKey: 'T01.1.1', title: 'Установка ограждения' },
                      { taskKey: 'T01.1.2', title: 'Организация бытовки' },
                    ],
                  },
                  {
                    subphaseKey: 'SP01.2',
                    title: 'Земляные работы',
                    tasks: [
                      { taskKey: 'T01.2.1', title: 'Вынос осей' },
                      { taskKey: 'T01.2.2', title: 'Разработка котлована' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'P02',
                title: 'Фундамент',
                subphases: [
                  {
                    subphaseKey: 'SP02.1',
                    title: 'Основание',
                    tasks: [
                      { taskKey: 'T02.1.1', title: 'Песчаная подушка' },
                      { taskKey: 'T02.1.2', title: 'Уплотнение основания' },
                    ],
                  },
                  {
                    subphaseKey: 'SP02.2',
                    title: 'Бетонные работы',
                    tasks: [
                      { taskKey: 'T02.2.1', title: 'Монтаж опалубки' },
                      { taskKey: 'T02.2.2', title: 'Армирование фундамента' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'P03',
                title: 'Коробка',
                subphases: [
                  {
                    subphaseKey: 'SP03.1',
                    title: 'Первый этаж',
                    tasks: [
                      { taskKey: 'T03.1.1', title: 'Кладка стен первого этажа' },
                      { taskKey: 'T03.1.2', title: 'Армопояс первого этажа' },
                    ],
                  },
                  {
                    subphaseKey: 'SP03.2',
                    title: 'Перекрытие',
                    tasks: [
                      { taskKey: 'T03.2.1', title: 'Опалубка перекрытия' },
                      { taskKey: 'T03.2.2', title: 'Бетонирование перекрытия' },
                    ],
                  },
                ],
              },
              {
                phaseKey: 'P04',
                title: 'Кровля и отделка',
                subphases: [
                  {
                    subphaseKey: 'SP04.1',
                    title: 'Кровля',
                    tasks: [
                      { taskKey: 'T04.1.1', title: 'Монтаж стропильной системы' },
                      { taskKey: 'T04.1.2', title: 'Монтаж кровельного покрытия' },
                    ],
                  },
                  {
                    subphaseKey: 'SP04.2',
                    title: 'Отделка',
                    tasks: [
                      { taskKey: 'T04.2.1', title: 'Штукатурка стен' },
                      { taskKey: 'T04.2.2', title: 'Шпаклевание стен' },
                    ],
                  },
                ],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'private_house',
          assumptions: [],
          phases: [
            {
              phaseKey: 'P01',
              title: 'Подготовка',
              subphases: [
                {
                  subphaseKey: 'SP01.1',
                  title: 'Мобилизация',
                  tasks: [
                    { taskKey: 'T01.1.1', title: 'Установка ограждения', durationDays: 2, dependsOn: [] },
                    { taskKey: 'T01.1.2', title: 'Организация бытовки', durationDays: 2, dependsOn: ['T01.1.1FS'] },
                  ],
                },
                {
                  subphaseKey: 'SP01.2',
                  title: 'Земляные работы',
                  tasks: [
                    { taskKey: 'T01.2.1', title: 'Вынос осей', durationDays: 1, dependsOn: ['T01.1.1FS'] },
                    { taskKey: 'T01.2.2', title: 'Разработка котлована', durationDays: 4, dependsOn: ['T01.2.1FS'] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'P02',
              title: 'Фундамент',
              subphases: [
                {
                  subphaseKey: 'SP02.1',
                  title: 'Основание',
                  tasks: [
                    { taskKey: 'T02.1.1', title: 'Песчаная подушка', durationDays: 2, dependsOn: ['T01.2.2FS'] },
                    { taskKey: 'T02.1.2', title: 'Уплотнение основания', durationDays: 1, dependsOn: ['T02.1.1FS'] },
                  ],
                },
                {
                  subphaseKey: 'SP02.2',
                  title: 'Бетонные работы',
                  tasks: [
                    { taskKey: 'T02.2.1', title: 'Монтаж опалубки', durationDays: 2, dependsOn: ['T02.1.2FS'] },
                    { taskKey: 'T02.2.2', title: 'Армирование фундамента', durationDays: 3, dependsOn: ['T02.2.1FS+1'] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'P03',
              title: 'Коробка',
              subphases: [
                {
                  subphaseKey: 'SP03.1',
                  title: 'Первый этаж',
                  tasks: [
                    { taskKey: 'T03.1.1', title: 'Кладка стен первого этажа', durationDays: 5, dependsOn: ['T02.2.2FS'] },
                    { taskKey: 'T03.1.2', title: 'Армопояс первого этажа', durationDays: 2, dependsOn: ['T03.1.1FS'] },
                  ],
                },
                {
                  subphaseKey: 'SP03.2',
                  title: 'Перекрытие',
                  tasks: [
                    { taskKey: 'T03.2.1', title: 'Опалубка перекрытия', durationDays: 2, dependsOn: ['T03.1.2FS'] },
                    { taskKey: 'T03.2.2', title: 'Бетонирование перекрытия', durationDays: 1, dependsOn: ['T03.2.1FS'] },
                  ],
                },
              ],
            },
            {
              phaseKey: 'P04',
              title: 'Кровля и отделка',
              subphases: [
                {
                  subphaseKey: 'SP04.1',
                  title: 'Кровля',
                  tasks: [
                    { taskKey: 'T04.1.1', title: 'Монтаж стропильной системы', durationDays: 3, dependsOn: ['T03.2.2FS'] },
                    { taskKey: 'T04.1.2', title: 'Монтаж кровельного покрытия', durationDays: 2, dependsOn: ['T04.1.1FS'] },
                  ],
                },
                {
                  subphaseKey: 'SP04.2',
                  title: 'Отделка',
                  tasks: [
                    { taskKey: 'T04.2.1', title: 'Штукатурка стен', durationDays: 4, dependsOn: ['T04.1.2FS'] },
                    { taskKey: 'T04.2.2', title: 'Шпаклевание стен', durationDays: 3, dependsOn: ['T04.2.1FF-1'] },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    assert.deepEqual(result.scheduled.phases[0]?.subphases[0]?.tasks[1]?.dependsOn, [
      { nodeKey: 'T01.1.1', type: 'FS', lagDays: 0 },
    ]);
    assert.deepEqual(result.scheduled.phases[1]?.subphases[1]?.tasks[1]?.dependsOn, [
      { nodeKey: 'T02.2.1', type: 'FS', lagDays: 1 },
    ]);
    assert.deepEqual(result.scheduled.phases[3]?.subphases[1]?.tasks[1]?.dependsOn, [
      { nodeKey: 'T04.2.1', type: 'FF', lagDays: -1 },
    ]);
    assert.equal(result.schedulingVerdict.metrics.dependencyCount > 0, true);
  });
});
