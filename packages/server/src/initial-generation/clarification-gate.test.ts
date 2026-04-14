import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from './classification.js';
import { decideInitialClarification } from './clarification-gate.js';
import { normalizeInitialRequest } from './intake-normalization.js';
import type { InitialRequestInterpretation } from './types.js';

function createInterpretation(
  overrides: Partial<InitialRequestInterpretation> = {},
): InitialRequestInterpretation {
  return {
    route: 'initial_generation',
    confidence: 0.73,
    requestKind: 'whole_project',
    planningMode: 'whole_project_bootstrap',
    scopeMode: 'full_project',
    objectProfile: 'unknown',
    projectArchetype: 'unknown',
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

describe('initial-generation clarification gate', () => {
  it('asks exactly one high-impact clarification for partial scope when interpretation marks fragment target ambiguity', () => {
    const normalized = normalizeInitialRequest('график подвала секции 5.1-5.4');
    const interpretation = createInterpretation({
      requestKind: 'partial_scope',
      planningMode: 'partial_scope_bootstrap',
      scopeMode: 'partial_scope',
      clarification: {
        needed: true,
        reason: 'fragment_target_ambiguity',
      },
    });
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation,
    });
    const decision = decideInitialClarification({
      normalizedRequest: normalized,
      interpretation,
      classification,
    });

    assert.equal(decision.action, 'ask');
    if (decision.action !== 'ask') {
      return;
    }
    assert.equal(decision.impact, 'high');
    assert.equal(decision.reason, 'fragment_target_ambiguity');
    assert.equal(decision.choices.length, 2);
    assert.match(decision.fallbackAssumption, /передач/i);
  });

  it('asks for scope boundary when interpretation marks the request as ambiguous', () => {
    const normalized = normalizeInitialRequest('Russian paraphrase ambiguous request about whole object vs basement section');
    const interpretation = createInterpretation({
      requestKind: 'ambiguous',
      planningMode: 'partial_scope_bootstrap',
      scopeMode: 'partial_scope',
      clarification: {
        needed: true,
        reason: 'scope_boundary_ambiguity',
      },
    });
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation,
    });
    const decision = decideInitialClarification({
      normalizedRequest: normalized,
      interpretation,
      classification,
    });

    assert.equal(decision.action, 'ask');
    if (decision.action !== 'ask') {
      return;
    }
    assert.equal(decision.reason, 'scope_boundary_ambiguity');
  });

  it('asks explicit worklist clarification only when interpretation marks the list as ambiguous', () => {
    const normalized = normalizeInitialRequest([
      'English paraphrase explicit worklist request:',
      '1. Excavate foundation pit',
      '2. Sand bedding',
      '3. Formwork',
      '4. Rebar',
    ].join('\n'));
    const interpretation = createInterpretation({
      requestKind: 'explicit_worklist',
      planningMode: 'worklist_bootstrap',
      scopeMode: 'explicit_worklist',
      clarification: {
        needed: true,
        reason: 'ambiguous_list',
      },
      worklistPolicy: 'strict_worklist',
    });
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation,
    });
    const decision = decideInitialClarification({
      normalizedRequest: normalized,
      interpretation,
      classification,
    });

    assert.equal(decision.action, 'ask');
    if (decision.action !== 'ask') {
      return;
    }
    assert.equal(decision.reason, 'worklist_completeness_ambiguity');
  });

  it('proceeds with assumptions when interpretation says the request is already specific enough', () => {
    const normalized = normalizeInitialRequest('Build a starter schedule for a three-storey kindergarten project');
    const interpretation = createInterpretation({
      objectProfile: 'kindergarten',
      projectArchetype: 'new_building',
    });
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation,
    });
    const decision = decideInitialClarification({
      normalizedRequest: normalized,
      interpretation,
      classification,
    });

    assert.equal(decision.action, 'proceed_with_assumptions');
    if (decision.action !== 'proceed_with_assumptions') {
      return;
    }
    assert.equal(decision.assumptions.length > 0, true);
  });

  it('keeps Russian and English partial-scope paraphrases on the same ambiguity question', () => {
    const interpretation = createInterpretation({
      requestKind: 'partial_scope',
      planningMode: 'partial_scope_bootstrap',
      scopeMode: 'partial_scope',
      clarification: {
        needed: true,
        reason: 'fragment_target_ambiguity',
      },
      locationScope: {
        sections: ['5.1'],
        floors: [],
        zones: ['подвал'],
      },
    });

    const russian = normalizeInitialRequest('Построй график подвала секции 5.1');
    const english = normalizeInitialRequest('Build a starter schedule for the basement of section 5.1');
    const russianDecision = decideInitialClarification({
      normalizedRequest: russian,
      interpretation,
      classification: classifyInitialRequest({ normalizedRequest: russian, interpretation }),
    });
    const englishDecision = decideInitialClarification({
      normalizedRequest: english,
      interpretation,
      classification: classifyInitialRequest({ normalizedRequest: english, interpretation }),
    });

    assert.deepEqual(englishDecision, russianDecision);
    assert.equal(russianDecision.action, 'ask');
  });

  it('keeps fallback-driven explicit worklist clarification strict even on English paraphrase', () => {
    const normalized = normalizeInitialRequest([
      'Build a starter schedule only from this explicit worklist',
      '1. Excavate foundation pit',
      '2. Place rebar',
      '3. Pour concrete',
    ].join('\n'));
    const interpretation = createInterpretation({
      confidence: 0.31,
      requestKind: 'explicit_worklist',
      planningMode: 'worklist_bootstrap',
      scopeMode: 'explicit_worklist',
      objectProfile: 'unknown',
      projectArchetype: 'unknown',
      clarification: {
        needed: false,
        reason: 'none',
      },
      worklistPolicy: 'strict_worklist',
      signals: ['fallback_driven_worklist'],
    });
    const classification = classifyInitialRequest({
      normalizedRequest: normalized,
      interpretation,
    });
    const decision = decideInitialClarification({
      normalizedRequest: normalized,
      interpretation,
      classification,
    });

    assert.equal(decision.action, 'proceed_with_assumptions');
    if (decision.action !== 'proceed_with_assumptions') {
      return;
    }
    assert.ok(decision.assumptions.some((item) => /список работ/i.test(item)));
  });
});
