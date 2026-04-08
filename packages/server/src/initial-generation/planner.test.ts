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
  it('flags missing hierarchy, placeholder titles, weak coverage, and weak sequence', () => {
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
              nodeKey: 'phase-structure',
              title: 'Коробка дома',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-foundation',
              title: 'Устройство фундамента',
              parentNodeKey: 'phase-structure',
              kind: 'task',
              durationDays: 8,
              dependsOn: [{ nodeKey: 'task-site', type: 'FS' }],
            },
            {
              nodeKey: 'task-walls',
              title: 'Кладка стен из газобетона',
              parentNodeKey: 'phase-structure',
              kind: 'task',
              durationDays: 10,
              dependsOn: [{ nodeKey: 'task-foundation' }],
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.verdict.accepted, true);
    assert.equal(result.repairAttempted, false);
    assert.deepEqual(result.plan.assumptions, []);
    assert.deepEqual(result.plan.nodes[4]?.dependsOn[0], {
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
              nodeKey: 'phase-shell',
              title: 'Коробка дома',
              kind: 'phase',
              durationDays: 20,
              dependsOn: [],
            },
            {
              nodeKey: 'task-foundation',
              title: 'Фундамент',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 8,
              dependsOn: [{ nodeKey: 'task-site' }],
            },
            {
              nodeKey: 'task-walls',
              title: 'Стены и перекрытия',
              parentNodeKey: 'phase-shell',
              kind: 'task',
              durationDays: 10,
              dependsOn: [{ nodeKey: 'task-foundation' }],
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
    assert.deepEqual(result.verdict.reasons, [
      'missing_hierarchy',
      'weak_coverage',
      'weak_sequence',
    ]);
    assert.equal(result.plan.nodes[0]?.title, 'Подготовка 2');
  });
});
