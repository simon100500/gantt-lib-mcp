/**
 * Billing service — business logic for payments, subscriptions, and plan management
 *
 * Uses Prisma (PostgreSQL) for all database operations.
 */

import { getPrisma } from '@gantt/mcp/prisma';
import { PLAN_CATALOG, type LimitKey, type PlanId } from '@gantt/mcp/constraints';
import { ConstraintService, type ConstraintUsageSnapshot } from './constraint-service.js';
import { getPlanLimits, isPlanActive, type PlanKey } from './plan-config.js';
import { TrialService } from './trial-service.js';

export interface PaymentRow {
  id: string;
  user_id: string;
  plan: string;
  period: string;
  amount: number;
  yookassa_payment_id: string;
  status: string;
  created_at: string;
}

export interface BillingSubscriptionStatus {
  plan: PlanId;
  periodEnd: string | null;
  billingState: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialSource: string | null;
  aiUsed: number;
  aiLimit: number;
  isActive: boolean;
  planMeta: {
    id: PlanId;
    label: string;
    pricing: {
      monthly: number;
      yearly: number;
    };
  };
  limits: Record<LimitKey, unknown>;
  usage: Record<LimitKey, ConstraintUsageSnapshot>;
}

export interface BillingUsageStatus {
  plan: PlanId;
  planMeta: BillingSubscriptionStatus['planMeta'];
  limits: BillingSubscriptionStatus['limits'];
  usage: BillingSubscriptionStatus['usage'];
  remaining: Record<LimitKey, Awaited<ReturnType<ConstraintService['getRemaining']>>>;
}

interface BillingServiceDeps {
  constraintService?: Pick<ConstraintService, 'getUsage' | 'getRemaining' | 'incrementUsage'>;
}

export function computeNextPeriodEnd(
  currentPeriodEnd: Date | null | undefined,
  now: Date,
  period: 'monthly' | 'yearly',
): Date {
  const periodDays = period === 'monthly' ? 31 : 365;
  const baseDate = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
    ? currentPeriodEnd
    : now;

  return new Date(baseDate.getTime() + periodDays * 24 * 60 * 60 * 1000);
}

export class BillingService {
  private readonly constraintService: Pick<ConstraintService, 'getUsage' | 'getRemaining' | 'incrementUsage'>;

  constructor(deps: BillingServiceDeps = {}) {
    this.constraintService = deps.constraintService ?? new ConstraintService();
  }
  /**
   * Get or create a subscription for the user.
   * If no subscription exists, creates one with plan='free'.
   */
  async getOrCreateSubscription(userId: string) {
    const prisma = getPrisma();

    const sub = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (sub) return sub;

    return prisma.subscription.create({
      data: { userId, plan: 'free', aiUsed: 0 },
    });
  }

  /**
   * Get subscription status with computed fields.
   */
  async getSubscriptionStatus(userId: string): Promise<BillingSubscriptionStatus> {
    const sub = await this.getOrCreateSubscription(userId);
    const plan = sub.plan as PlanId;
    const billingState = (sub as Record<string, unknown>).billingState as string | undefined;
    const effectiveBillingState = billingState ?? 'free';
    const isTrialActive = effectiveBillingState === 'trial_active';
    const active = isTrialActive || isPlanActive(sub.periodEnd?.toISOString() ?? null);
    const usageStatus = await this.getUsageStatus(userId, plan);
    const aiUsage = usageStatus.usage.ai_queries;

    return {
      plan,
      periodEnd: sub.periodEnd?.toISOString() ?? null,
      billingState: effectiveBillingState,
      trialStartedAt: ((sub as Record<string, unknown>).trialStartedAt as Date | undefined)?.toISOString() ?? null,
      trialEndsAt: ((sub as Record<string, unknown>).trialEndsAt as Date | undefined)?.toISOString() ?? null,
      trialSource: ((sub as Record<string, unknown>).trialSource as string | null | undefined) ?? null,
      aiUsed: aiUsage.usageState === 'tracked' ? aiUsage.used : 0,
      aiLimit: aiUsage.usageState === 'tracked' && typeof aiUsage.limit === 'number' ? aiUsage.limit : 0,
      isActive: active,
      planMeta: usageStatus.planMeta,
      limits: usageStatus.limits,
      usage: usageStatus.usage,
    };
  }

  async getUsageStatus(userId: string, planOverride?: PlanId): Promise<BillingUsageStatus> {
    const plan = planOverride ?? ((await this.getOrCreateSubscription(userId)).plan as PlanId);
    const limitKeys: LimitKey[] = ['projects', 'ai_queries', 'archive', 'resource_pool', 'export'];
    const usageEntries = await Promise.all(limitKeys.map(async (limitKey) => (
      [limitKey, await this.constraintService.getUsage(userId, limitKey)] as const
    )));
    const remainingEntries = await Promise.all(limitKeys.map(async (limitKey) => (
      [limitKey, await this.constraintService.getRemaining(userId, limitKey)] as const
    )));

    return {
      plan,
      planMeta: {
        id: plan,
        label: PLAN_CATALOG[plan].label,
        pricing: PLAN_CATALOG[plan].pricing,
      },
      limits: {
        projects: PLAN_CATALOG[plan].limits.projects,
        ai_queries: PLAN_CATALOG[plan].limits.ai_queries,
        archive: PLAN_CATALOG[plan].limits.archive,
        resource_pool: PLAN_CATALOG[plan].limits.resource_pool,
        export: PLAN_CATALOG[plan].limits.export,
      },
      usage: Object.fromEntries(usageEntries) as BillingSubscriptionStatus['usage'],
      remaining: Object.fromEntries(remainingEntries) as BillingUsageStatus['remaining'],
    };
  }

