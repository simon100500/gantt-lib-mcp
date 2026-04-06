import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { formatPrice, PLAN_CATALOG, PLAN_FEATURES, PLAN_LABELS, type BillingPeriod, type PaidPlanId } from '../lib/billing.ts';
import {
  buildConstraintModalContent,
  FEATURE_GATE_CODES,
  normalizeConstraintDenialPayload,
  type ConstraintDenialPayload,
} from '../lib/constraintUi.ts';
import { type SubscriptionStatus, type UsageStatus, useBillingStore } from '../stores/useBillingStore.ts';

type LegacyLimitScenario = 'free-ai' | 'paid-ai' | 'project-limit';

interface LimitReachedModalProps {
  scenario?: LegacyLimitScenario;
  denial?: Partial<ConstraintDenialPayload> | null;
  usage?: UsageStatus | SubscriptionStatus | null;
  onClose: () => void;
  onActivateTrial?: () => Promise<boolean>;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  actionHref?: string;
}

const LEGACY_SCENARIOS: Record<LegacyLimitScenario, Partial<ConstraintDenialPayload>> = {
  'free-ai': {
    code: 'AI_LIMIT_REACHED',
    limitKey: 'ai_queries',
    plan: 'free',
    planLabel: 'Бесплатный',
    upgradeHint: 'Снимите ограничения и продолжайте работу.',
  },
  'paid-ai': {
    code: 'AI_LIMIT_REACHED',
    limitKey: 'ai_queries',
    plan: 'start',
    planLabel: 'Старт',
    upgradeHint: 'Лимит обновится завтра в 00:00 или раньше после апгрейда.',
  },
  'project-limit': {
    code: 'PROJECT_LIMIT_REACHED',
    limitKey: 'projects',
    plan: 'start',
    planLabel: 'Старт',
    upgradeHint: 'Чтобы создать новый проект, освободите место или расширьте тариф.',
  },
} as const;

function buildLegacyDenialPayload(scenario: LegacyLimitScenario | undefined): Partial<ConstraintDenialPayload> | null {
  return scenario ? LEGACY_SCENARIOS[scenario] : null;
}

