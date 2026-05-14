import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOfftopicFoolResponse,
  classifyReferenceIntent,
  parseReferenceIntentDecision,
} from './agent/reference-pipeline.js';

describe('reference pipeline decision', () => {
  it('parses reference_help decisions from strict JSON', () => {
    const result = parseReferenceIntentDecision('{"route":"reference_help","confidence":0.92,"signals":["help_request","how_to"]}');
    assert.equal(result.route, 'reference_help');
    assert.equal(result.usedModelDecision, true);
    assert.deepEqual(result.signals, ['help_request', 'how_to']);
  });

  it('falls back to product_action when classifier query fails', async () => {
    const result = await classifyReferenceIntent({
      userMessage: 'что-то странное',
      recentConversationSummary: 'none',
      taskCount: 12,
      hasHierarchy: true,
      model: 'test-model',
      query: async () => {
        throw new Error('network failed');
      },
    });

    assert.equal(result.route, 'product_action');
    assert.equal(result.usedModelDecision, false);
    assert.equal(result.fallbackReason, 'query_failed');
  });

  it('builds a soft off-topic response that redirects to product capabilities', () => {
    const response = buildOfftopicFoolResponse('кто сильнее, слон или кит?');
    assert.match(response, /график|задач|шаблон|ресурс/i);
    assert.doesNotMatch(response, /оскорб/i);
  });
});
