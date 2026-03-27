/**
 * Billing service — business logic for payments, subscriptions, and plan management
 *
 * Uses getDb() from @gantt/mcp/db for all database operations.
 */

import { getDb } from '../db.js';
import { getPlanLimits, isPlanActive, type PlanKey } from './plan-config.js';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: string;
  period_start: string | null;
  period_end: string | null;
  ai_used: number;
  created_at: string;
}

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

export class BillingService {
  /**
   * Get or create a subscription for the user.
   * If no subscription exists, creates one with plan='free'.
   */
  async getOrCreateSubscription(userId: string): Promise<SubscriptionRow> {
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });

    if (result.rows.length > 0) {
      return result.rows[0] as unknown as SubscriptionRow;
    }

    // Create free subscription
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO subscriptions (id, user_id, plan, period_start, period_end, ai_used, created_at)
            VALUES (?, ?, 'free', NULL, NULL, 0, ?)`,
      args: [id, userId, now],
    });

    return {
      id,
      user_id: userId,
      plan: 'free',
      period_start: null,
      period_end: null,
      ai_used: 0,
      created_at: now,
    };
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
    const active = isPlanActive(sub.period_end);

    return {
      plan: sub.plan as PlanKey,
      periodEnd: sub.period_end,
      aiUsed: sub.ai_used,
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
    const db = await getDb();
    const now = new Date();
    const periodDays = period === 'monthly' ? 31 : 365;
    const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000).toISOString();

    await db.execute({
      sql: `UPDATE subscriptions
            SET plan = ?, period_start = ?, period_end = ?, ai_used = 0
            WHERE user_id = ?`,
      args: [plan, now.toISOString(), periodEnd, userId],
    });
  }

  /**
   * Increment AI usage counter. Returns current used/limit.
   */
  async incrementAiUsage(userId: string): Promise<{ used: number; limit: number }> {
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE subscriptions SET ai_used = ai_used + 1 WHERE user_id = ?',
      args: [userId],
    });

    const result = await db.execute({
      sql: 'SELECT plan, ai_used FROM subscriptions WHERE user_id = ?',
      args: [userId],
    });

    const row = result.rows[0];
    if (!row) return { used: 0, limit: 0 };

    const plan = String(row['plan'] ?? 'free') as PlanKey;
    const used = Number(row['ai_used'] ?? 0);
    const limit = getPlanLimits(plan).aiGenerations;

    return { used, limit };
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
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO payments (id, user_id, plan, period, amount, yookassa_payment_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      args: [id, userId, plan, period, amount, yookassaPaymentId, now],
    });

    return {
      id,
      user_id: userId,
      plan,
      period,
      amount,
      yookassa_payment_id: yookassaPaymentId,
      status: 'pending',
      created_at: now,
    };
  }

  /**
   * Mark a payment as succeeded by YooKassa payment ID.
   */
  async markPaymentSucceeded(yookassaPaymentId: string): Promise<PaymentRow | null> {
    const db = await getDb();
    await db.execute({
      sql: "UPDATE payments SET status = 'succeeded' WHERE yookassa_payment_id = ?",
      args: [yookassaPaymentId],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM payments WHERE yookassa_payment_id = ?',
      args: [yookassaPaymentId],
    });

    if (result.rows.length === 0) return null;
    return result.rows[0] as unknown as PaymentRow;
  }

  /**
   * Get payment history for a user, most recent first.
   */
  async getPaymentHistory(userId: string): Promise<PaymentRow[]> {
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });

    return result.rows as unknown as PaymentRow[];
  }

  /**
   * Check if a payment has already been processed (for webhook idempotency).
   */
  async isPaymentProcessed(yookassaPaymentId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.execute({
      sql: "SELECT 1 FROM payments WHERE yookassa_payment_id = ? AND status = 'succeeded'",
      args: [yookassaPaymentId],
    });
    return result.rows.length > 0;
  }
}
