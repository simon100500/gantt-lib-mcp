import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TrialTriggerService } from './trial-trigger-service.js';

interface ProjectRow { id: string; userId: string; status: string }
interface UsageCounterRow { userId: string; limitKey: string; periodBucket: string; usage: number }

function createTriggerStub(overrides: {
  projects?: ProjectRow[];
  usageCounters?: UsageCounterRow[];
} = {}) {
  const projects = overrides.projects ?? [];
  const usageCounters = overrides.usageCounters ?? [];

  return {
    prisma: {
      project: {
        async findFirst(args: { where: { userId: string; status: string; tasks: { some: unknown } }; select: { id: true } }) {
          return projects.find(p => p.userId === args.where.userId && p.status === args.where.status) ?? null;
        },
      },
      usageCounter: {
        async aggregate(args: { _sum: { usage: true }; where: { userId: string; limitKey: string } }) {
          const total = usageCounters
            .filter(uc => uc.userId === args.where.userId && uc.limitKey === args.where.limitKey)
            .reduce((sum, uc) => sum + uc.usage, 0);
          return { _sum: { usage: total || null } };
        },
      },
    },
  };
}

describe('TrialTriggerService', () => {
  // T1: User with project+tasks and >= 3 AI queries returns shouldOffer=true, triggerType=ai_interactions
  it('returns shouldOffer=true with ai_interactions trigger for user with project and >=3 AI queries', async () => {
    const stub = createTriggerStub({
      projects: [{ id: 'p1', userId: 'user-1', status: 'active' }],
      usageCounters: [
        { userId: 'user-1', limitKey: 'ai_queries', periodBucket: '2026-04-05', usage: 5 },
      ],
    });
    const service = new TrialTriggerService({ prisma: stub.prisma as never });

    const result = await service.checkTriggerEligibility('user-1');

    assert.equal(result.shouldOffer, true);
    assert.equal(result.triggerType, 'ai_interactions');
  });

  // T2: User with project+tasks but < 3 AI queries returns shouldOffer=true with premium_feature_attempt trigger
  it('returns shouldOffer=true with premium_feature_attempt for user with project but <3 AI queries', async () => {
    const stub = createTriggerStub({
      projects: [{ id: 'p1', userId: 'user-1', status: 'active' }],
      usageCounters: [
        { userId: 'user-1', limitKey: 'ai_queries', periodBucket: '2026-04-05', usage: 1 },
      ],
    });
    const service = new TrialTriggerService({ prisma: stub.prisma as never });

    const result = await service.checkTriggerEligibility('user-1');

    assert.equal(result.shouldOffer, true);
    assert.equal(result.triggerType, 'premium_feature_attempt');
  });

  // T3: User without project with tasks returns shouldOffer=false
  it('returns shouldOffer=false for user without project with tasks', async () => {
    const stub = createTriggerStub({
      projects: [],
      usageCounters: [],
    });
    const service = new TrialTriggerService({ prisma: stub.prisma as never });

    const result = await service.checkTriggerEligibility('user-1');

    assert.equal(result.shouldOffer, false);
    assert.equal(result.triggerType, undefined);
  });

  // T4: User with project but no AI queries at all returns shouldOffer=true (premium_feature_attempt)
  it('returns shouldOffer=true with premium_feature_attempt when no AI usage counters exist', async () => {
    const stub = createTriggerStub({
      projects: [{ id: 'p1', userId: 'user-1', status: 'active' }],
      usageCounters: [],
    });
    const service = new TrialTriggerService({ prisma: stub.prisma as never });

    const result = await service.checkTriggerEligibility('user-1');

    assert.equal(result.shouldOffer, true);
    assert.equal(result.triggerType, 'premium_feature_attempt');
  });
});
