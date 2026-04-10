import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from './classification.js';
import { normalizeInitialRequest } from './intake-normalization.js';

describe('initial-generation classification', () => {
  it('maps a broad kindergarten request to whole-project bootstrap', () => {
    const normalized = normalizeInitialRequest('График строительства детского сада на 3 этажа');
    const classification = classifyInitialRequest(normalized);

    assert.equal(classification.scopeMode, 'full_project');
    assert.equal(classification.planningMode, 'whole_project_bootstrap');
    assert.equal(classification.projectArchetype, 'new_building');
    assert.equal(classification.objectProfile, 'kindergarten');
    assert.equal(classification.detailLevel, 'medium');
  });

  it('maps a basement handover fragment request to partial-scope bootstrap', () => {
    const normalized = normalizeInitialRequest('график передачи конструкций подвала секции 5.1-5.4');
    const classification = classifyInitialRequest(normalized);

    assert.equal(classification.scopeMode, 'partial_scope');
    assert.equal(classification.planningMode, 'partial_scope_bootstrap');
    assert.equal(classification.projectArchetype, 'new_building');
    assert.equal(classification.objectProfile, 'residential_multi_section');
    assert.deepEqual(classification.locationScope?.sections, ['5.1', '5.2', '5.3', '5.4']);
    assert.deepEqual(classification.locationScope?.zones, ['подвал', 'секции']);
  });

  it('maps an explicit pasted work list to worklist bootstrap', () => {
    const normalized = normalizeInitialRequest([
      'Сделай график по этому списку работ:',
      '1. Разработка котлована',
      '2. Устройство песчаной подушки',
      '3. Монтаж опалубки',
      '4. Армирование фундаментной плиты',
      '5. Бетонирование фундаментной плиты',
    ].join('\n'));
    const classification = classifyInitialRequest(normalized);

    assert.equal(classification.scopeMode, 'explicit_worklist');
    assert.equal(classification.planningMode, 'worklist_bootstrap');
    assert.equal(classification.explicitWorkItemsPresent, true);
    assert.equal(classification.worklistPolicy, 'strict_worklist');
    assert.equal(normalized.explicitWorkItems.length, 5);
  });
});
