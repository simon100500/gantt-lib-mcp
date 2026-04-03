import {
  PLAN_LABELS,
  PLAN_PRICES,
  formatPrice,
  type BillingPeriod,
  type PlanId,
} from './billing';
import {
  getAiQueriesRemaining,
  getAiQueriesUsage,
  getProjectsRemaining,
  getProjectsUsage,
  type RemainingEntry,
  type SubscriptionStatus,
  type TrackedRemainingEntry,
  type TrackedUsageEntry,
  type UnlimitedRemainingEntry,
  type UsageStatus,
} from '../stores/useBillingStore';

export type ConstraintLimitKey = 'projects' | 'ai_queries';
export type ConstraintReasonCode = 'subscription_expired' | 'limit_reached' | 'read_only_mode';

export interface ConstraintDenialPayload {
  code: string;
  limitKey: ConstraintLimitKey | null;
  reasonCode: ConstraintReasonCode | string;
  remaining: number | 'unlimited' | null;
  plan: PlanId;
  planLabel: string;
  upgradeHint: string;
  used?: number;
  limit?: number | 'unlimited';
}

export interface ConstraintUsageSnapshot {
  limitKey: ConstraintLimitKey;
  usage: TrackedUsageEntry | null;
  remaining: TrackedRemainingEntry | UnlimitedRemainingEntry | null;
}

export interface ConstraintUpgradeOffer {
  planId: Exclude<PlanId, 'free'> | null;
  planLabel: string | null;
  billingPeriod: BillingPeriod;
  price: number | null;
  priceLabel: string | null;
}

export interface ConstraintModalContent {
  code: string;
  limitKey: ConstraintLimitKey | null;
  limitLabel: string;
  title: string;
  description: string;
  plan: PlanId;
  planLabel: string;
  upgradeHint: string;
  remainingLabel: string | null;
  usageLabel: string | null;
  upgradeOffer: ConstraintUpgradeOffer;
}

type BillingUsageSource = UsageStatus | SubscriptionStatus | null;

const NEXT_PLAN_BY_PLAN: Record<PlanId, Exclude<PlanId, 'free'> | null> = {
  free: 'start',
  start: 'team',
  team: 'enterprise',
  enterprise: null,
};

const LIMIT_LABELS: Record<ConstraintLimitKey, string> = {
  projects: 'лимит проектов',
  ai_queries: 'лимит AI-запросов',
};

function isConstraintLimitKey(value: string | null | undefined): value is ConstraintLimitKey {
  return value === 'projects' || value === 'ai_queries';
}

function readTrackedValue(entry: RemainingEntry | null): number | 'unlimited' | null {
  if (!entry) {
    return null;
  }

  if (entry.remainingState === 'tracked' || entry.remainingState === 'unlimited') {
    return entry.remaining;
  }

  return null;
}

function formatUsageLabel(usage: TrackedUsageEntry | null, remaining: TrackedRemainingEntry | UnlimitedRemainingEntry | null): string | null {
  if (!usage) {
    return null;
  }

  if (remaining?.remainingState === 'unlimited') {
    return `${usage.used} использовано, лимит без ограничений`;
  }

  if (typeof usage.limit === 'number') {
    return `${usage.used} из ${usage.limit} использовано`;
  }

  return `${usage.used} использовано`;
}

function formatRemainingLabel(remaining: TrackedRemainingEntry | UnlimitedRemainingEntry | null): string | null {
  if (!remaining) {
    return null;
  }

  if (remaining.remainingState === 'unlimited') {
    return 'Доступно без ограничений';
  }

  return `Осталось ${remaining.remaining}`;
}

export function getConstraintUsageSnapshot(
  usage: BillingUsageSource,
  limitKey: ConstraintLimitKey,
): ConstraintUsageSnapshot {
  const trackedUsage = limitKey === 'projects' ? getProjectsUsage(usage) : getAiQueriesUsage(usage);
  const trackedRemaining = limitKey === 'projects' ? getProjectsRemaining(usage) : getAiQueriesRemaining(usage);

  return {
    limitKey,
    usage: trackedUsage,
    remaining: trackedRemaining,
  };
}

