/**
 * Billing service — business logic for payments, subscriptions, and plan management
 *
 * Uses Prisma (PostgreSQL) for all database operations.
 */

import { getPrisma } from '@gantt/mcp/prisma';
import { PLAN_CATALOG, type LimitKey, type PlanId } from '@gantt/mcp/constraints';
import { ConstraintService, type ConstraintUsageSnapshot } from './constraint-service.js';
import { getPlanLimits, isPlanActive, type PlanKey } from './plan-config.js';

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
  private readonly constraintService = new ConstraintService();
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
    const active = isPlanActive(sub.periodEnd?.toISOString() ?? null);
    const projectsUsage = await this.constraintService.getUsage(userId, 'projects');
    const aiUsage = await this.constraintService.getUsage(userId, 'ai_queries');
    const archiveUsage = await this.constraintService.getUsage(userId, 'archive');
    const resourcePoolUsage = await this.constraintService.getUsage(userId, 'resource_pool');
    const exportUsage = await this.constraintService.getUsage(userId, 'export');

    return {
      plan,
      periodEnd: sub.periodEnd?.toISOString() ?? null,
      aiUsed: aiUsage.usageState === 'tracked' ? aiUsage.used : 0,
      aiLimit: aiUsage.usageState === 'tracked' && typeof aiUsage.limit === 'number' ? aiUsage.limit : 0,
      isActive: active,
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
      usage: {
        projects: projectsUsage,
        ai_queries: aiUsage,
        archive: archiveUsage,
        resource_pool: resourcePoolUsage,
        export: exportUsage,
      },
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
