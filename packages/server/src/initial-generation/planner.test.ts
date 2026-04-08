import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGenerationBrief } from './brief.js';
import { resolveDomainReference } from './domain-reference.js';
import { parseModelJson } from './json-response.js';
import { planInitialProject } from './planner.js';
import {
  evaluateSchedulingQuality,
  evaluateStructureQuality,
} from './quality-gate.js';

describe('initial-generation domain reference', () => {
  it('injects the kindergarten reference for детского садика prompts', () => {
    const reference = resolveDomainReference({
      userMessage: 'Построй график строительства детского садика',
    });

    assert.equal(reference.referenceKey, 'kindergarten');
    assert.equal(reference.projectType, 'kindergarten');
    assert.equal(reference.defaultInterpretation, null);
    assert.match(reference.domainContextSummary, /детск/i);
  });

  it('uses the private-house generic fallback for broad prompts like Построй график', () => {
    const reference = resolveDomainReference({
      userMessage: 'Построй график',
    });

    assert.equal(reference.referenceKey, 'construction');
    assert.equal(reference.projectType, 'construction');
    assert.equal(reference.defaultInterpretation, 'private_residential_house');
  });
});

describe('initial-generation quality gate', () => {
  it('flags weak structures with placeholder titles and poor coverage', () => {
    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
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
      reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
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

    const result = await planInitialProject({
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
      brief: buildGenerationBrief({
        userMessage: 'График строительства жилого дома на 3 этажа + гараж',
        reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
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
    assert.match(prompts[0]?.prompt ?? '', /kindergarten/i);
    assert.match(prompts[1]?.prompt ?? '', /Do not create, delete, rename, merge, split, or move nodes/i);
  });

  it('repairs structure once before moving to scheduling', async () => {
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'График строительства частного дома',
      brief: buildGenerationBrief({
        userMessage: 'График строительства частного дома',
        reference: resolveDomainReference({ userMessage: 'График строительства частного дома' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства частного дома' }),
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
        reference: resolveDomainReference({ userMessage: 'График строительства детского сада на 3 этажа' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства детского сада на 3 этажа' }),
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
});
