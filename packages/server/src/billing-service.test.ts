import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BillingService, computeNextPeriodEnd } from './services/billing-service.js';
import type { ConstraintRemainingSnapshot, ConstraintUsageSnapshot } from './services/constraint-service.js';

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

describe('BillingService.getSubscriptionStatus', () => {
  it('derives compatibility AI fields from canonical usage snapshots instead of legacy subscription counters', async () => {
    const usageByKey: Record<string, ConstraintUsageSnapshot> = {
      projects: {
        planId: 'team',
        limitKey: 'projects',
        limit: 7,
        usageState: 'tracked',
        period: 'current',
        periodBucket: 'active_projects',
        used: 2,
      },
      ai_queries: {
        planId: 'team',
        limitKey: 'ai_queries',
        limit: 50,
        usageState: 'tracked',
        period: 'daily',
        periodBucket: 'day:2026-04-02',
        used: 11,
      },
      archive: {
        planId: 'team',
        limitKey: 'archive',
        limit: true,
        usageState: 'not_applicable',
        period: null,
        periodBucket: null,
        used: null,
      },
      resource_pool: {
        planId: 'team',
        limitKey: 'resource_pool',
        limit: true,
        usageState: 'not_applicable',
        period: null,
        periodBucket: null,
        used: null,
      },
      export: {
        planId: 'team',
        limitKey: 'export',
        limit: 'pdf_excel',
        usageState: 'not_applicable',
        period: null,
        periodBucket: null,
        used: null,
      },
    };
    const service = new BillingService({
      constraintService: {
        async getUsage(_userId, limitKey) {
          return usageByKey[limitKey];
        },
        async getRemaining(_userId, limitKey) {
          const usage = usageByKey[limitKey];
          if (usage.usageState !== 'tracked') {
            return {
              planId: usage.planId,
              limitKey: usage.limitKey,
              limit: usage.limit,
              remainingState: 'not_applicable' as const,
              remaining: null,
            } satisfies ConstraintRemainingSnapshot;
          }
          if (usage.limit === 'unlimited') {
            return {
              planId: usage.planId,
              limitKey: usage.limitKey,
              limit: usage.limit,
              remainingState: 'unlimited' as const,
              remaining: usage.limit,
            } satisfies ConstraintRemainingSnapshot;
          }
          return {
            planId: usage.planId,
            limitKey: usage.limitKey,
            limit: usage.limit,
            remainingState: 'tracked' as const,
            remaining: Math.max(usage.limit - usage.used, 0),
          } satisfies ConstraintRemainingSnapshot;
        },
        async incrementUsage() {
          throw new Error('incrementUsage should not be called in this test');
        },
      },
    });

    service.getOrCreateSubscription = async () => ({
      id: 'sub-1',
      userId: 'team-user',
      plan: 'team',
      aiUsed: 999,
      periodStart: null,
      periodEnd: new Date('2026-04-30T00:00:00.000Z'),
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const status = await service.getSubscriptionStatus('team-user');

    assert.equal(status.aiUsed, 11);
    assert.equal(status.aiLimit, 50);
    assert.equal(status.usage.ai_queries, usageByKey.ai_queries);
  });
});
