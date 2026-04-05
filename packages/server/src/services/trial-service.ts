/**
 * TrialService — manages trial billing lifecycle with full audit trail.
 *
 * Operations: startTrial, endTrialNow, rollbackTrialToFree, extendTrial,
 * convertTrialToPaid, checkTrialEligibility.
 */

import { Prisma } from '@gantt/mcp/prisma';
import type { PrismaClient } from '@gantt/mcp/prisma';
import { computeNextPeriodEnd } from './billing-service.js';

/** Mirrors the Prisma BillingState enum values. Keep in sync with schema.prisma. */
export type BillingState = 'free' | 'trial_active' | 'trial_expired' | 'paid_active' | 'paid_expired';

export interface TrialStartOptions {
  trialPlan?: 'start';  // Always start for v1
  durationDays?: number; // Default 14
  source: 'self_serve' | 'admin' | 'promo';
  actorId?: string;
  reason?: string;
}

export interface TrialActionOptions {
  actorId?: string;
  reason?: string;
}

export interface TrialConvertOptions {
  paidPlan: 'start' | 'team' | 'enterprise';
  period: 'monthly' | 'yearly';
  actorId?: string;
  reason?: string;
}

export interface TrialEligibility {
  eligible: boolean;
  reason?: string;
}

export interface RollbackResult {
  overLimitProjects: number;
  billingState: BillingState;
  archivedProjectIds: string[];
}

// Free plan project limit (from catalog: free plan = 1 project)
const FREE_PROJECT_LIMIT = 1;

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

interface ProjectRow {
  id: string;
  createdAt: Date;
}

type TrialServicePrisma = Pick<PrismaClient, 'subscription' | 'billingEvent' | 'project'>;

interface BillingEventData {
  userId: string;
  actorType: string;
  actorId?: string;
  previousState: string | null;
  newState: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
}

interface TrialServiceDeps {
  prisma?: TrialServicePrisma;
  now?: () => Date;
}

export class TrialService {
  private prisma?: TrialServicePrisma;
  private readonly now: () => Date;
  private readonly _providedPrisma: TrialServicePrisma | undefined;

  constructor(deps: TrialServiceDeps = {}) {
    this._providedPrisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
  }

  private async getPrisma(): Promise<TrialServicePrisma> {
    if (this._providedPrisma) return this._providedPrisma;
    if (!this.prisma) this.prisma = await getDefaultPrisma();
    return this.prisma;
  }

  async startTrial(
    userId: string,
    opts: TrialStartOptions,
  ): Promise<{ billingState: BillingState; trialEndsAt: Date }> {
    const sub = await this.getSubscription(userId);
    const now = this.now();

    if (sub.billingState !== 'free') {
      throw new Error(`Cannot start trial: user is not in free state (current: ${sub.billingState})`);
    }
    if (sub.trialStartedAt !== null) {
      throw new Error('Cannot start trial: user already had a trial');
    }

    const previousState = sub.billingState;
    const durationDays = opts.durationDays ?? 14;
    const trialEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const trialPlan = opts.trialPlan ?? 'start';

    await (await this.getPrisma()).subscription.update({
      where: { userId },
      data: {
        plan: trialPlan,
        billingState: 'trial_active',
        trialPlan,
        trialStartedAt: now,
        trialEndsAt,
        trialSource: opts.source,
      } as Partial<SubscriptionRow>,
    });

    await this.recordBillingEvent({
      userId,
      actorType: opts.source,
      actorId: opts.actorId,
      previousState,
      newState: 'trial_active',
      reason: opts.reason,
      metadata: { trialPlan, durationDays },
    });

    return { billingState: 'trial_active', trialEndsAt };
  }

  async endTrialNow(
    userId: string,
    opts: TrialActionOptions = {},
  ): Promise<{ billingState: BillingState; overLimitProjects: number; archivedProjectIds: string[] }> {
    const sub = await this.getSubscription(userId);
    const now = this.now();

    if (sub.billingState !== 'trial_active') {
      throw new Error(`Cannot end trial: user is not in trial_active state (current: ${sub.billingState})`);
    }

    const previousState = sub.billingState;

    // Step 1: Set trial_expired state
    await (await this.getPrisma()).subscription.update({
      where: { userId },
      data: {
        billingState: 'trial_expired',
        trialEndedAt: now,
      } as Partial<SubscriptionRow>,
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState,
      newState: 'trial_expired',
      reason: opts.reason,
    });

    // Step 2: Auto-rollback to free with project archiving
    const rollbackResult = await this.rollbackTrialToFree(userId, {
      actorId: opts.actorId,
      reason: opts.reason ?? 'Auto-rollback after trial end',
    });

    return {
      billingState: rollbackResult.billingState,
      overLimitProjects: rollbackResult.overLimitProjects,
      archivedProjectIds: rollbackResult.archivedProjectIds,
    };
  }

