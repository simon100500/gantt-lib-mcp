import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatPrice } from '../lib/billing.ts';
import {
  buildConstraintModalContent,
  FEATURE_GATE_CODES,
  normalizeConstraintDenialPayload,
  type ConstraintDenialPayload,
} from '../lib/constraintUi.ts';
import type { SubscriptionStatus, UsageStatus } from '../stores/useBillingStore.ts';

type LegacyLimitScenario = 'free-ai' | 'paid-ai' | 'project-limit';

interface LimitReachedModalProps {
  scenario?: LegacyLimitScenario;
  denial?: Partial<ConstraintDenialPayload> | null;
  usage?: UsageStatus | SubscriptionStatus | null;
  onClose: () => void;
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
  const priceLine = content.upgradeOffer.planId && content.upgradeOffer.price !== null
    ? `${content.upgradeOffer.planLabel} — ${formatPrice(content.upgradeOffer.price)}/${content.upgradeOffer.billingPeriod === 'monthly' ? 'мес' : 'год'}`
    : null;
  const resolvedPrimaryLabel = primaryButtonLabel
    ?? (content.code === 'SUBSCRIPTION_EXPIRED' ? 'Продлить доступ' : 'Перейти на тарифы');
  const isFeatureGate = content.code === FEATURE_GATE_CODES.ARCHIVE_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.RESOURCE_POOL_FEATURE_LOCKED
    || content.code === FEATURE_GATE_CODES.EXPORT_FEATURE_LOCKED;
  const resolvedSecondaryLabel = secondaryButtonLabel
    ?? (content.limitKey === 'ai_queries' ? 'Понятно' : isFeatureGate ? 'Закрыть' : 'Закрыть');

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      style={{ overscrollBehavior: 'contain' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="relative w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 bg-white p-6 shadow-2xl"
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
          <p>{content.description}</p>
          {content.limitKey && (
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
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="font-medium text-emerald-900">{content.upgradeHint}</p>
            {priceLine && (
              <p className="mt-1 text-emerald-800">
                Следующий шаг: {priceLine}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { window.location.href = actionHref; }}
            className="flex-1 h-11 rounded-xl bg-primary text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {resolvedPrimaryLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            {resolvedSecondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
