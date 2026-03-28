/**
 * Billing service — business logic for payments, subscriptions, and plan management
 *
 * Uses Prisma (PostgreSQL) for all database operations.
 */

import { getPrisma } from '@gantt/mcp/prisma';
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
  async getSubscriptionStatus(userId: string): Promise<{
    plan: PlanKey;
    periodEnd: string | null;
    aiUsed: number;
    aiLimit: number;
    isActive: boolean;
  }> {
    const sub = await this.getOrCreateSubscription(userId);
    const limits = getPlanLimits(sub.plan as PlanKey);
    const active = isPlanActive(sub.periodEnd?.toISOString() ?? null);

    return {
      plan: sub.plan as PlanKey,
      periodEnd: sub.periodEnd?.toISOString() ?? null,
      aiUsed: sub.aiUsed,
      aiLimit: limits.aiGenerations,
      isActive: active,
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
    const prisma = getPrisma();

    const sub = await prisma.subscription.update({
      where: { userId },
      data: { aiUsed: { increment: 1 } },
    });

    const plan = sub.plan as PlanKey;
    return { used: sub.aiUsed, limit: getPlanLimits(plan).aiGenerations };
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
