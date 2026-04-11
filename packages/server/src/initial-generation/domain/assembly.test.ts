import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from '../classification.js';
import { decideInitialClarification } from '../clarification-gate.js';
import { normalizeInitialRequest } from '../intake-normalization.js';
import { assembleDomainSkeleton } from './assembly.js';

describe('initial-generation domain assembly', () => {
  it('assembles a whole-project kindergarten skeleton', () => {
    const normalizedRequest = normalizeInitialRequest('График строительства детского сада на 3 этажа');
    const classification = classifyInitialRequest(normalizedRequest);
    const clarificationDecision = decideInitialClarification(normalizedRequest, classification);

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
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
    const classification = classifyInitialRequest(normalizedRequest);
    const clarificationDecision = decideInitialClarification(normalizedRequest, classification);

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
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
      'Сделай график по этому списку:',
      '1. Разработка котлована',
      '2. Песчаная подготовка',
      '3. Армирование плиты',
      '4. Бетонирование плиты',
    ].join('\n'));
    const classification = classifyInitialRequest(normalizedRequest);
    const clarificationDecision = decideInitialClarification(normalizedRequest, classification);

    const skeleton = assembleDomainSkeleton({
      normalizedRequest,
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