  /**
   * Apply a plan to a user's subscription.
   * One-time payment model (D-01): monthly=31 days, yearly=365 days.
   * AI counter is reset on plan purchase (D-08).
   */
  async applyPlan(userId: string, plan: PlanKey, period: 'monthly' | 'yearly'): Promise<void> {
    const prisma = getPrisma();
    const sub = await this.getOrCreateSubscription(userId);
    const now = new Date();
    const periodEnd = computeNextPeriodEnd(sub.periodEnd, now, period);

    await prisma.subscription.update({
      where: { userId },
      data: {
        plan,
        periodStart: now,
        periodEnd,
        // Legacy compatibility field; canonical AI usage comes from ConstraintService.
        aiUsed: 0,
      },
    });
  }

  /**
   * Increment AI usage counter. Returns current used/limit.
   */
  async incrementAiUsage(userId: string): Promise<{ used: number; limit: number }> {
    const usage = await this.constraintService.incrementUsage(userId, 'ai_queries');
    return {
      used: usage.usageState === 'tracked' ? usage.used : 0,
      limit: usage.usageState === 'tracked' && typeof usage.limit === 'number' ? usage.limit : 0,
    };
  }

  /**
   * Create a payment record in the database.
   */
  async createPaymentRecord(
    userId: string,
    plan: PlanKey,
    period: 'monthly' | 'yearly',
    amount: number,
    yookassaPaymentId: string,
  ): Promise<PaymentRow> {
    const prisma = getPrisma();

    const payment = await prisma.payment.create({
      data: {
        userId,
        plan,
        period,
        amount,
        yookassaPaymentId,
      },
    });

    return {
      id: payment.id,
      user_id: payment.userId,
      plan: payment.plan,
      period: payment.period,
      amount: payment.amount,
      yookassa_payment_id: payment.yookassaPaymentId,
      status: payment.status,
      created_at: payment.createdAt.toISOString(),
    };
  }

  /**
   * Mark a payment as succeeded by YooKassa payment ID.
   */
  async markPaymentSucceeded(yookassaPaymentId: string): Promise<PaymentRow | null> {
    const prisma = getPrisma();

    const payment = await prisma.payment.update({
      where: { yookassaPaymentId },
      data: { status: 'succeeded' },
    }).catch(() => null);

    if (!payment) return null;

    return {
      id: payment.id,
      user_id: payment.userId,
      plan: payment.plan,
      period: payment.period,
      amount: payment.amount,
      yookassa_payment_id: payment.yookassaPaymentId,
      status: payment.status,
      created_at: payment.createdAt.toISOString(),
    };
  }

  async getPaymentByYookassaPaymentId(yookassaPaymentId: string): Promise<PaymentRow | null> {
    const prisma = getPrisma();

    const payment = await prisma.payment.findUnique({
      where: { yookassaPaymentId },
    });

    if (!payment) return null;

    return {
      id: payment.id,
      user_id: payment.userId,
      plan: payment.plan,
      period: payment.period,
      amount: payment.amount,
      yookassa_payment_id: payment.yookassaPaymentId,
      status: payment.status,
      created_at: payment.createdAt.toISOString(),
    };
  }

  /**
   * Get payment history for a user, most recent first.
   */
  async getPaymentHistory(userId: string): Promise<PaymentRow[]> {
    const prisma = getPrisma();

    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      user_id: p.userId,
      plan: p.plan,
      period: p.period,
      amount: p.amount,
      yookassa_payment_id: p.yookassaPaymentId,
      status: p.status,
      created_at: p.createdAt.toISOString(),
    }));
  }

  /**
   * Check if a payment has already been processed (for webhook idempotency).
   */
  async isPaymentProcessed(yookassaPaymentId: string): Promise<boolean> {
    const prisma = getPrisma();

    const count = await prisma.payment.count({
      where: {
        yookassaPaymentId,
        status: 'succeeded',
      },
    });

    return count > 0;
  }
}

/**
 * Find all expired trial_active subscriptions and roll them back to free.
 * Can be called from a cron job, interval timer, or middleware.
 * Returns the number of expired trials that were rolled back.
 */
export async function checkAndRollExpiredTrials(): Promise<number> {
  const prisma = getPrisma();
  const trialService = new TrialService();
  const now = new Date();

  const expiredTrials = await prisma.subscription.findMany({
    where: {
      billingState: 'trial_active',
      trialEndsAt: { lt: now },
    },
    select: { userId: true },
  });

  for (const trial of expiredTrials) {
    await trialService.rollbackTrialToFree(trial.userId, {
      actorType: 'system',
      reason: 'Trial expired automatically',
    });
  }

  return expiredTrials.length;
}
