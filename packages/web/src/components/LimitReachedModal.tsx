import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { formatPrice, PLAN_CATALOG, PLAN_LABELS, type BillingPeriod, type PlanId } from '../lib/billing.ts';
import {
  buildConstraintModalContent,
  FEATURE_GATE_CODES,
  normalizeConstraintDenialPayload,
  type ConstraintDenialPayload,
} from '../lib/constraintUi.ts';
import { type SubscriptionStatus, type UsageStatus, useBillingStore } from '../stores/useBillingStore.ts';

type LegacyLimitScenario = 'free-ai' | 'paid-ai' | 'project-limit';
type UpgradePlanId = Exclude<PlanId, 'free'>;

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

const CARD_FEATURES: Record<UpgradePlanId, string[]> = {
  start: [
    '3 активных проекта',
    'AI-генерация и правки графиков',
    'До 5 участников команды',
    'Управление бригадами и ресурсами',
    'Экспорт в PDF',
    'Гостевые ссылки',
  ],
  team: [
    '7 активных проектов',
    'Общие ресурсы по всем проектам',
    '50 AI-запросов в день',
    'До 20 участников команды',
    'Экспорт PDF + Excel',
    'Архив проектов и гостевые ссылки',
  ],
  enterprise: [
    'Безлимит проектов',
    '100 AI-запросов в день',
    'До 20 участников команды',
    'Экспорт PDF + Excel + API',
    'Приоритетная поддержка',
  ],
};

function buildLegacyDenialPayload(scenario: LegacyLimitScenario | undefined): Partial<ConstraintDenialPayload> | null {
  return scenario ? LEGACY_SCENARIOS[scenario] : null;
}

function getUpgradePlans(plan: PlanId): UpgradePlanId[] {
  if (plan === 'free') return ['start', 'team'];
  if (plan === 'start') return ['team', 'enterprise'];
  if (plan === 'team') return ['enterprise'];
  return [];
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
  const trialIneligible = !subscription
    || subscription.billingState === 'trial_active'
    || subscription.billingState === 'trial_expired'
    || subscription.trialStartedAt != null;
  const canStartTrial = !trialIneligible && !!onActivateTrial;
  const upgradePlans = getUpgradePlans(content.plan);
  const showsUpgradeCards = upgradePlans.length > 0;
  const maxYearlyDiscount = showsUpgradeCards
    ? Math.max(...upgradePlans.map((plan) => {
      const pricing = PLAN_CATALOG[plan].pricing;
      return Math.round((1 - pricing.yearly / (pricing.monthly * 12)) * 100);
    }))
    : 0;
  const isFeatureGate = content.code === FEATURE_GATE_CODES.ARCHIVE_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.RESOURCE_POOL_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.EXPORT_FEATURE_LOCKED;
  const resolvedPrimaryLabel = primaryButtonLabel
    ?? (canStartTrial ? 'Включить 14 дней бесплатно'
      : content.code === 'SUBSCRIPTION_EXPIRED' ? 'Продлить доступ'
        : 'Расширить тариф');
  const resolvedSecondaryLabel = secondaryButtonLabel
    ?? (content.limitKey === 'ai_queries' ? 'Понятно' : isFeatureGate ? 'Закрыть' : 'Закрыть');
  const priceLine = content.upgradeOffer.planId && content.upgradeOffer.price !== null
    ? `${content.upgradeOffer.planLabel} — ${formatPrice(content.upgradeOffer.price)}/${content.upgradeOffer.billingPeriod === 'monthly' ? 'мес' : 'год'}`
    : null;

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const redirectToPlan = (plan: UpgradePlanId) => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:ai@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф';
      return;
    }

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
          <p>
            {content.code === 'PROJECT_LIMIT_REACHED' ? (
              <>
                На тарифе <strong className="font-semibold text-slate-700">{content.planLabel}</strong>{' '}
                лимит активных проектов исчерпан. Освободите слот или обновите тариф.
              </>
            ) : (
              content.description
            )}
          </p>

          {showsUpgradeCards ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">Выберите период и подходящий тариф.</div>
                <div className="ml-auto inline-flex w-fit rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
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
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${billingPeriod === 'yearly'
                      ? 'bg-slate-900 font-medium text-white'
                      : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    {maxYearlyDiscount > 0 ? `Год -${maxYearlyDiscount}%` : 'Год'}
                  </button>
                </div>
              </div>

              <div className="-mx-2 overflow-x-auto px-2 pb-1">
                <div className={`grid min-w-[540px] gap-3 ${upgradePlans.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {upgradePlans.map((plan) => {
                    const pricing = PLAN_CATALOG[plan].pricing;
                    const yearlySavings = pricing.monthly * 12 - pricing.yearly;
                    const isPopular = plan === 'start';

                    return (
                      <div
                        key={plan}
                        className={`flex h-full flex-col rounded-2xl border p-4 text-left shadow-sm transition-all ${isPopular
                          ? 'border-primary/30 bg-primary/[0.045] text-slate-900 shadow-[0_20px_60px_-36px_rgba(97,88,224,0.35)]'
                          : 'border-slate-200 bg-white text-slate-900'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold text-slate-900">{PLAN_LABELS[plan]}</div>
                          {isPopular && (
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary/80">
                              Популярный
                            </span>
                          )}
                        </div>

                        <div className="mt-4">
                          <span className="text-3xl font-bold">{formatPrice(pricing[billingPeriod])}</span>
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
                          {CARD_FEATURES[plan].map((feature) => (
                            <li key={feature} className="flex items-start gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          onClick={() => redirectToPlan(plan)}
                          className="mt-4 h-10 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
                        >
                          {plan === 'enterprise' ? 'Связаться' : `Выбрать ${PLAN_LABELS[plan]}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {canStartTrial && (
                <button
                  type="button"
                  disabled={trialActivating}
                  onClick={() => { setTrialActivating(true); void onActivateTrial!().then((ok) => { if (ok) onClose(); setTrialActivating(false); }); }}
                  className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {trialActivating ? 'Активация...' : 'Включить 14 дней бесплатно на Старт'}
                </button>
              )}
            </>
          ) : content.limitKey ? (
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
          ) : null}

          {!showsUpgradeCards && (
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

        {!showsUpgradeCards && (
          <div className="flex gap-3">
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
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              {resolvedSecondaryLabel}
            </button>
          </div>
        )}

        {showsUpgradeCards && (
          <p className="mt-3 text-sm text-slate-500">
            {content.limitKey === 'projects' ? (
              <>
                Чтобы создать новый проект на тарифе <strong className="font-semibold text-slate-700">{content.planLabel}</strong>,
                {' '}архивируйте текущий проект.
              </>
            ) : (
              'Если апгрейд не нужен, закройте окно и продолжайте работу в рамках текущего тарифа.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}
