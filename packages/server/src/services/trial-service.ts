import { getPrisma } from '@gantt/mcp/prisma';
import { BillingService } from './billing-service.js';

/**
 * Billing lifecycle states for trial management.
 * These correspond to the BillingState enum in the Prisma schema.
 */
type BillingState = 'free' | 'trial_active' | 'trial_expired' | 'paid_active' | 'paid_expired';

/**
 * Extended subscription type with trial fields.
 * The Prisma client has these fields after schema migration, but TypeScript
 * resolution in worktree environments may not reflect the updated types.
 */
interface SubscriptionWithTrial {
  id: string;
  userId: string;
  plan: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  aiUsed: number;
  createdAt: Date;
  billingState: BillingState | null;
  trialPlan: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialEndedAt: Date | null;
  trialSource: 'self_serve' | 'admin' | 'promo' | null;
  trialConvertedAt: Date | null;
  rolledBackAt: Date | null;
}

function asTrialSub(sub: ReturnType<BillingService['getOrCreateSubscription']> extends Promise<infer T> ? T : never): SubscriptionWithTrial {
  return sub as unknown as SubscriptionWithTrial;
}

export interface TrialStartOptions {
  trialPlan?: 'start';
  durationDays?: number;
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
}

export class TrialService {
  private readonly billingService: BillingService;

  constructor(deps: { billingService?: BillingService } = {}) {
    this.billingService = deps.billingService ?? new BillingService();
  }

  async startTrial(userId: string, opts: TrialStartOptions): Promise<{ billingState: BillingState; trialEndsAt: Date }> {
    const prisma = getPrisma();
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    const currentState = subscription.billingState ?? 'free';
    if (currentState !== 'free') {
      throw new Error(`Cannot start trial: user billing state is ${currentState}, expected free`);
    }

    if (subscription.trialStartedAt !== null && subscription.trialStartedAt !== undefined) {
      throw new Error('Cannot start trial: user already had a trial');
    }

    const now = new Date();
    const durationDays = opts.durationDays ?? 14;
    const trialEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const previousState = currentState;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.subscription.update as any)({
      where: { userId },
      data: {
        plan: opts.trialPlan ?? 'start',
        billingState: 'trial_active',
        trialStartedAt: now,
        trialEndsAt,
        trialSource: opts.source,
        periodStart: now,
        periodEnd: trialEndsAt,
      },
    });

    await this.recordBillingEvent({
      userId,
      actorType: opts.source,
      actorId: opts.actorId,
      previousState,
      newState: 'trial_active',
      reason: opts.reason,
    });

    return { billingState: 'trial_active', trialEndsAt };
  }

  async endTrialNow(userId: string, opts: TrialActionOptions = {}): Promise<{ billingState: BillingState }> {
    const prisma = getPrisma();
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    if (subscription.billingState !== 'trial_active') {
      throw new Error(`Cannot end trial: user billing state is ${subscription.billingState}, expected trial_active`);
    }

    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.subscription.update as any)({
      where: { userId },
      data: {
        billingState: 'trial_expired',
        trialEndedAt: now,
      },
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState: 'trial_active',
      newState: 'trial_expired',
      reason: opts.reason,
    });

    return { billingState: 'trial_expired' };
  }

  async rollbackTrialToFree(userId: string, opts: TrialActionOptions = {}): Promise<RollbackResult> {
    const prisma = getPrisma();
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    if (subscription.billingState !== 'trial_active' && subscription.billingState !== 'trial_expired') {
      throw new Error(`Cannot rollback trial: user billing state is ${subscription.billingState}, expected trial_active or trial_expired`);
    }

    const previousState = subscription.billingState!;

    // Count active projects to determine over-limit count
    const activeProjects = await prisma.project.count({
      where: { userId, status: 'active' },
    });
    const freeProjectLimit = 1;
    const overLimitProjects = Math.max(0, activeProjects - freeProjectLimit);

    const now = new Date();
    const newState: BillingState = previousState === 'trial_active' ? 'trial_expired' : 'free';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.subscription.update as any)({
      where: { userId },
      data: {
        plan: 'free',
        billingState: newState,
        rolledBackAt: now,
        periodStart: null,
        periodEnd: null,
      },
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState,
      newState,
      reason: opts.reason,
      metadata: { overLimitProjects },
    });

    return { overLimitProjects, billingState: newState };
  }

  async extendTrial(userId: string, days: number, opts: TrialActionOptions = {}): Promise<{ trialEndsAt: Date }> {
    const prisma = getPrisma();
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    if (subscription.billingState !== 'trial_active') {
      throw new Error(`Cannot extend trial: user billing state is ${subscription.billingState}, expected trial_active`);
    }

    const currentEnd = subscription.trialEndsAt ?? new Date();
    const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.subscription.update as any)({
      where: { userId },
      data: {
        trialEndsAt: newEnd,
        periodEnd: newEnd,
      },
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState: 'trial_active',
      newState: 'trial_active',
      reason: opts.reason,
      metadata: { extendedDays: days, newTrialEnd: newEnd.toISOString() },
    });

    return { trialEndsAt: newEnd };
  }

  async convertTrialToPaid(userId: string, opts: TrialConvertOptions): Promise<{ billingState: BillingState }> {
    const prisma = getPrisma();
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    if (subscription.billingState !== 'trial_active' && subscription.billingState !== 'trial_expired') {
      throw new Error(`Cannot convert trial: user billing state is ${subscription.billingState}, expected trial_active or trial_expired`);
    }

    const previousState = subscription.billingState!;

    // Apply the paid plan via BillingService
    await this.billingService.applyPlan(userId, opts.paidPlan, opts.period);

    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.subscription.update as any)({
      where: { userId },
      data: {
        billingState: 'paid_active',
        trialConvertedAt: now,
      },
    });

    await this.recordBillingEvent({
      userId,
      actorType: 'admin',
      actorId: opts.actorId,
      previousState,
      newState: 'paid_active',
      reason: opts.reason,
      metadata: { paidPlan: opts.paidPlan, period: opts.period },
    });

    return { billingState: 'paid_active' };
  }

  async checkTrialEligibility(userId: string): Promise<TrialEligibility> {
    const raw = await this.billingService.getOrCreateSubscription(userId);
    const subscription = asTrialSub(raw);

    const currentState = subscription.billingState ?? 'free';
    if (currentState !== 'free') {
      return { eligible: false, reason: `User billing state is ${currentState}, not free` };
    }

    if (subscription.trialStartedAt !== null && subscription.trialStartedAt !== undefined) {
      return { eligible: false, reason: 'User already had a trial' };
    }

    return { eligible: true };
  }

  private async recordBillingEvent(params: {
    userId: string;
    actorType: string;
    actorId?: string;
    previousState: string | null;
    newState: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const prisma = getPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).billingEvent.create({
      data: {
        userId: params.userId,
        actorType: params.actorType,
        actorId: params.actorId,
        previousState: params.previousState,
        newState: params.newState,
        reason: params.reason,
        metadata: params.metadata ?? undefined,
      },
    });
  }
}
