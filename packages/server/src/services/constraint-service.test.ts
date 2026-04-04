import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConstraintService, ConstraintServiceError } from './constraint-service.js';

interface StubSubscription {
  plan: string;
  billingState?: string;
  trialPlan?: string | null;
}

function createPrismaStub(subsByUser: Record<string, string | StubSubscription>) {
  const counters = new Map<string, { userId: string; limitKey: string; periodBucket: string; usage: number }>();
  const projectCounts = new Map<string, number>();

  function resolveSub(userId: string): StubSubscription | null {
    const raw = subsByUser[userId];
    if (!raw) return null;
    if (typeof raw === 'string') return { plan: raw };
    return raw;
  }

  return {
    projectCounts,
    counters,
    prisma: {
      subscription: {
        async findUnique({ where, select }: { where: { userId: string }; select?: { plan?: true; billingState?: true; trialPlan?: true } }) {
          const sub = resolveSub(where.userId);
          if (!sub) return null;

          const result: Record<string, unknown> = {};
          if (!select || select.plan) result.plan = sub.plan;
          if (select?.billingState) result.billingState = sub.billingState;
          if (select?.trialPlan) result.trialPlan = sub.trialPlan;
          return result as { plan: string; billingState?: string; trialPlan?: string | null };
        },
      },
      project: {
        async count({ where }: { where: { userId: string; status: string } }) {
          assert.equal(where.status, 'active');
          return projectCounts.get(where.userId) ?? 0;
        },
      },
      usageCounter: {
        async findUnique({ where }: { where: { userId_limitKey_periodBucket: { userId: string; limitKey: string; periodBucket: string } } }) {
          const key = `${where.userId_limitKey_periodBucket.userId}:${where.userId_limitKey_periodBucket.limitKey}:${where.userId_limitKey_periodBucket.periodBucket}`;
          return counters.get(key) ?? null;
        },
        async upsert({ where, create, update }: {
          where: { userId_limitKey_periodBucket: { userId: string; limitKey: string; periodBucket: string } };
          create: { userId: string; limitKey: string; periodBucket: string; usage: number };
          update: { usage: { increment: number } };
        }) {
          const key = `${where.userId_limitKey_periodBucket.userId}:${where.userId_limitKey_periodBucket.limitKey}:${where.userId_limitKey_periodBucket.periodBucket}`;
          const existing = counters.get(key);
          if (existing) {
            existing.usage += update.usage.increment;
            return existing;
          }
          const created = { ...create };
          counters.set(key, created);
          return created;
        },
      },
    },
  };
}

