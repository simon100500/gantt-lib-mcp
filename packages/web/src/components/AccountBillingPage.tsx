import { useEffect } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useBillingStore } from '../stores/useBillingStore';
import { PLAN_LABELS, formatAmount, formatDate } from '../lib/billing';
import type { PlanId } from '../lib/billing';

const CURRENT_PLAN_FEATURES: Record<string, string[]> = {
  free: [
    '1&nbsp;проект',
    '20&nbsp;AI-запросов (разово)',
    'Гостевые ссылки',
  ],
  start: [
    '3&nbsp;проекта',
    '25&nbsp;AI-запросов в день',
    'Архив проектов',
    'Пул ресурсов',
    'PDF-экспорт',
  ],
  team: [
    '7&nbsp;проектов',
    '50&nbsp;AI-запросов в день',
    '5&nbsp;участников',
    'Excel-экспорт',
  ],
};

const UPGRADE_GAINS: Record<string, { title: string; gains: string[] }> = {
  free: {
    title: 'Старт',
    gains: [
      '3&nbsp;проекта',
      '25&nbsp;AI-запросов в день',
      'Архив проектов',
      'Пул ресурсов',
      'PDF-экспорт',
    ],
  },
  start: {
    title: 'Команда',
    gains: [
      '7&nbsp;проектов',
      '50&nbsp;AI-запросов в день',
      '5&nbsp;участников',
      'Excel-экспорт',
    ],
  },
  team: {
    title: 'Корпоративный',
    gains: [
      'Безлимит проектов',
      '100&nbsp;AI-запросов в день',
      '20&nbsp;участников',
      'API-экспорт',
      'Приоритетная поддержка',
    ],
  },
};

export function AccountBillingPage() {
  const {
    subscription,
    payments,
    loading,
    error,
    paymentSuccess,
    fetchSubscription,
    fetchPayments,
  } = useBillingStore();

  useEffect(() => {
    void fetchSubscription();
    void fetchPayments();
  }, [fetchPayments, fetchSubscription]);

  const aiUnlimited = subscription?.aiLimit === -1;
  const aiUsagePercent = !aiUnlimited && subscription
    ? Math.min(100, Math.round((subscription.aiUsed / subscription.aiLimit) * 100))
    : 0;

  const currentPlan = subscription?.plan as PlanId | undefined;
  const upgrade = currentPlan ? UPGRADE_GAINS[currentPlan] : null;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 rounded"
        >
          ← Назад к приложению
        </a>
        {paymentSuccess && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800" role="alert">
            <h2 className="text-base font-semibold">Оплата прошла успешно</h2>
            <p className="mt-1 text-sm text-green-700">Подписка обновлена, срок действия уже пересчитан.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: current plan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900" style={{ textWrap: 'balance' }}>
              Текущий тариф
            </h1>

            {loading ? (
              <div className="mt-4 text-sm text-slate-400">Загрузка…</div>
            ) : error ? (
              <div className="mt-4 text-sm text-red-600">{error}</div>
            ) : subscription ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-2xl font-bold text-primary">
                      {PLAN_LABELS[(subscription.plan as keyof typeof PLAN_LABELS)] || subscription.plan}
                    </span>
                    {subscription.periodEnd && (
                      <p className="mt-2 text-sm text-slate-500">Действует до: {formatDate(subscription.periodEnd)}</p>
                    )}
                  </div>
                  {subscription.plan !== 'free' && (
                    <span className={`rounded-full px-3 py-1 text-sm ${subscription.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {subscription.isActive ? 'Активна' : 'Истекла'}
                    </span>
                  )}
                </div>

                {CURRENT_PLAN_FEATURES[subscription.plan] && (
                  <ul className="space-y-1.5 text-sm text-slate-600">
                    {CURRENT_PLAN_FEATURES[subscription.plan].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span dangerouslySetInnerHTML={{ __html: f }} />
                      </li>
                    ))}
                  </ul>
                )}

                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-600">AI-запросы</span>
                    <span className="font-medium tabular-nums text-slate-900">
                      {aiUnlimited ? 'Безлимит' : `${subscription.aiUsed} / ${subscription.aiLimit}`}
                    </span>
                  </div>
                  {!aiUnlimited && (
                    <div
                      className="h-2.5 w-full rounded-full bg-slate-200"
                      role="progressbar"
                      aria-valuenow={aiUsagePercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-2.5 rounded-full transition-all ${aiUsagePercent >= 90 ? 'bg-red-500' : aiUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-primary'
                          }`}
                        style={{ width: `${aiUsagePercent}%` }}
                      />
                    </div>
                  )}
                </div>

                {!aiUnlimited && aiUsagePercent >= 80 && aiUsagePercent < 100 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
                    <p className="text-sm text-amber-800">Осталось мало запросов. Расширьте тариф, чтобы не останавливать работу.</p>
                  </div>
                )}

                {!aiUnlimited && aiUsagePercent >= 100 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
                    <p className="text-sm text-red-800">AI-запросы закончились. Обновите тариф для продолжения работы.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-400">Не удалось загрузить данные подписки.</div>
            )}
          </div>

          {/* Right: upgrade card */}
          {upgrade && (
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Расширение до {upgrade.title}</h2>
              <p className="mt-1 text-sm text-slate-500">Будет доступно:</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {upgrade.gains.map((gain) => (
                  <li key={gain} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span dangerouslySetInnerHTML={{ __html: gain }} />
                  </li>
                ))}
              </ul>
              <a
                href="/purchase"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
              >
                Перейти на {upgrade.title}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">История платежей</h2>
          {payments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Платежей пока нет.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">Дата</th>
                    <th className="pb-2 font-medium">Тариф</th>
                    <th className="pb-2 font-medium">Период</th>
                    <th className="pb-2 font-medium tabular-nums">Сумма</th>
                    <th className="pb-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2.5 text-slate-700">{formatDate(payment.createdAt)}</td>
                      <td className="py-2.5 text-slate-700">
                        {PLAN_LABELS[(payment.plan as keyof typeof PLAN_LABELS)] || payment.plan}
                      </td>
                      <td className="py-2.5 text-slate-700">{payment.period === 'monthly' ? 'Месяц' : 'Год'}</td>
                      <td className="py-2.5 tabular-nums text-slate-700">{formatAmount(payment.amount)}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${payment.status === 'succeeded'
                          ? 'bg-green-100 text-green-700'
                          : payment.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                          {payment.status === 'succeeded' ? 'Успешно' : payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
