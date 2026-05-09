import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeInitialRequest } from './intake-normalization.js';
import { assessExplicitWorklistIntent } from './worklist-policy.js';

describe('explicit worklist intent assessment', () => {
  it('treats per-item date ranges as strong strict-worklist evidence', () => {
    const userMessage = [
      'Раздел 1. Сваи (Секция 1В) – 01.07.2025 – 31.08.2025',
      'Раздел 2. Подвал (Секция 1В) – 01.09.2025 – 31.10.2025',
      'Раздел 3. Каркас (Секция 1В) – 01.11.2025 – 30.11.2025',
    ].join('\n');

    const assessment = assessExplicitWorklistIntent({
      userMessage,
      normalizedRequest: normalizeInitialRequest(userMessage),
    });

    assert.equal(assessment.isStrict, true);
    assert.equal(assessment.probability >= 0.8, true);
  });

  it('keeps a standalone task list likely strict even without an explicit directive', () => {
    const userMessage = [
      '1. Демонтаж кровли',
      '2. Демонтаж окон',
      '3. Демонтаж витражей',
      '4. Демонтаж металлокаркаса',
    ].join('\n');

    const assessment = assessExplicitWorklistIntent({
      userMessage,
      normalizedRequest: normalizeInitialRequest(userMessage),
    });

    assert.equal(assessment.isStrict, true);
    assert.equal(assessment.probability >= 0.54, true);
  });

  it('keeps broad directional lists below the strict threshold', () => {
    const userMessage = [
      'Нужен стартовый график проекта, можно взять за основу такие направления:',
      '- Фундамент',
      '- Коробка',
      '- Инженерия',
      '- Отделка',
    ].join('\n');

    const assessment = assessExplicitWorklistIntent({
      userMessage,
      normalizedRequest: normalizeInitialRequest(userMessage),
    });

    assert.equal(assessment.isStrict, false);
    assert.equal(assessment.probability < 0.54, true);
  });
});
