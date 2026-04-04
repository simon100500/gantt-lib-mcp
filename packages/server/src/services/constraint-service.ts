import { getPrisma } from '@gantt/mcp/prisma';
import {
  getLimitCatalog,
  getPlanDefinition,
  getPlanLimit,
  isUnlimited,
  type ExportAccessLevel,
  type LimitKey,
  type PlanId,
  type Unlimited,
  type UsageLimitPeriod,
} from '@gantt/mcp/constraints';

type PeriodBucket = 'lifetime' | `day:${string}` | 'active_projects';
type RawLimitValue = number | Unlimited | boolean | ExportAccessLevel | { period: UsageLimitPeriod; value: number };

interface UsageCounterRecord {
  userId: string;
  limitKey: string;
  periodBucket: string;
  usage: number;
}

interface ConstraintServicePrisma {
  subscription: {
    findUnique(args: {
      where: { userId: string };
      select?: { plan?: true; billingState?: true; trialPlan?: true };
    }): Promise<{ plan: string; billingState?: string; trialPlan?: string | null } | null>;
  };
  project: {
    count(args: {
      where: { userId: string; status: 'active' };
    }): Promise<number>;
  };
  usageCounter: {
    findUnique(args: {
      where: {
        userId_limitKey_periodBucket: {
          userId: string;
          limitKey: string;
          periodBucket: string;
        };
      };
    }): Promise<UsageCounterRecord | null>;
    upsert(args: {
      where: {
        userId_limitKey_periodBucket: {
          userId: string;
          limitKey: string;
          periodBucket: string;
        };
      };
      create: UsageCounterRecord;
      update: {
        usage: { increment: number };
      };
    }): Promise<UsageCounterRecord>;
  };
}

interface ConstraintServiceDeps {
  prisma?: ConstraintServicePrisma;
  now?: () => Date;
}

interface LimitContext {
  planId: PlanId;
  limitKey: LimitKey;
  limit: RawLimitValue;
}

export type ConstraintReasonCode = 'allowed' | 'limit_reached' | 'feature_disabled';
export type UsageState = 'tracked' | 'not_applicable';
export type RemainingState = 'tracked' | 'unlimited' | 'not_applicable';

export interface TrackedUsageSnapshot {
  planId: PlanId;
  limitKey: LimitKey;
  limit: number | Unlimited;
  usageState: 'tracked';
  period: UsageLimitPeriod | 'current';
  periodBucket: PeriodBucket;
  used: number;
}

export interface NotApplicableUsageSnapshot {
  planId: PlanId;
  limitKey: LimitKey;
  limit: boolean | ExportAccessLevel;
  usageState: 'not_applicable';
  period: null;
  periodBucket: null;
  used: null;
}

export type ConstraintUsageSnapshot = TrackedUsageSnapshot | NotApplicableUsageSnapshot;

export interface TrackedRemainingSnapshot {
  planId: PlanId;
  limitKey: LimitKey;
  limit: number;
  remainingState: 'tracked';
  remaining: number;
}

export interface UnlimitedRemainingSnapshot {
  planId: PlanId;
  limitKey: LimitKey;
  limit: Unlimited;
  remainingState: 'unlimited';
  remaining: Unlimited;
}

export interface NotApplicableRemainingSnapshot {
  planId: PlanId;
  limitKey: LimitKey;
  limit: boolean | ExportAccessLevel;
  remainingState: 'not_applicable';
  remaining: null;
}

export type ConstraintRemainingSnapshot =
  | TrackedRemainingSnapshot
  | UnlimitedRemainingSnapshot
  | NotApplicableRemainingSnapshot;

export interface ConstraintCheckResult {
  allowed: boolean;
  reasonCode: ConstraintReasonCode;
  planId: PlanId;
  limitKey: LimitKey;
  limit: RawLimitValue;
  usage: ConstraintUsageSnapshot;
  remaining: ConstraintRemainingSnapshot;
}

export class ConstraintServiceError extends Error {
  code: 'UNKNOWN_LIMIT_KEY';

  constructor(limitKey: string) {
    super(`Unknown limit key: ${limitKey}`);
    this.name = 'ConstraintServiceError';
    this.code = 'UNKNOWN_LIMIT_KEY';
  }
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolvePeriodBucket(period: UsageLimitPeriod, now: Date): PeriodBucket {
  return period === 'lifetime' ? 'lifetime' : `day:${formatDateOnly(now)}`;
}

export class ConstraintService {
  private readonly prisma: ConstraintServicePrisma;
  private readonly now: () => Date;

  constructor(deps: ConstraintServiceDeps = {}) {
    this.prisma = deps.prisma ?? getPrisma();
    this.now = deps.now ?? (() => new Date());
  }

