import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TrialService } from './trial-service.js';
import type { BillingState } from './trial-service.js';

interface SubscriptionRow {
  id: string;
  userId: string;
  plan: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  aiUsed: number;
  createdAt: Date;
  billingState: BillingState;
  trialPlan: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialEndedAt: Date | null;
  trialSource: 'self_serve' | 'admin' | 'promo' | null;
  trialConvertedAt: Date | null;
  rolledBackAt: Date | null;
}

interface BillingEventRow {
  userId: string;
  actorType: string;
  actorId?: string;
  previousState: string | null;
  newState: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

function createSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    userId: 'user-1',
    plan: 'free',
    periodStart: null,
    periodEnd: null,
    aiUsed: 0,
    createdAt: new Date('2026-01-01'),
    billingState: 'free' as BillingState,
    trialPlan: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialEndedAt: null,
    trialSource: null,
    trialConvertedAt: null,
    rolledBackAt: null,
    ...overrides,
  };
}

function createPrismaStub(subscriptions: Map<string, SubscriptionRow>) {
  const billingEvents: BillingEventRow[] = [];
  const projectCounts = new Map<string, number>();

  return {
    billingEvents,
    projectCounts,
    subscriptions,
    prisma: {
      subscription: {
        async findUnique({ where }: { where: { userId: string } }) {
          return subscriptions.get(where.userId) ?? null;
        },
        async create({ data }: { data: { userId: string; plan: string; aiUsed: number } }) {
          const sub = createSubscription({ id: 'sub-new', userId: data.userId, plan: data.plan, aiUsed: data.aiUsed });
          subscriptions.set(data.userId, sub);
          return sub;
        },
        async update({ where, data }: { where: { userId: string }; data: Partial<SubscriptionRow> }) {
          const sub = subscriptions.get(where.userId);
          if (!sub) throw new Error('Subscription not found');
          Object.assign(sub, data);
          return sub;
        },
      },
      billingEvent: {
        async create({ data }: { data: BillingEventRow }) {
          billingEvents.push(data);
        },
      },
      project: {
        async count({ where }: { where: { userId: string; status: string } }) {
          return projectCounts.get(where.userId) ?? 0;
        },
      },
    },
  };
}

