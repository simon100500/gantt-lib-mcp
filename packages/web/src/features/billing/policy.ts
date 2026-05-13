import { PLAN_LABELS, type PlanId } from '../../lib/billing.ts';
import type { ConstraintDenialPayload, ConstraintLimitKey } from '../../lib/constraintUi.ts';
import { getExportAccessLevel, type SubscriptionStatus, type UsageStatus } from '../../stores/useBillingStore.ts';

export type BillingConstraintStatus = UsageStatus | SubscriptionStatus | null;

export function buildProactiveConstraintDenial(
  limitKey: ConstraintLimitKey | 'archive' | 'resource_pool',
  status: BillingConstraintStatus,
): Partial<ConstraintDenialPayload> | null {
  const plan = ((status?.plan as PlanId | undefined) ?? 'free');
  const planLabel = status?.planMeta.label ?? PLAN_LABELS[plan];

  if (status && 'isActive' in status && !status.isActive && plan !== 'free') {
    return {
      code: 'SUBSCRIPTION_EXPIRED',
      limitKey: null,
      reasonCode: 'subscription_expired',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: 'Продлите тариф, чтобы снова создавать проекты и пользоваться AI.',
    };
  }

  if (limitKey === 'archive' || limitKey === 'resource_pool') {
    const limitValue = status?.limits?.[limitKey];
    if (limitValue === true) {
      return null;
    }
    const gateCode = limitKey === 'archive' ? 'ARCHIVE_FEATURE_LOCKED' : 'RESOURCE_POOL_FEATURE_LOCKED';
    const hint = limitKey === 'archive'
      ? 'Не теряйте доступ к проектам — расширьте тариф и используйте архив.'
      : 'Пул ресурсов доступен на тарифе Старт и выше.';
    return {
      code: gateCode,
      limitKey,
      reasonCode: 'feature_disabled',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: hint,
    };
  }

  if (limitKey === 'export') {
    const exportAccessLevel = getExportAccessLevel(status);
    if (exportAccessLevel !== 'none') {
      return null;
    }

    return {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey,
      reasonCode: 'feature_disabled',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
    };
  }

  const usageEntry = limitKey === 'projects' ? status?.usage.projects : status?.usage.ai_queries;
  const remainingEntry = limitKey === 'projects' ? status?.remaining.projects : status?.remaining.ai_queries;
  if (remainingEntry?.remainingState !== 'tracked' || remainingEntry.remaining > 0) {
    return null;
  }

  return {
    code: limitKey === 'projects' ? 'PROJECT_LIMIT_REACHED' : 'AI_LIMIT_REACHED',
    limitKey,
    reasonCode: 'limit_reached',
    remaining: remainingEntry.remaining,
    plan,
    planLabel,
    upgradeHint: limitKey === 'projects'
      ? 'Лимит активных проектов исчерпан. Освободите слот или обновите тариф.'
      : 'Лимит AI-запросов исчерпан. Обновите тариф, чтобы продолжить работу с ассистентом.',
    used: usageEntry?.usageState === 'tracked' ? usageEntry.used : undefined,
    limit: remainingEntry.limit,
  };
}

export function buildLocalFreeProjectLimitDenial(params: {
  billingStatus: BillingConstraintStatus;
  activeProjectCount: number;
  archivedProjectsCount: number;
  archivedProjectLimit: number;
}): Partial<ConstraintDenialPayload> | null {
  const { billingStatus, activeProjectCount, archivedProjectsCount, archivedProjectLimit } = params;
  const plan = ((billingStatus?.plan as PlanId | undefined) ?? 'free');
  const planLabel = billingStatus?.planMeta.label ?? PLAN_LABELS[plan];
  const isFreePlan = plan === 'free';

  if (!isFreePlan || activeProjectCount === 0 || archivedProjectsCount < archivedProjectLimit) {
    return null;
  }

  return {
    code: 'PROJECT_LIMIT_REACHED',
    limitKey: 'projects',
    reasonCode: 'limit_reached',
    remaining: 0,
    plan,
    planLabel,
    upgradeHint: 'Лимит проектов исчерпан. Обновите тариф, чтобы создать ещё один проект.',
    used: activeProjectCount + archivedProjectsCount,
    limit: activeProjectCount + archivedProjectLimit,
  };
}

export function buildLocalArchiveLimitDenial(params: {
  billingStatus: BillingConstraintStatus;
  archivedProjectsCount: number;
  archivedProjectLimit: number;
}): Partial<ConstraintDenialPayload> | null {
  const { billingStatus, archivedProjectsCount, archivedProjectLimit } = params;
  const plan = ((billingStatus?.plan as PlanId | undefined) ?? 'free');
  const planLabel = billingStatus?.planMeta.label ?? PLAN_LABELS[plan];
  const isFreePlan = plan === 'free';

  if (!isFreePlan || archivedProjectsCount < archivedProjectLimit) {
    return null;
  }

  return {
    code: 'ARCHIVE_FEATURE_LOCKED',
    limitKey: 'archive',
    reasonCode: 'feature_disabled',
    remaining: null,
    plan,
    planLabel,
    upgradeHint: `На бесплатном тарифе можно хранить до ${archivedProjectLimit} архивных проектов. Обновите тариф, чтобы архивировать больше.`,
  };
}

export function buildResourceCreationLimitDenial(
  status: BillingConstraintStatus,
): Partial<ConstraintDenialPayload> {
  const plan = ((status?.plan as PlanId | undefined) ?? 'free');
  const planLabel = status?.planMeta.label ?? PLAN_LABELS[plan];

  return {
    code: 'RESOURCE_POOL_FEATURE_LOCKED',
    limitKey: 'resource_pool',
    reasonCode: 'feature_disabled',
    remaining: null,
    plan,
    planLabel,
    upgradeHint: 'На бесплатном тарифе можно создать до 3 ресурсов. Перейдите на Старт, чтобы добавить больше.',
  };
}
