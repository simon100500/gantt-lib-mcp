import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInitialRequest } from './classification.js';
import { decideInitialClarification } from './clarification-gate.js';
import { normalizeInitialRequest } from './intake-normalization.js';

describe('initial-generation clarification gate', () => {
  it('asks exactly one high-impact clarification for ambiguous fragment target', () => {
    const normalized = normalizeInitialRequest('график подвала секции 5.1-5.4');
    const classification = classifyInitialRequest(normalized);
    const decision = decideInitialClarification(normalized, classification);

    assert.equal(decision.action, 'ask');
    if (decision.action !== 'ask') {
      return;
    }
    assert.equal(decision.impact, 'high');
    assert.equal(decision.reason, 'fragment_target_ambiguity');
    assert.equal(decision.choices.length, 2);
    assert.match(decision.fallbackAssumption, /передач/i);
  });

  it('asks for scope boundary only when whole-project and fragment signals conflict', () => {
    const normalized = normalizeInitialRequest('Нужен график строительства всего объекта, но сначала по подвалу секции 5.1-5.4');
    const classification = classifyInitialRequest(normalized);
    const decision = decideInitialClarification(normalized, classification);

    assert.equal(decision.action, 'ask');
    if (decision.action !== 'ask') {
      return;
    }
    assert.equal(decision.reason, 'scope_boundary_ambiguity');
  });

  it('proceeds with assumptions when the request is already specific enough', () => {
    const normalized = normalizeInitialRequest('График строительства детского сада на 3 этажа');
    const classification = classifyInitialRequest(normalized);
    const decision = decideInitialClarification(normalized, classification);

    assert.equal(decision.action, 'proceed_with_assumptions');
    if (decision.action !== 'proceed_with_assumptions') {
      return;
    }
    assert.equal(decision.assumptions.length > 0, true);
  });
});