describe('ConstraintService', () => {
  it('returns lifetime AI usage for free plan users', async () => {
    const stub = createPrismaStub({ 'free-user': 'free' });
    stub.counters.set('free-user:ai_queries:lifetime', {
      userId: 'free-user',
      limitKey: 'ai_queries',
      periodBucket: 'lifetime',
      usage: 4,
    });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('free-user', 'ai_queries');

    assert.equal(usage.usageState, 'tracked');
    assert.equal(usage.period, 'lifetime');
    assert.equal(usage.periodBucket, 'lifetime');
    assert.equal(usage.limit, 20);
    assert.equal(usage.used, 4);
  });

  it('reads paid AI usage from the server-day bucket', async () => {
    const stub = createPrismaStub({ 'team-user': 'team' });
    stub.counters.set('team-user:ai_queries:day:2026-04-02', {
      userId: 'team-user',
      limitKey: 'ai_queries',
      periodBucket: 'day:2026-04-02',
      usage: 7,
    });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T08:30:00.000Z'),
    });

    const usage = await service.getUsage('team-user', 'ai_queries');

    assert.equal(usage.usageState, 'tracked');
    assert.equal(usage.period, 'daily');
    assert.equal(usage.periodBucket, 'day:2026-04-02');
    assert.equal(usage.limit, 50);
    assert.equal(usage.used, 7);
  });

  it('returns not_applicable for boolean feature gates without creating counters', async () => {
    const stub = createPrismaStub({ 'start-user': 'start' });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const remaining = await service.getRemaining('start-user', 'archive');

    assert.equal(remaining.remainingState, 'not_applicable');
    assert.equal(remaining.remaining, null);
    assert.equal(stub.counters.size, 0);
  });

  it('denies projects when active project count reaches the plan limit', async () => {
    const stub = createPrismaStub({ 'start-user': 'start' });
    stub.projectCounts.set('start-user', 3);
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const result = await service.checkLimit('start-user', 'projects');

    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, 'limit_reached');
    assert.equal(result.usage.usageState, 'tracked');
    assert.equal(result.remaining.remainingState, 'tracked');
    assert.equal(result.remaining.remaining, 0);
  });

  it('reads projects usage from the active project count query', async () => {
    const stub = createPrismaStub({ 'team-user': 'team' });
    stub.projectCounts.set('team-user', 5);
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('team-user', 'projects');

    assert.equal(usage.usageState, 'tracked');
    assert.equal(usage.period, 'current');
    assert.equal(usage.periodBucket, 'active_projects');
    assert.equal(usage.limit, 7);
    assert.equal(usage.used, 5);
  });

  it('reports unlimited remaining projects for enterprise users', async () => {
    const stub = createPrismaStub({ 'enterprise-user': 'enterprise' });
    stub.projectCounts.set('enterprise-user', 11);
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const remaining = await service.getRemaining('enterprise-user', 'projects');

    assert.equal(remaining.remainingState, 'unlimited');
    assert.equal(remaining.remaining, 'unlimited');
  });

  it('treats export as not_applicable usage with access-level metadata', async () => {
    const stub = createPrismaStub({ 'team-user': 'team' });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('team-user', 'export');

    assert.equal(usage.usageState, 'not_applicable');
    assert.equal(usage.limit, 'pdf_excel');
    assert.equal(usage.used, null);
  });

  it('increments daily AI usage atomically', async () => {
    const stub = createPrismaStub({ 'start-user': 'start' });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.incrementUsage('start-user', 'ai_queries', 2, new Date('2026-04-02T12:00:00.000Z'));

    assert.equal(usage.usageState, 'tracked');
    assert.equal(usage.periodBucket, 'day:2026-04-02');
    assert.equal(usage.used, 2);
    assert.equal(stub.counters.get('start-user:ai_queries:day:2026-04-02')?.usage, 2);
  });

  it('throws UNKNOWN_LIMIT_KEY for unknown limits', async () => {
    const stub = createPrismaStub({ 'free-user': 'free' });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    await assert.rejects(
      () => service.checkLimit('free-user', 'missing_key'),
      (error: unknown) => {
        assert.ok(error instanceof ConstraintServiceError);
        assert.equal(error.code, 'UNKNOWN_LIMIT_KEY');
        return true;
      },
    );
  });

  // Trial plan resolution tests

  it('resolves trial_active user with trialPlan=start as start plan', async () => {
    const stub = createPrismaStub({
      'trial-user': { plan: 'free', billingState: 'trial_active', trialPlan: 'start' },
    });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('trial-user', 'ai_queries');

    assert.equal(usage.planId, 'start');
    assert.equal(usage.limit, 25); // start plan daily AI limit
  });

  it('resolves trial_active user with null trialPlan as start plan by default', async () => {
    const stub = createPrismaStub({
      'trial-user': { plan: 'free', billingState: 'trial_active', trialPlan: null },
    });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('trial-user', 'ai_queries');

    assert.equal(usage.planId, 'start');
    assert.equal(usage.limit, 25);
  });

  it('non-trial user uses stored plan regardless of trialPlan field', async () => {
    const stub = createPrismaStub({
      'paid-user': { plan: 'team', billingState: 'paid_active', trialPlan: 'start' },
    });
    const service = new ConstraintService({
      prisma: stub.prisma as never,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    });

    const usage = await service.getUsage('paid-user', 'ai_queries');

    assert.equal(usage.planId, 'team');
    assert.equal(usage.limit, 50); // team plan daily AI limit
  });
});
