import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeInitialRequest } from './intake-normalization.js';
import { interpretInitialRequest } from './interpreter.js';

const baseProjectState = {
  taskCount: 0,
  hasHierarchy: false,
  isEmptyProject: true,
};

describe('initial-request interpreter', () => {
  it('normalizes Russian paraphrase and English paraphrase to the same broad bootstrap result', async () => {
    const interpretationQuery = async () => JSON.stringify({
      route: 'initial_generation',
      confidence: 0.94,
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
      signals: ['broad_bootstrap'],
    });

    const russian = await interpretInitialRequest({
      userMessage: 'Построй стартовый график строительства детского сада',
      normalizedRequest: normalizeInitialRequest('Построй стартовый график строительства детского сада'),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery,
    });
    const english = await interpretInitialRequest({
      userMessage: 'Build a starter schedule for a kindergarten',
      normalizedRequest: normalizeInitialRequest('Build a starter schedule for a kindergarten'),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery,
    });

    assert.equal(russian.interpretation.route, 'initial_generation');
    assert.equal(english.interpretation.route, 'initial_generation');
    assert.equal(russian.interpretation.scopeMode, 'full_project');
    assert.equal(english.interpretation.scopeMode, 'full_project');
    assert.equal(russian.usedModelDecision, true);
    assert.equal(english.usedModelDecision, true);
  });

  it('keeps explicit worklist interpretation structured', async () => {
    const result = await interpretInitialRequest({
      userMessage: 'Сделай стартовый график только по списку работ',
      normalizedRequest: normalizeInitialRequest([
        'Сделай стартовый график только по списку работ',
        '- Геодезия',
        '- Котлован',
        '- Армирование',
        '- Бетонирование',
      ].join('\n')),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery: async () => JSON.stringify({
        route: 'initial_generation',
        confidence: 0.88,
        requestKind: 'explicit_worklist',
        planningMode: 'worklist_bootstrap',
        scopeMode: 'explicit_worklist',
        objectProfile: 'unknown',
        projectArchetype: 'new_building',
        locationScope: {
          sections: [],
          floors: [],
          zones: [],
        },
        worklistPolicy: 'strict_worklist',
        clarification: {
          needed: false,
          reason: 'none',
        },
        signals: ['explicit_worklist'],
      }),
    });

    assert.equal(result.interpretation.requestKind, 'explicit_worklist');
    assert.equal(result.interpretation.scopeMode, 'explicit_worklist');
    assert.equal(result.interpretation.worklistPolicy, 'strict_worklist');
  });

  it('routes targeted edit interpretation to mutation', async () => {
    const result = await interpretInitialRequest({
      userMessage: 'Shift the excavation task by two days',
      normalizedRequest: normalizeInitialRequest('Shift the excavation task by two days'),
      projectState: {
        taskCount: 6,
        hasHierarchy: true,
        isEmptyProject: false,
      },
      model: 'gpt-test',
      interpretationQuery: async () => JSON.stringify({
        route: 'mutation',
        confidence: 0.91,
        requestKind: 'targeted_edit',
        planningMode: 'partial_scope_bootstrap',
        scopeMode: 'partial_scope',
        objectProfile: 'unknown',
        projectArchetype: 'renovation',
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
        signals: ['targeted_edit'],
      }),
    });

    assert.equal(result.interpretation.route, 'mutation');
    assert.equal(result.interpretation.requestKind, 'targeted_edit');
  });

  it('repairs invalid JSON once before accepting the interpretation', async () => {
    const payloads = [
      '{invalid JSON',
      JSON.stringify({
        route: 'initial_generation',
        confidence: 0.72,
        requestKind: 'ambiguous',
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
          needed: true,
          reason: 'missing_scope',
        },
        signals: ['repair'],
      }),
    ];
    let callIndex = 0;

    const result = await interpretInitialRequest({
      userMessage: 'Build something for this project',
      normalizedRequest: normalizeInitialRequest('Build something for this project'),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery: async () => payloads[callIndex++] ?? payloads[payloads.length - 1],
    });

    assert.equal(callIndex, 2);
    assert.equal(result.repairAttempted, true);
    assert.equal(result.fallbackReason, 'none');
    assert.equal(result.interpretation.clarification.reason, 'missing_scope');
  });

  it('falls back conservatively when the model is unavailable and does not infer targeted edit from lexical markers', async () => {
    const result = await interpretInitialRequest({
      userMessage: 'Move the excavation task under foundations',
      normalizedRequest: normalizeInitialRequest('Move the excavation task under foundations'),
      projectState: {
        taskCount: 0,
        hasHierarchy: false,
        isEmptyProject: true,
      },
      model: 'gpt-test',
      interpretationQuery: async () => {
        throw new Error('model unavailable');
      },
    });

    assert.equal(result.usedModelDecision, false);
    assert.equal(result.fallbackReason, 'model_unavailable');
    assert.equal(result.interpretation.route, 'initial_generation');
    assert.notEqual(result.interpretation.requestKind, 'targeted_edit');
  });

  it('documents prompt constraints for strict JSON only, allowed enum values, targeted_edit, and explicit_worklist', async () => {
    let prompt = '';

    await interpretInitialRequest({
      userMessage: 'Build something',
      normalizedRequest: normalizeInitialRequest('Build something'),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery: async (input) => {
        prompt = input.prompt;
        return JSON.stringify({
          route: 'initial_generation',
          confidence: 0.7,
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
          signals: ['prompt_check'],
        });
      },
    });

    assert.match(prompt, /strict JSON only/i);
    assert.match(prompt, /Allowed enum values/i);
    assert.match(prompt, /targeted_edit/);
    assert.match(prompt, /explicit_worklist/);
    assert.match(prompt, /English paraphrase/i);
    assert.match(prompt, /Russian paraphrase/i);
  });

  it('falls back on schema_invalid and empty_response with explicit bookkeeping', async () => {
    const schemaInvalid = await interpretInitialRequest({
      userMessage: 'Build something',
      normalizedRequest: normalizeInitialRequest('Build something'),
      projectState: {
        taskCount: 5,
        hasHierarchy: true,
        isEmptyProject: false,
      },
      model: 'gpt-test',
      interpretationQuery: async () => JSON.stringify({
        route: 'wrong',
      }),
    });

    const emptyResponse = await interpretInitialRequest({
      userMessage: 'Build something',
      normalizedRequest: normalizeInitialRequest('Build something'),
      projectState: baseProjectState,
      model: 'gpt-test',
      interpretationQuery: async () => '',
    });

    assert.equal(schemaInvalid.fallbackReason, 'schema_invalid');
    assert.equal(emptyResponse.fallbackReason, 'empty_response');
  });
});