export function LimitReachedModal({
  scenario,
  denial,
  usage,
  onClose,
  onActivateTrial,
  primaryButtonLabel,
  secondaryButtonLabel,
  actionHref = '/purchase',
}: LimitReachedModalProps) {
  const normalizedDenial = normalizeConstraintDenialPayload(denial ?? buildLegacyDenialPayload(scenario), usage);
  const content = normalizedDenial
    ? buildConstraintModalContent(normalizedDenial, usage)
    : buildConstraintModalContent({
      code: 'LIMIT_REACHED',
      limitKey: null,
      reasonCode: 'limit_reached',
      remaining: null,
      plan: 'free',
      planLabel: 'Бесплатный',
      upgradeHint: 'Обновите тариф, чтобы продолжить работу без ограничений.',
    });
  const dialogRef = useRef<HTMLDivElement>(null);
  const [trialActivating, setTrialActivating] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const subscription = useBillingStore((s) => s.subscription);
  const isFreeProjectLimitUpsell = content.code === 'PROJECT_LIMIT_REACHED' && content.plan === 'free';
  const trialIneligible = !subscription
    || subscription.billingState === 'trial_active'
    || subscription.billingState === 'trial_expired'
    || subscription.trialStartedAt != null;
  const canStartTrial = !trialIneligible && !!onActivateTrial;
  const paidPlans: PaidPlanId[] = ['start', 'team'];
  const compactPlanFeatures: Record<PaidPlanId, string[]> = {
    start: [
      '3 активных проекта',
      'AI-генерация и правки графиков',
      'Управление бригадами и ресурсами',
      'Экспорт в PDF и Excel',
    ],
    team: [
      '7 активных проектов',
      '50 AI-запросов в день',
      'Больше участников команды',
      'Приоритет для активной работы с несколькими объектами',
    ],
  };
  const priceLine = content.upgradeOffer.planId && content.upgradeOffer.price !== null
    ? `${content.upgradeOffer.planLabel} — ${formatPrice(content.upgradeOffer.price)}/${content.upgradeOffer.billingPeriod === 'monthly' ? 'мес' : 'год'}`
    : null;
  const resolvedPrimaryLabel = primaryButtonLabel
    ?? (canStartTrial ? 'Включить 14 дней бесплатно'
      : content.code === 'SUBSCRIPTION_EXPIRED' ? 'Продлить доступ'
        : 'Расширить тариф');
  const isFeatureGate = content.code === FEATURE_GATE_CODES.ARCHIVE_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.RESOURCE_POOL_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.EXPORT_FEATURE_LOCKED;
  const resolvedSecondaryLabel = secondaryButtonLabel
    ?? (isFreeProjectLimitUpsell ? 'Остаться на бесплатном'
      : content.limitKey === 'ai_queries' ? 'Понятно' : isFeatureGate ? 'Закрыть' : 'Закрыть');

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const redirectToPlan = (plan: PaidPlanId) => {
    const separator = actionHref.includes('?') ? '&' : '?';
    window.location.href = `${actionHref}${separator}plan=${plan}&period=${billingPeriod}&checkout=1`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      style={{ overscrollBehavior: 'contain' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="relative max-h-[calc(100dvh-2rem)] w-[720px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <h3 className="mb-2 pr-8 text-xl font-semibold text-slate-900" style={{ textWrap: 'balance' }}>
          {content.title}
        </h3>

        <div className="mb-6 space-y-3 text-sm text-slate-600">
          {!isFreeProjectLimitUpsell && <p>{content.description}</p>}
          {isFreeProjectLimitUpsell && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                Подключите тариф, чтобы не терять проекты
              </div>
              <div className="inline-flex w-fit rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  className={`rounded-lg px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${billingPeriod === 'monthly'
                    ? 'bg-slate-900 font-medium text-white'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Месяц
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('yearly')}
                  className={`rounded-lg px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${billingPeriod === 'yearly'
                    ? 'bg-slate-900 font-medium text-white'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Год
                </button>
              </div>
            </div>
          )}
          {isFreeProjectLimitUpsell ? (
            <div className="-mx-2 overflow-x-auto px-2 pb-1">
              <div className="grid min-w-[540px] grid-cols-2 gap-3">
                {paidPlans.map((plan) => {
                  const features = compactPlanFeatures[plan];
                  const isPopular = plan === 'start';
                  const yearlySavings = PLAN_CATALOG[plan].pricing.monthly * 12 - PLAN_CATALOG[plan].pricing.yearly;
                  return (
                    <div
                      key={plan}
                      className={`flex h-full flex-col rounded-2xl border p-4 text-left shadow-sm transition-all ${isPopular
                        ? 'border-primary/30 bg-primary/[0.045] text-slate-900 shadow-[0_20px_60px_-36px_rgba(97,88,224,0.35)]'
                        : 'border-slate-200 bg-white text-slate-900'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{PLAN_LABELS[plan]}</div>
                        </div>
                        {isPopular && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPopular ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Популярный
                          </span>
                        )}
                      </div>

                      <div className="mt-4">
                        <span className="text-3xl font-bold">{formatPrice(PLAN_CATALOG[plan].pricing[billingPeriod])}</span>
                        <span className="ml-1 text-sm text-slate-500">
                          /{billingPeriod === 'monthly' ? 'мес' : 'год'}
                        </span>
                        {billingPeriod === 'yearly' && yearlySavings > 0 && (
                          <span className="mt-1 block text-sm text-emerald-600">
                            Экономия {formatPrice(yearlySavings)} в год
                          </span>
                        )}
                      </div>

                      <ul className="mt-6 flex-1 space-y-2 text-sm text-slate-700">
                        {features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4 text-xs text-slate-500">
                        {plan === 'start' ? PLAN_FEATURES.start[6] : 'PDF + Excel и более широкий командный лимит'}
                      </div>

                      <button
                        type="button"
                        onClick={() => redirectToPlan(plan)}
                        className={`mt-4 h-10 w-full rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${isPopular
                          ? 'bg-primary text-white hover:bg-primary/90'
                          : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                          }`}
                      >
                        {`Подключить ${PLAN_LABELS[plan]}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : content.limitKey && (
            <dl className="space-y-2 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">Ограничение</dt>
                <dd className="text-right font-medium text-slate-900">{content.limitLabel}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">Текущий тариф</dt>
                <dd className="text-right font-medium text-slate-900">{content.planLabel}</dd>
              </div>
              {content.usageLabel && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">Использование</dt>
                  <dd className="text-right text-slate-900">{content.usageLabel}</dd>
                </div>
              )}
              {content.remainingLabel && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">Остаток</dt>
                  <dd className="text-right text-slate-900">{content.remainingLabel}</dd>
                </div>
              )}
            </dl>
          )}
          {!isFreeProjectLimitUpsell && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="font-medium text-emerald-900">{content.upgradeHint}</p>
              {priceLine && (
                <p className="mt-1 text-emerald-800">
                  Следующий шаг: {priceLine}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {!isFreeProjectLimitUpsell && (
            <button
              type="button"
              disabled={canStartTrial && trialActivating}
              onClick={canStartTrial
                ? () => { setTrialActivating(true); void onActivateTrial!().then((ok) => { if (ok) onClose(); setTrialActivating(false); }); }
                : () => { window.location.href = actionHref; }}
              className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {trialActivating ? 'Активация...' : resolvedPrimaryLabel}
            </button>
          )}
          {isFreeProjectLimitUpsell && canStartTrial && (
            <button
              type="button"
              disabled={trialActivating}
              onClick={() => { setTrialActivating(true); void onActivateTrial!().then((ok) => { if (ok) onClose(); setTrialActivating(false); }); }}
              className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {trialActivating ? 'Активация...' : 'Включить 14 дней бесплатно'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${isFreeProjectLimitUpsell && !canStartTrial ? 'w-full' : 'flex-1'} h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2`}
          >
            {resolvedSecondaryLabel}
          </button>
        </div>
        {isFreeProjectLimitUpsell && (
          <p className="mt-3 text-right text-sm text-slate-500">
            Чтобы создать новый проект на бесплатном тарифе, удалите существующий проект.
          </p>
        )}
      </div>
    </div>
  );
}
