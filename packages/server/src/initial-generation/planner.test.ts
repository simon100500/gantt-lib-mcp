import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGenerationBrief } from './brief.js';
import { resolveDomainReference } from './domain-reference.js';
import { planInitialProject } from './planner.js';
import { evaluateProjectPlanQuality } from './quality-gate.js';

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

  it('injects the office renovation reference for ремонта офиса prompts', () => {
    const reference = resolveDomainReference({
      userMessage: 'Построй график ремонта офиса 300 м2',
    });

    assert.equal(reference.referenceKey, 'office_renovation');
    assert.equal(reference.projectType, 'office_renovation');
    assert.match(reference.domainContextSummary, /офис/i);
    assert.match(reference.domainContextSummary, /300/);
  });

  it('uses the private-house generic fallback for broad prompts like Построй график', () => {
    const reference = resolveDomainReference({
      userMessage: 'Построй график',
    });

    assert.equal(reference.referenceKey, 'construction');
    assert.equal(reference.projectType, 'construction');
    assert.equal(reference.defaultInterpretation, 'private_residential_house');
    assert.match(reference.domainContextSummary, /частн/i);
  });
});

describe('initial-generation brief', () => {
  it('requires a full starter schedule and forbids filler naming', () => {
    const reference = resolveDomainReference({
      userMessage: 'Построй график',
    });

    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
      reference,
    });

    assert.equal(brief.objectType, 'private_residential_house');
    assert.match(brief.starterScheduleExpectation, /full starter schedule/i);
    assert.match(brief.starterScheduleExpectation, /baseline/i);
    assert.match(brief.namingBan, /Этап 1/);
    assert.match(brief.namingBan, /Task 3/);
    assert.match(brief.domainContextSummary, /частн/i);
    assert.match(brief.serverInferencePolicy, /infer/i);
    assert.ok(brief.scopeSignals.length >= 1);
  });
});

describe('initial-generation quality gate', () => {
  it('flags missing hierarchy, placeholder titles, weak coverage, weak dependency graph, and weak cross-phase sequencing', () => {
    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
    });

    const verdict = evaluateProjectPlanQuality({
      projectType: 'private_residential_house',
      assumptions: [],
      nodes: [
        {
          nodeKey: 'phase-1',
          title: 'Этап 1',
          kind: 'phase',
          durationDays: 5,
          dependsOn: [],
        },
        {
          nodeKey: 'phase-2',
          title: 'Stage 2',
          kind: 'phase',
          durationDays: 5,
          dependsOn: [],
        },
      ],
    }, brief);

    assert.equal(verdict.accepted, false);
    assert.deepEqual(verdict.reasons, [
      'missing_hierarchy',
      'placeholder_titles',
      'weak_coverage',
      'weak_sequence',
      'too_few_phases',
      'too_few_tasks',
      'missing_dependency_graph',
      'weak_cross_phase_sequence',
      'weak_subject_specificity',
    ]);
  });
});