  async rollbackTrialToFree(
    userId: string,
    opts: TrialActionOptions = {},
  ): Promise<RollbackResult> {
    const sub = await this.getSubscription(userId);
    const now = this.now();

    if (sub.billingState !== 'trial_active' && sub.billingState !== 'trial_expired') {
      throw new Error(
        `Cannot rollback: user is not in trial state (current: ${sub.billingState})`,
      );
    }

    const previousState = sub.billingState;
    const newState: BillingState = previousState === 'trial_active' ? 'trial_expired' : 'free';

    // Count active projects to determine over-limit count
    const activeProjects = await (await this.getPrisma()).project.count({
      where: { userId, status: 'active' },
    });
    const overLimitProjects = Math.max(0, activeProjects - FREE_PROJECT_LIMIT);

    // Archive excess projects (oldest first, keep newest within free limit)
    let archivedProjectIds: string[] = [];
    if (overLimitProjects > 0) {
      const excessProjects = await (await this.getPrisma()).project.findMany({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' as const },
        skip: FREE_PROJECT_LIMIT,
        select: { id: true },
      });
      archivedProjectIds = excessProjects.map((p: { id: string }) => p.id);

      if (archivedProjectIds.length > 0) {
        await (await this.getPrisma()).project.updateMany({
          where: { id: { in: archivedProjectIds } },
          data: { status: 'archived', archivedAt: now },
        });
      }
    }

    await (await this.getPrisma()).subscription.update({
      where: { userId },
      data: {
        plan: 'free',
        billingState: newState,
        rolledBackAt: now,
        periodStart: null,
        periodEnd: null,
      } as Partial<SubscriptionRow>,
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'system',
      actorId: opts.actorId,
      previousState,
      newState,
      reason: opts.reason ?? 'Trial rollback to free',
      metadata: { activeProjects, overLimitProjects, archivedProjects: archivedProjectIds.length },
    });

    return { overLimitProjects, billingState: newState, archivedProjectIds };
  }

  async extendTrial(
    userId: string,
    days: number,
    opts: TrialActionOptions = {},
  ): Promise<{ trialEndsAt: Date }> {
    const sub = await this.getSubscription(userId);

    if (sub.billingState !== 'trial_active') {
      throw new Error(`Cannot extend trial: user is not in trial_active state (current: ${sub.billingState})`);
    }

    const currentEnd = sub.trialEndsAt ?? this.now();
    const newTrialEndsAt = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);

    await (await this.getPrisma()).subscription.update({
      where: { userId },
      data: {
        trialEndsAt: newTrialEndsAt,
      } as Partial<SubscriptionRow>,
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState: 'trial_active',
      newState: 'trial_active',
      reason: opts.reason ?? `Trial extended by ${days} days`,
      metadata: { extensionDays: days, newTrialEndsAt: newTrialEndsAt.toISOString() },
    });

    return { trialEndsAt: newTrialEndsAt };
  }

  async convertTrialToPaid(
    userId: string,
    opts: TrialConvertOptions,
  ): Promise<{ billingState: BillingState }> {
    const sub = await this.getSubscription(userId);
    const now = this.now();

    if (sub.billingState !== 'trial_active' && sub.billingState !== 'trial_expired') {
      throw new Error(
        `Cannot convert to paid: user is not in trial state (current: ${sub.billingState})`,
      );
    }

    const previousState = sub.billingState;
    const periodEnd = computeNextPeriodEnd(sub.periodEnd, now, opts.period);

    await (await this.getPrisma()).subscription.update({
      where: { userId },
      data: {
        plan: opts.paidPlan,
        billingState: 'paid_active',
        periodStart: now,
        periodEnd,
        trialConvertedAt: now,
        aiUsed: 0,
      } as Partial<SubscriptionRow>,
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'user',
      actorId: opts.actorId,
      previousState,
      newState: 'paid_active',
      reason: opts.reason ?? `Converted to ${opts.paidPlan} (${opts.period})`,
      metadata: { paidPlan: opts.paidPlan, period: opts.period },
    });

    return { billingState: 'paid_active' };
  }

  async checkTrialEligibility(userId: string): Promise<TrialEligibility> {
    const sub = await (await this.getPrisma()).subscription.findUnique({ where: { userId } });

    if (!sub) {
      return { eligible: true };
    }

    if (sub.billingState !== 'free') {
      return { eligible: false, reason: `User is in ${sub.billingState} state, not free` };
    }

    if (sub.trialStartedAt !== null) {
      return { eligible: false, reason: 'User already used a trial' };
    }

    return { eligible: true };
  }

  private async getSubscription(userId: string): Promise<SubscriptionRow> {
    const sub = await (await this.getPrisma()).subscription.findUnique({ where: { userId } });
    if (!sub) {
      throw new Error(`Subscription not found for user ${userId}`);
    }
    return sub;
  }

  private async recordBillingEvent(params: BillingEventData): Promise<void> {
    await (await this.getPrisma()).billingEvent.create({ data: params });
  }
}

async function getDefaultPrisma(): Promise<TrialServicePrisma> {
  const { getPrisma } = await import('@gantt/mcp/prisma');
  return getPrisma();
}
