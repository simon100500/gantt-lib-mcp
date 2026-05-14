import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { looksLikeReferenceRequest } from './agent/reference-pipeline.js';

describe('reference pipeline detection', () => {
  it('detects explicit how-to and help requests', () => {
    assert.equal(looksLikeReferenceRequest('как добавить задачу?'), true);
    assert.equal(looksLikeReferenceRequest('подскажи, как сохранить шаблон'), true);
    assert.equal(looksLikeReferenceRequest('что умеет AI-ассистент?'), true);
    assert.equal(looksLikeReferenceRequest('can I export to Excel?'), true);
  });

  it('does not classify direct mutation commands as reference requests', () => {
    assert.equal(looksLikeReferenceRequest('добавь задачу приемка'), false);
    assert.equal(looksLikeReferenceRequest('сдвинь штукатурку на 2 дня'), false);
    assert.equal(looksLikeReferenceRequest('свяжи две задачи'), false);
  });
});