  async checkLimit(userId: string, limitKey: string): Promise<ConstraintCheckResult> {
    const context = await this.getLimitContext(userId, limitKey);
    const usage = await this.getUsage(userId, limitKey);
    const remaining = await this.getRemaining(userId, limitKey);

    if (usage.usageState === 'not_applicable') {
      const allowed = context.limitKey === 'export'
        ? context.limit !== 'none'
        : Boolean(context.limit);

      return {
        allowed,
        reasonCode: allowed ? 'allowed' : 'feature_disabled',
        planId: context.planId,
        limitKey: context.limitKey,
        limit: context.limit,
        usage,
        remaining,
      };
    }

    if (remaining.remainingState === 'unlimited' || (remaining.remainingState === 'tracked' && remaining.remaining > 0)) {
      return {
        allowed: true,
        reasonCode: 'allowed',
        planId: context.planId,
        limitKey: context.limitKey,
        limit: context.limit,
        usage,
        remaining,
      };
    }

    return {
      allowed: false,
      reasonCode: 'limit_reached',
      planId: context.planId,
      limitKey: context.limitKey,
      limit: context.limit,
      usage,
      remaining,
    };
  }

  async getUsage(userId: string, limitKey: string): Promise<ConstraintUsageSnapshot> {
    const context = await this.getLimitContext(userId, limitKey);
    const now = this.now();

    switch (context.limitKey) {
      case 'projects': {
        const used = await this.prisma.project.count({
          where: {
            userId,
            status: 'active',
          },
        });

        return {
          planId: context.planId,
          limitKey: context.limitKey,
          limit: context.limit as number | Unlimited,
          usageState: 'tracked',
          period: 'current',
          periodBucket: 'active_projects',
          used,
        };
      }
      case 'ai_queries': {
        const usageLimit = context.limit as { period: UsageLimitPeriod; value: number };
        const periodBucket = resolvePeriodBucket(usageLimit.period, now);
        const counter = await this.prisma.usageCounter.findUnique({
          where: {
            userId_limitKey_periodBucket: {
              userId,
              limitKey: context.limitKey,
              periodBucket,
            },
          },
        });

        return {
          planId: context.planId,
          limitKey: context.limitKey,
          limit: usageLimit.value,
          usageState: 'tracked',
          period: usageLimit.period,
          periodBucket,
          used: (counter as UsageCounterRecord | null)?.usage ?? 0,
        };
      }
      case 'archive':
      case 'resource_pool':
      case 'export':
        return {
          planId: context.planId,
          limitKey: context.limitKey,
          limit: context.limit as boolean | ExportAccessLevel,
          usageState: 'not_applicable',
          period: null,
          periodBucket: null,
          used: null,
        };
    }
  }

  async getRemaining(userId: string, limitKey: string): Promise<ConstraintRemainingSnapshot> {
    const context = await this.getLimitContext(userId, limitKey);
    const usage = await this.getUsage(userId, limitKey);

    if (usage.usageState === 'not_applicable') {
      return {
        planId: context.planId,
        limitKey: context.limitKey,
        limit: context.limit as boolean | ExportAccessLevel,
        remainingState: 'not_applicable',
        remaining: null,
      };
    }

    if (isUnlimited(usage.limit)) {
      return {
        planId: context.planId,
        limitKey: context.limitKey,
        limit: usage.limit,
        remainingState: 'unlimited',
        remaining: usage.limit,
      };
    }

    return {
      planId: context.planId,
      limitKey: context.limitKey,
      limit: usage.limit,
      remainingState: 'tracked',
      remaining: Math.max(usage.limit - usage.used, 0),
    };
  }

  async incrementUsage(
    userId: string,
    limitKey: string,
    amount: number = 1,
    now: Date = this.now(),
  ): Promise<ConstraintUsageSnapshot> {
    const context = await this.getLimitContext(userId, limitKey);

    if (context.limitKey !== 'ai_queries') {
      return this.getUsage(userId, limitKey);
    }

    const usageLimit = context.limit as { period: UsageLimitPeriod; value: number };
    const periodBucket = resolvePeriodBucket(usageLimit.period, now);
    const counter = await this.prisma.usageCounter.upsert({
      where: {
        userId_limitKey_periodBucket: {
          userId,
          limitKey: context.limitKey,
          periodBucket,
        },
      },
      create: {
        userId,
        limitKey: context.limitKey,
        periodBucket,
        usage: amount,
      },
      update: {
        usage: { increment: amount },
      },
    });

    return {
      planId: context.planId,
      limitKey: context.limitKey,
      limit: usageLimit.value,
      usageState: 'tracked',
      period: usageLimit.period,
      periodBucket,
      used: (counter as UsageCounterRecord).usage,
    };
  }

  private async getLimitContext(userId: string, limitKey: string): Promise<LimitContext> {
    if (!Object.hasOwn(getLimitCatalog(), limitKey)) {
      throw new ConstraintServiceError(limitKey);
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, billingState: true, trialPlan: true },
    });
    let planId = (subscription?.plan ?? 'free') as PlanId;

    // Trial users get their trial plan limits regardless of stored plan field
    if (subscription?.billingState === 'trial_active') {
      planId = (subscription.trialPlan || 'start') as PlanId;
    }

    getPlanDefinition(planId);

    return {
      planId,
      limitKey: limitKey as LimitKey,
      limit: getPlanLimit(planId, limitKey as LimitKey),
    };
  }
}
