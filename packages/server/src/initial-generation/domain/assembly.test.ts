import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from '../classification.js';
import { decideInitialClarification } from '../clarification-gate.js';
import { normalizeInitialRequest } from '../intake-normalization.js';
import { assembleDomainSkeleton } from './assembly.js';
import type { InitialRequestInterpretation } from '../types.js';

function createInterpretation(
  overrides: Partial<InitialRequestInterpretation> = {},
): InitialRequestInterpretation {
  return {
    route: 'initial_generation',
    confidence: 0.82,
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

describe('initial-generation domain assembly', () => {
  it('assembles a whole-project kindergarten skeleton', () => {
    const normalizedRequest = normalizeInitialRequest('График строительства детского сада на 3 этажа');
    const interpretation = createInterpretation();
    const classification = classifyInitialRequest({ normalizedRequest, interpretation });
    const clarificationDecision = decideInitialClarification({ normalizedRequest, interpretation, classification });

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
      interpretation,
      classification,
      clarificationDecision,
    });

    assert.equal(skeleton.projectArchetype, 'new_building');
    assert.equal(skeleton.objectProfile, 'kindergarten');
    assert.equal(skeleton.fragmentKey, undefined);
    assert.equal(skeleton.stageFamilies.includes('Подготовительный этап'), true);
    assert.equal(skeleton.requiredFamilies.includes('playground'), true);
    assert.equal(skeleton.milestoneSkeleton.includes('Готовность групповых помещений'), true);
  });

  it('assembles a basement handover fragment skeleton with local boundaries', () => {
    const normalizedRequest = normalizeInitialRequest('график передачи конструкций подвала секции 5.1-5.4');
    const interpretation = createInterpretation({
      requestKind: 'partial_scope',
      planningMode: 'partial_scope_bootstrap',
      scopeMode: 'partial_scope',
      objectProfile: 'residential_multi_section',
      locationScope: {
        sections: ['5.1', '5.2', '5.3', '5.4'],
        floors: [],
        zones: ['подвал'],
      },
      clarification: {
        needed: true,
        reason: 'fragment_target_ambiguity',
      },
    });
    const classification = classifyInitialRequest({ normalizedRequest, interpretation });
    const clarificationDecision = decideInitialClarification({ normalizedRequest, interpretation, classification });

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
      interpretation,
      classification,
      clarificationDecision,
    });

    assert.equal(skeleton.fragmentKey, 'basement_handover');
    assert.equal(skeleton.scopeMode, 'partial_scope');
    assert.equal(skeleton.scopeBoundaries.some((item) => /подвал/i.test(item)), true);
    assert.equal(skeleton.milestoneSkeleton.some((item) => /подвала/i.test(item)), true);
    assert.equal(skeleton.requiredFamilies.includes('basement_structure'), true);
  });

  it('keeps worklist scope centered on explicit items', () => {
    const normalizedRequest = normalizeInitialRequest([
      'explicit worklist',
      '1. Разработка котлована',
      '2. Песчаная подготовка',
      '3. Армирование плиты',
      '4. Бетонирование плиты',
    ].join('\n'));
    const interpretation = createInterpretation({
      requestKind: 'explicit_worklist',
      planningMode: 'worklist_bootstrap',
      scopeMode: 'explicit_worklist',
      objectProfile: 'unknown',
      worklistPolicy: 'strict_worklist',
    });
    const classification = classifyInitialRequest({ normalizedRequest, interpretation });
    const clarificationDecision = decideInitialClarification({ normalizedRequest, interpretation, classification });

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
      interpretation,
      classification,
      clarificationDecision,
    });

    assert.equal(skeleton.planningMode, 'worklist_bootstrap');
    assert.equal(skeleton.scopeBoundaries.includes('Сохранять scope внутри пользовательского списка работ.'), true);
    assert.deepEqual(skeleton.explicitWorkItems, [
      'Разработка котлована',
      'Песчаная подготовка',
      'Армирование плиты',
      'Бетонирование плиты',
    ]);
  });
});
