import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGenerationBrief } from './brief.js';
import { resolveDomainReference } from './domain-reference.js';

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
