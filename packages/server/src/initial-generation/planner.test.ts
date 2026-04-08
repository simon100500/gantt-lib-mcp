import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGenerationBrief } from './brief.js';
import { resolveDomainReference } from './domain-reference.js';
import { parseModelJson } from './json-response.js';
import { planInitialProject } from './planner.js';
import {
  evaluatePhaseExpansionQuality,
  evaluateProjectPlanQuality,
  evaluateSkeletonQuality,
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
    assert.match(brief.namingBan, /Этап 1/);
    assert.match(brief.serverInferencePolicy, /Infer/i);
  });
});

describe('initial-generation quality gate', () => {
  it('flags weak skeletons with placeholder titles and poor coverage', () => {
    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
    });

    const verdict = evaluateSkeletonQuality({
      projectType: 'private_residential_house',
      assumptions: [],
      phases: [
        {
          phaseKey: 'phase-1',
          title: 'Этап 1',
          orderHint: 1,
          workPackages: [{ workPackageKey: 'wp-1', title: 'Задача 1' }],
        },
      ],
    }, brief, 'Построй график');

    assert.equal(verdict.accepted, false);
    assert.ok(verdict.reasons.includes('too_few_phases'));
    assert.ok(verdict.reasons.includes('placeholder_titles'));
  });

  it('flags weak phase expansions with missing sequencing', () => {
    const verdict = evaluatePhaseExpansionQuality({
      phaseKey: 'phase-shell',
      tasks: [
        {
          nodeKey: 'task-1',
          title: 'Задача 1',
          durationDays: 3,
          dependsOnWithinPhase: [],
        },
      ],
    });

    assert.equal(verdict.accepted, false);
    assert.ok(verdict.reasons.includes('too_few_tasks'));
    assert.ok(verdict.reasons.includes('placeholder_titles'));
  });

  it('rejects oversized starter scope and long enumerative titles', () => {
    const brief = buildGenerationBrief({
      userMessage: 'Построй график',
      reference: resolveDomainReference({ userMessage: 'Построй график' }),
    });

    const skeletonVerdict = evaluateSkeletonQuality({
      projectType: 'private_residential_house',
      assumptions: [],
      phases: [
        { phaseKey: 'phase-1', title: 'Подготовка участка, временные дороги, ограждение и бытовой городок', orderHint: 1, workPackages: [{ workPackageKey: 'wp-1', title: 'Разбивка осей' }, { workPackageKey: 'wp-2', title: 'Ограждение' }, { workPackageKey: 'wp-3', title: 'Подъезды' }, { workPackageKey: 'wp-4', title: 'Бытовой городок' }, { workPackageKey: 'wp-5', title: 'Подключения' }, { workPackageKey: 'wp-6', title: 'Охрана труда' }] },
        { phaseKey: 'phase-2', title: 'Фундамент', orderHint: 2, workPackages: [{ workPackageKey: 'wp-1', title: 'Котлован' }, { workPackageKey: 'wp-2', title: 'Основание' }, { workPackageKey: 'wp-3', title: 'Армирование' }] },
        { phaseKey: 'phase-3', title: 'Коробка', orderHint: 3, workPackages: [{ workPackageKey: 'wp-1', title: 'Стены' }, { workPackageKey: 'wp-2', title: 'Перекрытия' }, { workPackageKey: 'wp-3', title: 'Кровля' }] },
        { phaseKey: 'phase-4', title: 'Инженерия', orderHint: 4, workPackages: [{ workPackageKey: 'wp-1', title: 'ОВ' }, { workPackageKey: 'wp-2', title: 'ВК' }, { workPackageKey: 'wp-3', title: 'ЭОМ' }] },
        { phaseKey: 'phase-5', title: 'Отделка', orderHint: 5, workPackages: [{ workPackageKey: 'wp-1', title: 'Черновая' }, { workPackageKey: 'wp-2', title: 'Чистовая' }, { workPackageKey: 'wp-3', title: 'Фасады' }] },
        { phaseKey: 'phase-6', title: 'Сдача', orderHint: 6, workPackages: [{ workPackageKey: 'wp-1', title: 'ПНР' }, { workPackageKey: 'wp-2', title: 'Испытания' }, { workPackageKey: 'wp-3', title: 'Документы' }] },
        { phaseKey: 'phase-7', title: 'Благоустройство', orderHint: 7, workPackages: [{ workPackageKey: 'wp-1', title: 'Дорожки' }, { workPackageKey: 'wp-2', title: 'Озеленение' }, { workPackageKey: 'wp-3', title: 'Освещение' }] },
      ],
    }, brief, 'Построй график');

    const expansionVerdict = evaluatePhaseExpansionQuality({
      phaseKey: 'phase-shell',
      tasks: [
        { nodeKey: 'task-1', title: 'Разработка котлована', durationDays: 2, dependsOnWithinPhase: [], sequenceRole: 'entry' },
        { nodeKey: 'task-2', title: 'Устройство основания', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-1', type: 'FS', lagDays: 0 }], sequenceRole: 'entry' },
        { nodeKey: 'task-3', title: 'Монтаж дренажа, выпусков канализации, вводов водоснабжения и гильз под коммуникации', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-2', type: 'FS', lagDays: 0 }], sequenceRole: 'entry' },
        { nodeKey: 'task-4', title: 'Армирование', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-3', type: 'FS', lagDays: 0 }] },
        { nodeKey: 'task-5', title: 'Бетонирование', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-4', type: 'FS', lagDays: 0 }] },
        { nodeKey: 'task-6', title: 'Контроль', durationDays: 1, dependsOnWithinPhase: [{ nodeKey: 'task-5', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
      ],
    });

    const planVerdict = evaluateProjectPlanQuality({
      projectType: 'private_residential_house',
      assumptions: [],
      nodes: [
        ...Array.from({ length: 6 }, (_, phaseIndex) => ({
          nodeKey: `phase-${phaseIndex + 1}`,
          title: `Фаза ${phaseIndex + 1}`,
          kind: 'phase' as const,
          durationDays: 1,
          dependsOn: [],
        })),
        ...Array.from({ length: 31 }, (_, taskIndex) => ({
          nodeKey: `task-${taskIndex + 1}`,
          title: `Работа ${taskIndex + 1}`,
          parentNodeKey: `phase-${(taskIndex % 6) + 1}`,
          kind: 'task' as const,
          durationDays: 1,
          dependsOn: taskIndex === 0 ? [] : [{ nodeKey: `task-${taskIndex}`, type: 'FS' as const, lagDays: 0 }],
        })),
      ],
    }, brief);

    assert.ok(skeletonVerdict.reasons.includes('too_many_phases'));
    assert.ok(skeletonVerdict.reasons.includes('too_many_work_packages'));
    assert.ok(skeletonVerdict.reasons.includes('oversized_titles'));
    assert.ok(expansionVerdict.reasons.includes('too_many_tasks'));
    assert.ok(expansionVerdict.reasons.includes('too_many_entry_tasks'));
    assert.ok(expansionVerdict.reasons.includes('oversized_titles'));
    assert.ok(planVerdict.reasons.includes('too_many_tasks'));
  });

  it('flags executable plans that still lack enough task graph depth', () => {
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
          title: 'Подготовка',
          kind: 'phase',
          durationDays: 1,
          dependsOn: [],
        },
        {
          nodeKey: 'task-1',
          title: 'Разметка',
          parentNodeKey: 'phase-1',
          kind: 'task',
          durationDays: 2,
          dependsOn: [],
        },
      ],
    }, brief);

    assert.equal(verdict.accepted, false);
    assert.ok(verdict.reasons.includes('weak_coverage'));
  });
});

describe('initial-generation json response parsing', () => {
  it('extracts the first balanced JSON object from a noisy model response', () => {
    const parsed = parseModelJson(`Ниже корректный JSON.\n{"projectType":"private_house","assumptions":["a"],"phases":[]}\nГотово.`) as { projectType: string };

    assert.equal(parsed.projectType, 'private_house');
  });
});

describe('initial-generation planner', () => {
  it('builds a staged executable plan and forbids dates in planning prompts', async () => {
    const prompts: Array<{ stage: string; prompt: string }> = [];

    const result = await planInitialProject({
      userMessage: 'График строительства жилого дома на 3 этажа + гараж',
      brief: buildGenerationBrief({
        userMessage: 'График строительства жилого дома на 3 этажа + гараж',
        reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства жилого дома на 3 этажа + гараж' }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async ({ stage, prompt }) => {
        prompts.push({ stage, prompt });

        if (stage === 'skeleton') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: ['Жилой дом с гаражом'],
            phases: [
              {
                phaseKey: 'phase-site',
                title: 'Подготовка участка',
                orderHint: 1,
                workPackages: [
                  { workPackageKey: 'survey', title: 'Геодезическая подготовка' },
                  { workPackageKey: 'camp', title: 'Бытовой городок' },
                  { workPackageKey: 'access', title: 'Временные дороги и ограждение' },
                ],
              },
              {
                phaseKey: 'phase-foundation',
                title: 'Нулевой цикл',
                orderHint: 2,
                dependsOnPhaseKeys: ['phase-site'],
                workPackages: [
                  { workPackageKey: 'earthworks', title: 'Земляные работы' },
                  { workPackageKey: 'foundation', title: 'Фундамент дома и гаража' },
                  { workPackageKey: 'waterproofing', title: 'Гидроизоляция' },
                ],
              },
              {
                phaseKey: 'phase-shell',
                title: 'Коробка дома на 3 этажа и гараж',
                orderHint: 3,
                dependsOnPhaseKeys: ['phase-foundation'],
                workPackages: [
                  { workPackageKey: 'house', title: 'Надземная часть дома' },
                  { workPackageKey: 'garage', title: 'Коробка гаража' },
                  { workPackageKey: 'roof', title: 'Кровля и закрытие контура' },
                ],
              },
              {
                phaseKey: 'phase-finish',
                title: 'Инженерия и отделка',
                orderHint: 4,
                dependsOnPhaseKeys: ['phase-shell'],
                workPackages: [
                  { workPackageKey: 'mep', title: 'Инженерные системы' },
                  { workPackageKey: 'finish', title: 'Отделочные работы' },
                  { workPackageKey: 'handover', title: 'Сдача' },
                ],
              },
            ],
          });
        }

        const phaseKeyToExpansion: Record<string, unknown> = {
          'phase-site': {
            phaseKey: 'phase-site',
            tasks: [
              { nodeKey: 'task-survey', title: 'Геодезическая разбивка', durationDays: 2, dependsOnWithinPhase: [], sequenceRole: 'entry' },
              { nodeKey: 'task-camp', title: 'Организация площадки', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-survey', type: 'FS', lagDays: 0 }] },
              { nodeKey: 'task-access', title: 'Временные дороги и ограждение', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-camp', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
            ],
          },
          'phase-foundation': {
            phaseKey: 'phase-foundation',
            tasks: [
              { nodeKey: 'task-pit', title: 'Разработка котлована', durationDays: 4, dependsOnWithinPhase: [], sequenceRole: 'entry' },
              { nodeKey: 'task-footings', title: 'Бетонирование фундамента', durationDays: 5, dependsOnWithinPhase: [{ nodeKey: 'task-pit', type: 'FS', lagDays: 1 }] },
              { nodeKey: 'task-waterproofing', title: 'Гидроизоляция и обратная засыпка', durationDays: 3, dependsOnWithinPhase: [{ nodeKey: 'task-footings', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
            ],
          },
          'phase-shell': {
            phaseKey: 'phase-shell',
            tasks: [
              { nodeKey: 'task-house-shell', title: 'Возведение стен и перекрытий дома', durationDays: 10, dependsOnWithinPhase: [], sequenceRole: 'entry' },
              { nodeKey: 'task-garage-shell', title: 'Возведение коробки гаража', durationDays: 6, dependsOnWithinPhase: [{ nodeKey: 'task-house-shell', type: 'SS', lagDays: 2 }] },
              { nodeKey: 'task-roof', title: 'Монтаж кровли', durationDays: 4, dependsOnWithinPhase: [{ nodeKey: 'task-house-shell', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
            ],
          },
          'phase-finish': {
            phaseKey: 'phase-finish',
            tasks: [
              { nodeKey: 'task-mep', title: 'Монтаж инженерных систем', durationDays: 6, dependsOnWithinPhase: [], sequenceRole: 'entry' },
              { nodeKey: 'task-finish', title: 'Чистовая отделка', durationDays: 5, dependsOnWithinPhase: [{ nodeKey: 'task-mep', type: 'FS', lagDays: 0 }] },
              { nodeKey: 'task-handover', title: 'Пусконаладка и сдача', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: 'task-finish', type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
            ],
          },
        };

        const phaseMatch = prompt.match(/Current phase: (.+)/);
        const phaseKey = phaseMatch?.[1]?.includes('Подготовка')
          ? 'phase-site'
          : phaseMatch?.[1]?.includes('Нулевой')
            ? 'phase-foundation'
            : phaseMatch?.[1]?.includes('Коробка')
              ? 'phase-shell'
              : 'phase-finish';

        return JSON.stringify(phaseKeyToExpansion[phaseKey]);
      },
    });

    assert.equal(result.skeletonVerdict.accepted, true);
    assert.equal(result.expandedPhases.length, 4);
    assert.equal(result.verdict.accepted, true);
    assert.equal(result.plan.nodes.filter((node) => node.kind === 'phase').length, 4);
    assert.equal(result.plan.nodes.filter((node) => node.kind === 'task').length, 12);
    assert.ok(result.crossPhaseLinkPlan.links.length >= 3);
    assert.ok(prompts.every(({ prompt }) => /Do not output dates/i.test(prompt)));
  });

  it('repairs a weak skeleton once and returns the repaired staged result', async () => {
    let calls = 0;

    const result = await planInitialProject({
      userMessage: 'График строительства частного дома',
      brief: buildGenerationBrief({
        userMessage: 'График строительства частного дома',
        reference: resolveDomainReference({ userMessage: 'График строительства частного дома' }),
      }),
      reference: resolveDomainReference({ userMessage: 'График строительства частного дома' }),
      modelDecision: { selectedModel: 'gpt-strong' },
      sdkQuery: async ({ stage }) => {
        calls += 1;

        if (stage === 'skeleton') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: [],
            phases: [
              { phaseKey: 'phase-1', title: 'Подготовка', orderHint: 1, workPackages: [{ workPackageKey: 'wp-1', title: 'Геодезия' }] },
            ],
          });
        }

        if (stage === 'skeleton_repair') {
          return JSON.stringify({
            projectType: 'private_residential_house',
            assumptions: [],
            phases: [
              { phaseKey: 'phase-prep', title: 'Подготовка участка', orderHint: 1, workPackages: [{ workPackageKey: 'survey', title: 'Геодезия' }, { workPackageKey: 'camp', title: 'Бытовой городок' }, { workPackageKey: 'access', title: 'Подъезды' }] },
              { phaseKey: 'phase-foundation', title: 'Фундамент', orderHint: 2, dependsOnPhaseKeys: ['phase-prep'], workPackages: [{ workPackageKey: 'pit', title: 'Котлован' }, { workPackageKey: 'footings', title: 'Бетонирование' }, { workPackageKey: 'waterproofing', title: 'Гидроизоляция' }] },
              { phaseKey: 'phase-shell', title: 'Коробка дома', orderHint: 3, dependsOnPhaseKeys: ['phase-foundation'], workPackages: [{ workPackageKey: 'walls', title: 'Стены' }, { workPackageKey: 'floors', title: 'Перекрытия' }, { workPackageKey: 'roof', title: 'Кровля' }] },
              { phaseKey: 'phase-finish', title: 'Отделка и сдача', orderHint: 4, dependsOnPhaseKeys: ['phase-shell'], workPackages: [{ workPackageKey: 'mep', title: 'Инженерия' }, { workPackageKey: 'finish', title: 'Отделка' }, { workPackageKey: 'handover', title: 'Сдача' }] },
            ],
          });
        }

        const promptPhaseKey = calls === 3
          ? 'phase-prep'
          : calls === 4
            ? 'phase-foundation'
            : calls === 5
              ? 'phase-shell'
              : 'phase-finish';

        return JSON.stringify({
          phaseKey: promptPhaseKey,
          tasks: [
            { nodeKey: `task-${calls}-1`, title: 'Разметка', durationDays: 2, dependsOnWithinPhase: [], sequenceRole: 'entry' },
            { nodeKey: `task-${calls}-2`, title: 'Подготовка площадки', durationDays: 2, dependsOnWithinPhase: [{ nodeKey: `task-${calls}-1`, type: 'FS', lagDays: 0 }] },
            { nodeKey: `task-${calls}-3`, title: 'Завершение этапа', durationDays: 1, dependsOnWithinPhase: [{ nodeKey: `task-${calls}-2`, type: 'FS', lagDays: 0 }], sequenceRole: 'exit' },
          ],
        });
      },
    });

    assert.equal(result.repairAttempted, true);
    assert.equal(result.skeletonVerdict.accepted, true);
    assert.equal(result.verdict.accepted, true);
    assert.ok(calls >= 6);
  });
});