describe('TrialService', () => {
  const now = new Date('2026-04-05T12:00:00.000Z');

  // T1: startTrial sets billingState=trial_active, plan=start, trialEndsAt=now+14d, records event
  it('starts a 14-day trial for a free user', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({ userId: 'user-1' })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.startTrial('user-1', { source: 'self_serve' });

    assert.equal(result.billingState, 'trial_active');
    const expectedEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    assert.equal(result.trialEndsAt.getTime(), expectedEnd.getTime());

    const sub = subs.get('user-1')!;
    assert.equal(sub.billingState, 'trial_active');
    assert.equal(sub.plan, 'start');
    assert.equal(sub.trialStartedAt!.getTime(), now.getTime());
    assert.equal(sub.trialSource, 'self_serve');

    assert.equal(stub.billingEvents.length, 1);
    assert.equal(stub.billingEvents[0].previousState, 'free');
    assert.equal(stub.billingEvents[0].newState, 'trial_active');
    assert.equal(stub.billingEvents[0].actorType, 'self_serve');
  });

  // T2: startTrial rejects if user already had trial (trialStartedAt not null)
  it('rejects startTrial if user already had a trial', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'free' as BillingState,
      trialStartedAt: new Date('2026-01-01'),
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    await assert.rejects(
      () => service.startTrial('user-1', { source: 'self_serve' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /already/i);
        return true;
      },
    );
  });

  // T3: startTrial rejects if user not free (billingState != free)
  it('rejects startTrial if user is not in free state', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'paid_active' as BillingState,
      plan: 'start',
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    await assert.rejects(
      () => service.startTrial('user-1', { source: 'self_serve' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /free/i);
        return true;
      },
    );
  });

  // T4: endTrialNow sets billingState=trial_expired, records event
  it('ends an active trial immediately', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_active' as BillingState,
      plan: 'start',
      trialStartedAt: new Date('2026-04-01'),
      trialEndsAt: new Date('2026-04-15'),
      trialSource: 'self_serve',
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.endTrialNow('user-1');

    assert.equal(result.billingState, 'trial_expired');
    const sub = subs.get('user-1')!;
    assert.equal(sub.billingState, 'trial_expired');
    assert.equal(sub.trialEndedAt!.getTime(), now.getTime());

    assert.equal(stub.billingEvents.length, 1);
    assert.equal(stub.billingEvents[0].previousState, 'trial_active');
    assert.equal(stub.billingEvents[0].newState, 'trial_expired');
  });

  // T5: endTrialNow rejects if not trial_active
  it('rejects endTrialNow if user is not in trial_active state', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'free' as BillingState,
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    await assert.rejects(
      () => service.endTrialNow('user-1'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /trial_active/i);
        return true;
      },
    );
  });

  // T6: rollbackTrialToFree sets plan=free, rolledBackAt, returns overLimitProjects
  it('rolls back trial to free with over-limit project count', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_active' as BillingState,
      plan: 'start',
      trialStartedAt: new Date('2026-04-01'),
      trialEndsAt: new Date('2026-04-15'),
      trialSource: 'self_serve',
    })]]);
    const stub = createPrismaStub(subs);
    // Free plan allows 1 project; user has 3 active
    stub.projectCounts.set('user-1', 3);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.rollbackTrialToFree('user-1');

    assert.equal(result.billingState, 'trial_expired');
    // Free limit is 1 project, user has 3, so overLimit = 2
    assert.equal(result.overLimitProjects, 2);

    const sub = subs.get('user-1')!;
    assert.equal(sub.plan, 'free');
    assert.equal(sub.rolledBackAt!.getTime(), now.getTime());
    assert.equal(sub.periodStart, null);
    assert.equal(sub.periodEnd, null);

    assert.equal(stub.billingEvents.length, 1);
    assert.equal(stub.billingEvents[0].previousState, 'trial_active');
    assert.equal(stub.billingEvents[0].newState, 'trial_expired');
  });

  // T7: extendTrial adds days to trialEndsAt
  it('extends trial by N days', async () => {
    const trialEndsAt = new Date('2026-04-15T12:00:00.000Z');
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_active' as BillingState,
      plan: 'start',
      trialStartedAt: new Date('2026-04-01'),
      trialEndsAt,
      trialSource: 'self_serve',
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.extendTrial('user-1', 3);

    const expectedEnd = new Date(trialEndsAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    assert.equal(result.trialEndsAt.getTime(), expectedEnd.getTime());

    assert.equal(stub.billingEvents.length, 1);
    assert.equal(stub.billingEvents[0].newState, 'trial_active');
  });

  // T8: extendTrial rejects if not trial_active
  it('rejects extendTrial if user is not in trial_active state', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_expired' as BillingState,
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    await assert.rejects(
      () => service.extendTrial('user-1', 3),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /trial_active/i);
        return true;
      },
    );
  });

  // T9: convertTrialToPaid sets paid_active and applies plan
  it('converts trial to paid plan', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_active' as BillingState,
      plan: 'start',
      trialStartedAt: new Date('2026-04-01'),
      trialEndsAt: new Date('2026-04-15'),
      trialSource: 'self_serve',
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.convertTrialToPaid('user-1', {
      paidPlan: 'start',
      period: 'monthly',
    });

    assert.equal(result.billingState, 'paid_active');

    const sub = subs.get('user-1')!;
    assert.equal(sub.billingState, 'paid_active');
    assert.equal(sub.trialConvertedAt!.getTime(), now.getTime());
    assert.ok(sub.periodStart);
    assert.ok(sub.periodEnd);

    assert.equal(stub.billingEvents.length, 1);
    assert.equal(stub.billingEvents[0].previousState, 'trial_active');
    assert.equal(stub.billingEvents[0].newState, 'paid_active');
  });

  // T10: checkTrialEligibility returns eligible for free user without trial
  it('returns eligible for free user without prior trial', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({ userId: 'user-1' })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.checkTrialEligibility('user-1');

    assert.equal(result.eligible, true);
    assert.equal(result.reason, undefined);
  });

  // T11: checkTrialEligibility returns not eligible for user with prior trial
  it('returns not eligible for user with prior trial', async () => {
    const subs = new Map<string, SubscriptionRow>([['user-1', createSubscription({
      userId: 'user-1',
      billingState: 'trial_expired' as BillingState,
      trialStartedAt: new Date('2026-01-01'),
      trialEndedAt: new Date('2026-01-15'),
    })]]);
    const stub = createPrismaStub(subs);
    const service = new TrialService({
      prisma: stub.prisma as never,
      now: () => now,
    });

    const result = await service.checkTrialEligibility('user-1');

    assert.equal(result.eligible, false);
    assert.ok(result.reason);
  });
});
