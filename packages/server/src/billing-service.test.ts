import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextPeriodEnd } from './services/billing-service.js';

describe('computeNextPeriodEnd', () => {
  it('extends an active monthly subscription from the current period end', () => {
    const now = new Date('2026-03-28T10:00:00.000Z');
    const currentPeriodEnd = new Date('2026-04-15T10:00:00.000Z');

    const nextPeriodEnd = computeNextPeriodEnd(currentPeriodEnd, now, 'monthly');

    assert.equal(nextPeriodEnd.toISOString(), '2026-05-16T10:00:00.000Z');
  });

  it('starts from now when the current subscription is expired', () => {
    const now = new Date('2026-03-28T10:00:00.000Z');
    const currentPeriodEnd = new Date('2026-03-01T10:00:00.000Z');

    const nextPeriodEnd = computeNextPeriodEnd(currentPeriodEnd, now, 'yearly');

    assert.equal(nextPeriodEnd.toISOString(), '2027-03-28T10:00:00.000Z');
  });
});