export function getConstraintPlanLabel(plan: PlanId): string {
  return PLAN_LABELS[plan];
}

export function getUpgradePlanId(plan: PlanId): Exclude<PlanId, 'free'> | null {
  return NEXT_PLAN_BY_PLAN[plan];
}

export function getUpgradeOffer(
  plan: PlanId,
  billingPeriod: BillingPeriod = 'monthly',
): ConstraintUpgradeOffer {
  const planId = getUpgradePlanId(plan);
  if (!planId) {
    return {
      planId: null,
      planLabel: null,
      billingPeriod,
      price: null,
      priceLabel: null,
    };
  }

  const price = PLAN_PRICES[planId][billingPeriod];
  return {
    planId,
    planLabel: PLAN_LABELS[planId],
    billingPeriod,
    price,
    priceLabel: `${PLAN_LABELS[planId]} — ${formatPrice(price)}/${billingPeriod === 'monthly' ? 'мес' : 'год'}`,
  };
}

export function normalizeConstraintDenialPayload(
  denial: Partial<ConstraintDenialPayload> | null | undefined,
  usage?: BillingUsageSource,
): ConstraintDenialPayload | null {
  if (!denial?.code) {
    return null;
  }

  const plan = denial.plan ?? 'free';
  const planLabel = denial.planLabel ?? PLAN_LABELS[plan];
  const rawLimitKey = denial.limitKey ?? null;
  const limitKey: ConstraintLimitKey | null = isConstraintLimitKey(rawLimitKey)
    ? rawLimitKey
    : null;
  const usageSnapshot = limitKey && usage ? getConstraintUsageSnapshot(usage, limitKey) : null;
  const trackedRemaining = usageSnapshot ? readTrackedValue(usageSnapshot.remaining) : null;

  return {
    code: denial.code,
    limitKey,
    reasonCode: denial.reasonCode ?? 'limit_reached',
    remaining: denial.remaining ?? trackedRemaining,
    plan,
    planLabel,
    upgradeHint: denial.upgradeHint ?? defaultUpgradeHint(limitKey),
    used: denial.used ?? usageSnapshot?.usage?.used,
    limit: denial.limit ?? usageSnapshot?.remaining?.limit,
  };
}

export function buildConstraintModalContent(
  denial: ConstraintDenialPayload,
  usage?: BillingUsageSource,
): ConstraintModalContent {
  const usageSnapshot = denial.limitKey && usage ? getConstraintUsageSnapshot(usage, denial.limitKey) : null;
  const limitLabel = denial.limitKey ? LIMIT_LABELS[denial.limitKey] : 'доступ к редактированию';
  const upgradeOffer = getUpgradeOffer(denial.plan);
  const planLabel = denial.planLabel || getConstraintPlanLabel(denial.plan);
  const title = denial.code === 'SUBSCRIPTION_EXPIRED'
    ? 'Подписка требует продления'
    : `${capitalize(limitLabel)} достигнут`;
  const description = denial.code === 'SUBSCRIPTION_EXPIRED'
    ? `${planLabel} больше не активен для изменений. ${denial.upgradeHint}`
    : `${planLabel}: ${denial.upgradeHint}`;

  return {
    code: denial.code,
    limitKey: denial.limitKey,
    limitLabel,
    title,
    description,
    plan: denial.plan,
    planLabel,
    upgradeHint: denial.upgradeHint,
    remainingLabel: formatRemainingLabel(usageSnapshot?.remaining ?? null),
    usageLabel: formatUsageLabel(usageSnapshot?.usage ?? null, usageSnapshot?.remaining ?? null),
    upgradeOffer,
  };
}

function defaultUpgradeHint(limitKey: ConstraintLimitKey | null): string {
  if (limitKey === 'projects') {
    return 'Расширьте тариф, чтобы создавать больше активных проектов.';
  }

  if (limitKey === 'ai_queries') {
    return 'Перейдите на более высокий тариф, чтобы получить больше AI-запросов.';
  }

  return 'Обновите тариф, чтобы продолжить работу без ограничений.';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
