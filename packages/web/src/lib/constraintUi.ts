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

export type ConstraintLimitKey = 'projects' | 'ai_queries' | 'archive' | 'resource_pool' | 'export';
export type ConstraintReasonCode = 'subscription_expired' | 'limit_reached' | 'read_only_mode' | 'feature_disabled';

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
  archive: 'Архив проектов',
  resource_pool: 'Пул ресурсов',
  export: 'Экспорт',
};

function isConstraintLimitKey(value: string | null | undefined): value is ConstraintLimitKey {
  return value === 'projects' || value === 'ai_queries' || value === 'archive' || value === 'resource_pool' || value === 'export';
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

/**
 * Feature-gate denial codes recognized by the constraint UI.
 * Backend sends these when a boolean or access-level feature is locked by the user's plan.
 */
export const FEATURE_GATE_CODES = {
  ARCHIVE_FEATURE_LOCKED: 'ARCHIVE_FEATURE_LOCKED',
  RESOURCE_POOL_FEATURE_LOCKED: 'RESOURCE_POOL_FEATURE_LOCKED',
  EXPORT_FEATURE_LOCKED: 'EXPORT_FEATURE_LOCKED',
} as const;

const TRACKED_LIMIT_KEYS: Set<ConstraintLimitKey> = new Set(['projects', 'ai_queries']);

export function getConstraintUsageSnapshot(
  usage: BillingUsageSource,
  limitKey: ConstraintLimitKey,
): ConstraintUsageSnapshot {
  if (!TRACKED_LIMIT_KEYS.has(limitKey)) {
    return { limitKey, usage: null, remaining: null };
  }

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

function isPostTrialFeatureGate(denial: ConstraintDenialPayload): boolean {
  return denial.reasonCode === 'post_trial_feature_gate'
    || (typeof denial.upgradeHint === 'string' && denial.upgradeHint.includes('trial'));
}

export function buildConstraintModalContent(
  denial: ConstraintDenialPayload,
  usage?: BillingUsageSource,
): ConstraintModalContent {
  const isFeatureGate = denial.limitKey === 'archive' || denial.limitKey === 'resource_pool' || denial.limitKey === 'export';
  const usageSnapshot = !isFeatureGate && denial.limitKey && usage ? getConstraintUsageSnapshot(usage, denial.limitKey) : null;
  const limitLabel = denial.limitKey ? LIMIT_LABELS[denial.limitKey] : 'доступ к редактированию';
  const upgradeOffer = getUpgradeOffer(denial.plan);
  const planLabel = denial.planLabel || getConstraintPlanLabel(denial.plan);
  const isFreeProjectLimitUpsell = denial.code === 'PROJECT_LIMIT_REACHED' && denial.plan === 'free';

  let title: string;
  let description: string;

  if (denial.code === 'SUBSCRIPTION_EXPIRED') {
    title = 'Подписка требует продления';
    description = `${planLabel} больше не активен для изменений. ${denial.upgradeHint}`;
  } else if (isFreeProjectLimitUpsell) {
    title = 'Пора расширяться';
    description = `На тарифе ${planLabel} ${denial.upgradeHint.charAt(0).toLowerCase()}${denial.upgradeHint.slice(1)}`;
  } else if (denial.code === 'PROJECT_LIMIT_REACHED') {
    title = 'Пора расширяться';
    description = `На тарифе ${planLabel} ${denial.upgradeHint.charAt(0).toLowerCase()}${denial.upgradeHint.slice(1)}`;
  } else if (isPostTrialFeatureGate(denial)) {
    title = `${limitLabel} — пробный период закончился`;
    description = 'Вы использовали расширенные возможности тарифа Старт. Перейдите на платный тариф, чтобы сохранить доступ.';
  } else if (isFeatureGate) {
    if (denial.limitKey === 'archive') {
      title = 'Не теряйте доступ к проектам';
      description = 'Архивируйте завершённые проекты и возвращайтесь к ним в любой момент. Расширьте тариф, чтобы продолжить.';
    } else {
      title = `${limitLabel} недоступен`;
      description = buildFeatureGateDescription(denial, planLabel);
    }
  } else {
    title = `${capitalize(limitLabel)} достигнут`;
    description = `На тарифе ${planLabel} ${denial.upgradeHint.charAt(0).toLowerCase()}${denial.upgradeHint.slice(1)}`;
  }

  return {
    code: denial.code,
    limitKey: denial.limitKey,
    limitLabel,
    title,
    description,
    plan: denial.plan,
    planLabel,
    upgradeHint: denial.upgradeHint,
    remainingLabel: !isFeatureGate ? formatRemainingLabel(usageSnapshot?.remaining ?? null) : null,
    usageLabel: !isFeatureGate ? formatUsageLabel(usageSnapshot?.usage ?? null, usageSnapshot?.remaining ?? null) : null,
    upgradeOffer,
  };
}

const EXPORT_ACCESS_DESCRIPTIONS: Record<string, string> = {
  none: 'Экспорт недоступен на вашем тарифе.',
  pdf: 'Экспорт в PDF (pdf) доступен на вашем тарифе.',
  pdf_excel: 'Экспорт PDF + Excel (pdf_excel) доступен на вашем тарифе.',
  pdf_excel_api: 'Экспорт PDF + Excel + API (pdf_excel_api) доступен на вашем тарифе.',
};

const EXPORT_UPGRADE_TIERS: Record<string, string> = {
  none: 'pdf',
  pdf: 'pdf_excel',
  pdf_excel: 'pdf_excel_api',
};

function buildFeatureGateDescription(denial: ConstraintDenialPayload, planLabel: string): string {
  if (denial.limitKey === 'export') {
    const currentLevel = getExportTierFromPlan(denial.plan);
    const nextLevel = EXPORT_UPGRADE_TIERS[currentLevel];
    const description = nextLevel
      ? `${planLabel}: ${denial.upgradeHint} Следующий уровень: ${nextLevel}.`
      : `${planLabel}: ${denial.upgradeHint}`;
    return description;
  }

  return `${planLabel}: ${denial.upgradeHint}`;
}

function getExportTierFromPlan(plan: PlanId): string {
  const tiers: Record<PlanId, string> = {
    free: 'none',
    start: 'pdf',
    team: 'pdf_excel',
    enterprise: 'pdf_excel_api',
  };
  return tiers[plan] ?? 'none';
}

function defaultUpgradeHint(limitKey: ConstraintLimitKey | null): string {
  if (limitKey === 'projects') {
    return 'Расширьте тариф, чтобы создавать больше активных проектов.';
  }

  if (limitKey === 'ai_queries') {
    return 'Перейдите на более высокий тариф, чтобы получить больше AI-запросов.';
  }

  if (limitKey === 'archive') {
    return 'Не теряйте доступ к проектам — расширьте тариф и используйте архив.';
  }

  if (limitKey === 'resource_pool') {
    return 'Пул ресурсов доступен на тарифе Старт и выше.';
  }

  if (limitKey === 'export') {
    return 'Экспорт доступен на платных тарифах.';
  }

  return 'Обновите тариф, чтобы продолжить работу без ограничений.';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
