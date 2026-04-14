import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from './classification.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import type { InitialRequestInterpretation } from './types.js';

function createInterpretation(
  overrides: Partial<InitialRequestInterpretation> = {},
): InitialRequestInterpretation {
  return {
    route: 'initial_generation',
    confidence: 0.84,
    requestKind: 'whole_project',
    planningMode: 'whole_project_bootstrap',
    scopeMode: 'full_project',
    objectProfile: 'kindergarten',
    projectArchetype: 'new_building',
    locationScope: {
      sections: [],
      floors: [],
      zones: [],
    },
    worklistPolicy: 'worklist_plus_inferred_supporting_tasks',
    clarification: {
      needed: false,
      reason: 'none',
    },
    signals: [],
    ...overrides,
  };
}

describe('initial-generation classification', () => {
  it('treats Russian paraphrase and English paraphrase as the same whole-project classification', () => {
    const russian = normalizeInitialRequest('График строительства детского сада на 3 этажа');
    const english = normalizeInitialRequest('Build a starter schedule for a three-storey kindergarten project');
    const interpretation = createInterpretation();
    const russianClassification = classifyInitialRequest({
      normalizedRequest: russian,
      interpretation,
    });
    const englishClassification = classifyInitialRequest({
      normalizedRequest: english,
      interpretation,
    });

    assert.deepEqual(englishClassification, russianClassification);
    assert.equal(russianClassification.scopeMode, 'full_project');
    assert.equal(russianClassification.planningMode, 'whole_project_bootstrap');
    assert.equal(russianClassification.projectArchetype, 'new_building');
    assert.equal(russianClassification.objectProfile, 'kindergarten');
    assert.equal(russianClassification.detailLevel, 'medium');
  });

  it('projects partial-scope bootstrap directly from interpretation enums', () => {
    const normalized = normalizeInitialRequest('график передачи конструкций подвала секции 5.1-5.4');
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation: createInterpretation({
        requestKind: 'partial_scope',
        planningMode: 'partial_scope_bootstrap',
        scopeMode: 'partial_scope',
        objectProfile: 'residential_multi_section',
        locationScope: {
          sections: ['5.1', '5.2', '5.3', '5.4'],
          floors: [],
          zones: ['подвал', 'секции'],
        },
      }),
    });

    assert.equal(classification.scopeMode, 'partial_scope');
    assert.equal(classification.planningMode, 'partial_scope_bootstrap');
    assert.equal(classification.projectArchetype, 'new_building');
    assert.equal(classification.objectProfile, 'residential_multi_section');
    assert.deepEqual(classification.locationScope?.sections, ['5.1', '5.2', '5.3', '5.4']);
    assert.deepEqual(classification.locationScope?.zones, ['подвал', 'секции']);
  });

  it('keeps explicit worklist semantics on the injected interpretation contract', () => {
    const normalized = normalizeInitialRequest([
      'English paraphrase explicit worklist request:',
      '1. Разработка котлована',
      '2. Устройство песчаной подушки',
      '3. Монтаж опалубки',
      '4. Армирование фундаментной плиты',
      '5. Бетонирование фундаментной плиты',
    ].join('\n'));
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation: createInterpretation({
        confidence: 0.91,
        requestKind: 'explicit_worklist',
        planningMode: 'worklist_bootstrap',
        scopeMode: 'explicit_worklist',
        objectProfile: 'unknown',
        projectArchetype: 'unknown',
        worklistPolicy: 'strict_worklist',
      }),
    });

    assert.equal(classification.scopeMode, 'explicit_worklist');
    assert.equal(classification.planningMode, 'worklist_bootstrap');
    assert.equal(classification.explicitWorkItemsPresent, true);
    assert.equal(classification.worklistPolicy, 'strict_worklist');
    assert.equal(normalized.explicitWorkItems.length, 5);
  });
});
