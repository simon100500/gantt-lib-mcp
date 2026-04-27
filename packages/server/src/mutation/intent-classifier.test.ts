import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyMutationIntent } from './intent-classifier.js';
import { selectMutationExecutionMode } from './execution-routing.js';

function buildSemanticIntentQuery(content: string) {
  return async () => ({ content });
}

const env = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://example.test',
  OPENAI_MODEL: 'gpt-main',
};

describe('mutation intent classification', () => {
  it('returns a strict route envelope for deterministic edits', async () => {
    const addIntent = await classifyMutationIntent({
      userMessage: 'добавь сдачу технадзору',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        route: 'fast_path',
        intentFamily: 'task_edit',
        intentType: 'add_single_task',
        confidence: 0.93,
        riskLevel: 'S1',
        params: {
          taskTitle: 'Сдача технадзору',
          durationDays: 1,
        },
        ambiguities: [],
        entitiesMentioned: ['сдача технадзору'],
      })),
    });

    assert.equal(addIntent.routeEnvelope.route, 'fast_path');
    assert.equal(addIntent.routeEnvelope.intentFamily, 'task_edit');
    assert.equal(addIntent.intentType, 'add_single_task');
    assert.equal(addIntent.confidence, 0.93);
    assert.equal(addIntent.routeEnvelope.confidence, 0.93);
    assert.equal(addIntent.routeEnvelope.riskLevel, 'S1');
    assert.equal(addIntent.rawRequest, 'добавь сдачу технадзору');
    assert.equal(addIntent.normalizedRequest, 'добавь сдачу технадзору');
    assert.deepEqual(addIntent.entitiesMentioned, ['сдача технадзору']);
    assert.equal(addIntent.requiresResolution, true);
    assert.equal(addIntent.requiresSchedulingPlacement, true);
    assert.equal(addIntent.executionMode, 'deterministic');
    assert.deepEqual(addIntent.routeEnvelope.params, {
      taskTitle: 'Сдача технадзору',
      durationDays: 1,
    });
    assert.deepEqual(addIntent.routeEnvelope.ambiguities, []);
  });

  it('routes floor-by-floor decomposition through the specialized fast path', async () => {
    const decomposeIntent = await classifyMutationIntent({
      userMessage: 'Разбей Бетонирование перекрытий 12-17 этажей поэтажно',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        route: 'specialized_fast_path',
        intentFamily: 'structure',
        intentType: 'decompose_task',
        confidence: 0.94,
        riskLevel: 'S2',
        params: {
          executor: 'split_task',
          mode: 'by_floor',
          range: { from: 12, to: 17 },
        },
        ambiguities: [],
        entitiesMentioned: ['Бетонирование перекрытий 12-17 этажей'],
      })),
    });

    assert.equal(decomposeIntent.intentType, 'decompose_task');
    assert.equal(decomposeIntent.routeEnvelope.route, 'specialized_fast_path');
    assert.equal(decomposeIntent.routeEnvelope.riskLevel, 'S2');
    assert.deepEqual(decomposeIntent.routeEnvelope.params, {
      executor: 'split_task',
      mode: 'by_floor',
      range: { from: 12, to: 17 },
    });
  });

  it('escalates ambiguous structural prompts instead of silently defaulting to deterministic', async () => {
    const clarifyIntent = await classifyMutationIntent({
      userMessage: 'Разбей это как лучше',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        route: 'clarify',
        intentFamily: 'structure',
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.32,
        riskLevel: 'S2',
        params: {},
        ambiguities: ['target_task', 'decomposition_mode'],
      })),
    });

    assert.equal(clarifyIntent.routeEnvelope.route, 'clarify');
    assert.notEqual(clarifyIntent.executionMode, 'deterministic');
    assert.deepEqual(clarifyIntent.routeEnvelope.ambiguities, ['target_task', 'decomposition_mode']);

    const agentIntent = await classifyMutationIntent({
      userMessage: 'Полностью переразложи весь график по двум бригадам и критическому пути',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        route: 'agent_path',
        intentFamily: 'planning',
        intentType: 'restructure_branch',
        confidence: 0.41,
        riskLevel: 'S3',
        params: {
          scope: 'whole_project',
        },
        ambiguities: ['resource_constraints'],
      })),
    });

    assert.equal(agentIntent.routeEnvelope.route, 'agent_path');
    assert.notEqual(agentIntent.executionMode, 'deterministic');

    const optimizationIntent = await classifyMutationIntent({
      userMessage: 'Оптимизируй график под две бригады и критический путь',
      env,
      semanticIntentQuery: buildSemanticIntentQuery(JSON.stringify({
        route: 'agent_path',
        intentFamily: 'planning',
        intentType: 'restructure_branch',
        confidence: 0.56,
        riskLevel: 'S3',
        params: {
          optimizationGoal: 'critical_path_and_crews',
        },
        ambiguities: [],
      })),
    });

    assert.equal(optimizationIntent.routeEnvelope.route, 'agent_path');
    assert.equal(optimizationIntent.routeEnvelope.riskLevel, 'S3');
    assert.equal(optimizationIntent.executionMode, 'full_agent');
  });
});

describe('mutation execution routing', () => {
  it('projects route classes into compatibility execution modes', () => {
    assert.equal(
      selectMutationExecutionMode({
        routeEnvelope: {
          route: 'fast_path',
          intentFamily: 'task_edit',
          intentType: 'add_single_task',
          confidence: 0.9,
          riskLevel: 'S1',
          params: {},
          ambiguities: [],
        },
        intentType: 'add_single_task',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: ['x'],
        requiresResolution: true,
        requiresSchedulingPlacement: true,
        executionMode: 'deterministic',
      }),
      'deterministic',
    );
    assert.equal(
      selectMutationExecutionMode({
        routeEnvelope: {
          route: 'specialized_fast_path',
          intentFamily: 'structure',
          intentType: 'decompose_task',
          confidence: 0.9,
          riskLevel: 'S2',
          params: { executor: 'split_task' },
          ambiguities: [],
        },
        intentType: 'decompose_task',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: ['x'],
        requiresResolution: true,
        requiresSchedulingPlacement: false,
        executionMode: 'deterministic',
      }),
      'hybrid',
    );
    assert.equal(
      selectMutationExecutionMode({
        routeEnvelope: {
          route: 'clarify',
          intentFamily: 'structure',
          intentType: 'unsupported_or_ambiguous',
          confidence: 0.4,
          riskLevel: 'S2',
          params: {},
          ambiguities: ['target_task'],
        },
        intentType: 'unsupported_or_ambiguous',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: ['x'],
        requiresResolution: false,
        requiresSchedulingPlacement: false,
        executionMode: 'deterministic',
      }),
      'full_agent',
    );
    assert.equal(
      selectMutationExecutionMode({
        routeEnvelope: {
          route: 'agent_path',
          intentFamily: 'planning',
          intentType: 'restructure_branch',
          confidence: 0.9,
          riskLevel: 'S3',
          params: {},
          ambiguities: [],
        },
        intentType: 'restructure_branch',
        confidence: 0.9,
        rawRequest: 'x',
        normalizedRequest: 'x',
        entitiesMentioned: [],
        requiresResolution: true,
        requiresSchedulingPlacement: true,
        executionMode: 'deterministic',
      }),
      'full_agent',
    );
  });
});