describe('initial-generation planner', () => {
  it('rejects duplicate nodeKey values during schema validation', async () => {
    await assert.rejects(
      planInitialProject({
        userMessage: 'Построй график',
        brief: buildGenerationBrief({
          userMessage: 'Построй график',
          reference: resolveDomainReference({ userMessage: 'Построй график' }),
        }),
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
        modelDecision: { selectedModel: 'gpt-strong' },
        sdkQuery: async () =>
          JSON.stringify({
            projectType: 'private_residential_house',
            nodes: [
              {
                nodeKey: 'phase-1',
                title: 'Подготовка',
                kind: 'phase',
                durationDays: 5,
                dependsOn: [],
              },
              {
                nodeKey: 'phase-1',
                title: 'Фундамент',
                parentNodeKey: 'phase-1',
                kind: 'task',
                durationDays: 5,
                dependsOn: [],
              },
            ],
          }),
      }),
      /duplicate nodeKey/i,
    );
  });

  it('rejects top-level task nodes during schema validation', async () => {
    await assert.rejects(
      planInitialProject({
        userMessage: 'Построй график',
        brief: buildGenerationBrief({
          userMessage: 'Построй график',
          reference: resolveDomainReference({ userMessage: 'Построй график' }),
        }),
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
        modelDecision: { selectedModel: 'gpt-strong' },
        sdkQuery: async () =>
          JSON.stringify({
            projectType: 'private_residential_house',
            nodes: [
              {
                nodeKey: 'task-1',
                title: 'Фундамент',
                kind: 'task',
                durationDays: 5,
                dependsOn: [],
              },
            ],
          }),
      }),
      /top-level task/i,
    );
  });

  it('rejects placeholder titles during schema validation', async () => {
    await assert.rejects(
      planInitialProject({
        userMessage: 'Построй график',
        brief: buildGenerationBrief({
          userMessage: 'Построй график',
          reference: resolveDomainReference({ userMessage: 'Построй график' }),
        }),
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
        modelDecision: { selectedModel: 'gpt-strong' },
        sdkQuery: async () =>
          JSON.stringify({
            projectType: 'private_residential_house',
            nodes: [
              {
                nodeKey: 'phase-1',
                title: 'Подготовка',
                kind: 'phase',
                durationDays: 5,
                dependsOn: [],
              },
              {
                nodeKey: 'task-1',
                title: 'Задача 2',
                parentNodeKey: 'phase-1',
                kind: 'task',
                durationDays: 5,
                dependsOn: [],
              },
            ],
          }),
      }),
      /placeholder/i,
    );
  });

  it('rejects broken dependency references during schema validation', async () => {
    await assert.rejects(
      planInitialProject({
        userMessage: 'Построй график',
        brief: buildGenerationBrief({
          userMessage: 'Построй график',
          reference: resolveDomainReference({ userMessage: 'Построй график' }),
        }),
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
        modelDecision: { selectedModel: 'gpt-strong' },
        sdkQuery: async () =>
          JSON.stringify({
            projectType: 'private_residential_house',
            nodes: [
              {
                nodeKey: 'phase-1',
                title: 'Подготовка',
                kind: 'phase',
                durationDays: 5,
                dependsOn: [],
              },
              {
                nodeKey: 'task-1',
                title: 'Фундамент',
                parentNodeKey: 'phase-1',
                kind: 'task',
                durationDays: 5,
                dependsOn: [{ nodeKey: 'missing-task' }],
              },
            ],
          }),
      }),
      /dependency reference/i,
    );
  });

  it('normalizes loose planner payloads that use id/name/type aliases and nested phase tasks', async () => {
    const result = await planInitialProject({
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
      brief: buildGenerationBrief({
        userMessage: 'График строительства жилого дома на 3 этажа + гараж',
        reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async () =>
        JSON.stringify({
          projectType: 'private_house',
          phases: [
            {
              id: 'site-prep',
              name: 'Подготовка участка',
              type: 'phase',
              tasks: [
                { id: 'survey', name: 'Геодезическая разбивка', type: 'task', duration: 2 },
                { name: 'Временные дороги и ограждение', type: 'task', duration: 3, dependencies: ['survey'] },
              ],
            },
            {
              id: 'foundation',
              name: 'Фундамент',
              type: 'phase',
              tasks: [
                { id: 'pit', name: 'Разработка котлована', type: 'task', duration: 4, dependencies: ['survey'] },
                { id: 'concrete', name: 'Бетонирование фундамента', type: 'task', duration: 5, dependencies: [{ predecessorId: 'pit', lag: 1 }] },
              ],
            },
            {
              id: 'shell',
              name: 'Коробка дома и гаража',
              type: 'phase',
              tasks: [
                { id: 'house-frame', name: 'Возведение коробки дома', type: 'task', duration: 10, dependencies: ['concrete'] },
                { id: 'garage-frame', name: 'Возведение коробки гаража', type: 'task', duration: 6, dependencies: [{ predecessorId: 'concrete', type: 'SS', lag: 2 }] },
              ],
            },
            {
              id: 'finish',
              name: 'Инженерия и отделка',
              type: 'phase',
              tasks: [
                { id: 'mep', name: 'Монтаж инженерных систем', type: 'task', duration: 7, dependencies: [{ predecessorId: 'house-frame', type: 'SS', lag: 1 }] },
                { id: 'handover', name: 'Отделка и сдача', type: 'task', duration: 6, dependencies: ['mep', 'garage-frame'] },
              ],
            },
          ],
        }),
    });

    assert.equal(result.verdict.accepted, true);
    assert.equal(result.plan.nodes.some((node) => node.nodeKey === 'survey'), true);
    assert.equal(result.plan.nodes.some((node) => node.parentNodeKey === 'site-prep'), true);
    assert.deepEqual(result.plan.nodes.find((node) => node.nodeKey === 'concrete')?.dependsOn[0], {
      nodeKey: 'pit',
      type: 'FS',
      lagDays: 1,
    });
  });

  it('accepts strong plans on the first planning call and normalizes defaults', async () => {
    const prompts: string[] = [];
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'Построй график строительства частного дома из газобетона',
      brief: buildGenerationBrief({
        userMessage: 'Построй график строительства частного дома из газобетона',
        reference: resolveDomainReference({
          userMessage: 'Построй график строительства частного дома из газобетона',
        }),
      }),
      reference: resolveDomainReference({
        userMessage: 'Построй график строительства частного дома из газобетона',
      }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async ({ prompt }) => {
        calls += 1;
        prompts.push(prompt);
        return JSON.stringify({
          projectType: 'private_residential_house',
          nodes: [
            {
              nodeKey: 'phase-prep',
              title: 'Подготовка участка',
              kind: 'phase',
              durationDays: 7,
            },
            {
              nodeKey: 'task-permits',
              title: 'Получение разрешений',
              parentNodeKey: 'phase-prep',
              kind: 'task',
              durationDays: 5,
              dependsOn: [],
            },
            {
              nodeKey: 'task-site',
              title: 'Организация площадки',
              parentNodeKey: 'phase-prep',
              kind: 'task',
              durationDays: 4,
              dependsOn: [{ nodeKey: 'task-permits' }],
            },
            {
              nodeKey: 'task-foundation',
              title: 'Устройство фундамента',
              parentNodeKey: 'phase-foundation',
              kind: 'task',
              durationDays: 8,
              dependsOn: [{ nodeKey: 'task-site', type: 'FS' }],
            },
            {
              nodeKey: 'phase-foundation',
              title: 'Фундамент и подземная часть',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-waterproofing',
              title: 'Гидроизоляция и обратная засыпка',
              parentNodeKey: 'phase-foundation',
              kind: 'task',
              durationDays: 4,
              dependsOn: [{ nodeKey: 'task-foundation', type: 'FS' }],
            },
            {
              nodeKey: 'phase-shell',
              title: 'Коробка дома',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-walls',
              title: 'Кладка стен из газобетона',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 10,
              dependsOn: [{ nodeKey: 'task-foundation', type: 'FS' }],
            },
            {
              nodeKey: 'task-roof',
              title: 'Монтаж кровли',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 8,
              dependsOn: [{ nodeKey: 'task-walls', type: 'FS' }],
            },
            {
              nodeKey: 'phase-mep',
              title: 'Инженерные системы',
              kind: 'phase',
              durationDays: 12,
              dependsOn: [],
            },
            {
              nodeKey: 'task-mep',
              title: 'Черновой монтаж инженерных сетей',
              parentNodeKey: 'phase-mep',
              kind: 'task',
              durationDays: 7,
              dependsOn: [{ nodeKey: 'task-walls', type: 'SS' }],
            },
            {
              nodeKey: 'phase-finish',
              title: 'Отделка и сдача',
              kind: 'phase',
              durationDays: 10,
              dependsOn: [],
            },
            {
              nodeKey: 'task-finishing',
              title: 'Черновая и чистовая отделка',
              parentNodeKey: 'phase-finish',
              kind: 'task',
              durationDays: 9,
              dependsOn: [{ nodeKey: 'task-mep', type: 'FS' }],
            },
            {
              nodeKey: 'task-handover',
              title: 'Пусконаладка и сдача дома',
              parentNodeKey: 'phase-finish',
              kind: 'task',
              durationDays: 3,
              dependsOn: [{ nodeKey: 'task-finishing', type: 'FS' }],
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.verdict.accepted, true);
    assert.equal(result.repairAttempted, false);
    assert.deepEqual(result.plan.assumptions, []);
    assert.deepEqual(result.plan.nodes.find((node) => node.nodeKey === 'task-foundation')?.dependsOn[0], {
      nodeKey: 'task-site',
      type: 'FS',
      lagDays: 0,
    });
    assert.match(prompts[0] ?? '', /ProjectPlan JSON only/);
    assert.match(prompts[0] ?? '', /gasobeton|газобетон/i);
  });

  it('repairs a weak plan once and returns the repaired result', async () => {
    const prompts: string[] = [];
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'Построй график',
      brief: buildGenerationBrief({
        userMessage: 'Построй график',
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
      }),
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async ({ prompt }) => {
        calls += 1;
        prompts.push(prompt);

        if (calls === 1) {
          return JSON.stringify({
            projectType: 'private_residential_house',
            nodes: [
              {
                nodeKey: 'phase-1',
                title: 'Подготовка',
                kind: 'phase',
                durationDays: 5,
                dependsOn: [],
              },
              {
                nodeKey: 'phase-2',
                title: 'Строительство',
                kind: 'phase',
                durationDays: 5,
                dependsOn: [],
              },
            ],
          });
        }

        return JSON.stringify({
          projectType: 'private_residential_house',
          assumptions: ['Базовый частный дом'],
          nodes: [
            {
              nodeKey: 'phase-prep',
              title: 'Подготовка участка',
              kind: 'phase',
              durationDays: 7,
              dependsOn: [],
            },
            {
              nodeKey: 'task-permits',
              title: 'Получение разрешений',
              parentNodeKey: 'phase-prep',
              kind: 'task',
              durationDays: 5,
              dependsOn: [],
            },
            {
              nodeKey: 'task-site',
              title: 'Организация площадки',
              parentNodeKey: 'phase-prep',
              kind: 'task',
              durationDays: 4,
              dependsOn: [{ nodeKey: 'task-permits' }],
            },
            {
              nodeKey: 'phase-foundation',
              title: 'Фундамент',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-foundation',
              title: 'Фундамент',
              parentNodeKey: 'phase-foundation',
              kind: 'task',
              durationDays: 8,
              dependsOn: [{ nodeKey: 'task-site' }],
            },
            {
              nodeKey: 'task-waterproofing',
              title: 'Гидроизоляция',
              parentNodeKey: 'phase-foundation',
              kind: 'task',
              durationDays: 4,
              dependsOn: [{ nodeKey: 'task-foundation' }],
            },
            {
              nodeKey: 'phase-shell',
              title: 'Коробка дома',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-walls',
              title: 'Стены и перекрытия',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 10,
              dependsOn: [{ nodeKey: 'task-foundation' }],
            },
            {
              nodeKey: 'task-roof',
              title: 'Кровля и закрытие контура',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 6,
              dependsOn: [{ nodeKey: 'task-walls' }],
            },
            {
              nodeKey: 'phase-mep',
              title: 'Инженерные системы',
              kind: 'phase',
              durationDays: 12,
              dependsOn: [],
            },
            {
              nodeKey: 'task-mep',
              title: 'Монтаж инженерных систем',
              parentNodeKey: 'phase-mep',
              kind: 'task',
              durationDays: 7,
              dependsOn: [{ nodeKey: 'task-walls', type: 'SS' }],
            },
            {
              nodeKey: 'phase-finish',
              title: 'Отделка',
              kind: 'phase',
              durationDays: 10,
              dependsOn: [],
            },
            {
              nodeKey: 'task-finishing',
              title: 'Отделочные работы',
              parentNodeKey: 'phase-finish',
              kind: 'task',
              durationDays: 9,
              dependsOn: [{ nodeKey: 'task-mep' }],
            },
            {
              nodeKey: 'task-handover',
              title: 'Сдача объекта',
              parentNodeKey: 'phase-finish',
              kind: 'task',
              durationDays: 2,
              dependsOn: [{ nodeKey: 'task-finishing' }],
            },
          ],
        });
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.repairAttempted, true);
    assert.equal(result.verdict.accepted, true);
    assert.match(prompts[1] ?? '', /missing_hierarchy/);
    assert.match(prompts[1] ?? '', /weak_coverage/);
    assert.match(prompts[1] ?? '', /crossPhaseDependencies/);
  });

  it('stops after one repair and returns the best available repaired plan when weakness persists', async () => {
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'Построй график',
      brief: buildGenerationBrief({
        userMessage: 'Построй график',
        reference: resolveDomainReference({ userMessage: 'Построй график' }),
      }),
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async () => {
        calls += 1;

        return JSON.stringify({
          projectType: 'private_residential_house',
          nodes: [
            {
              nodeKey: `phase-${calls}`,
              title: `Подготовка ${calls}`,
              kind: 'phase',
              durationDays: 5,
              dependsOn: [],
            },
            {
              nodeKey: `phase-next-${calls}`,
              title: `Строительство ${calls + 1}`,
              kind: 'phase',
              durationDays: 5,
              dependsOn: [],
            },
          ],
        });
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.repairAttempted, true);
    assert.equal(result.verdict.accepted, false);
    assert.ok(result.verdict.reasons.includes('missing_hierarchy'));
    assert.ok(result.verdict.reasons.includes('too_few_phases'));
    assert.ok(result.verdict.reasons.includes('too_few_tasks'));
    assert.ok(result.verdict.reasons.includes('missing_dependency_graph'));
    assert.equal(result.plan.nodes[0]?.title, 'Подготовка 2');
  });
});
