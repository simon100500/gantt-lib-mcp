import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useBillingStore } from '../stores/useBillingStore';
import { PLAN_LABELS, formatAmount, formatDate } from '../lib/billing';

interface AccountBillingPageProps {
  onClose: () => void;
}

export function AccountBillingPage({ onClose }: AccountBillingPageProps) {
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

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[#f4f5f7] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={onClose}
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад к проекту
            </button>
            <h1 className="text-2xl font-semibold text-slate-900">Подписка и платежи</h1>
            <p className="mt-1 text-sm text-slate-500">Текущий тариф, лимиты и история оплат в одном месте.</p>
          </div>
          <button
            type="button"
            onClick={() => { window.location.href = '/purchase'; }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Перейти к покупке
          </button>
        </div>

        {paymentSuccess && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
            <h2 className="text-base font-semibold">Оплата прошла успешно</h2>
            <p className="mt-1 text-sm text-green-700">Подписка обновлена, срок действия уже пересчитан.</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Текущий план</h2>
          {loading ? (
            <div className="mt-4 text-sm text-slate-400">Загрузка...</div>
          ) : error ? (
            <div className="mt-4 text-sm text-red-600">{error}</div>
          ) : subscription ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-2xl font-bold text-primary">
                  {PLAN_LABELS[(subscription.plan as keyof typeof PLAN_LABELS)] || subscription.plan}
                </span>
                {subscription.plan !== 'free' && (
                  <span className={`rounded-full px-3 py-1 text-sm ${
                    subscription.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {subscription.isActive ? 'Активна' : 'Истекла'}
                  </span>
                )}
              </div>

              {subscription.periodEnd && (
                <p className="text-sm text-slate-500">Действует до: {formatDate(subscription.periodEnd)}</p>
              )}

              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-600">AI-генерации</span>
                  <span className="font-medium text-slate-900">
                    {aiUnlimited ? 'Безлимит' : `${subscription.aiUsed} / ${subscription.aiLimit}`}
                  </span>
                </div>
                {!aiUnlimited && (
                  <div className="h-2.5 w-full rounded-full bg-slate-200">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        aiUsagePercent >= 90 ? 'bg-red-500' : aiUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-primary'
                      }`}
                      style={{ width: `${aiUsagePercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">Не удалось загрузить данные подписки.</div>
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
                    <th className="pb-2 font-medium">Сумма</th>
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
                      <td className="py-2.5 text-slate-700">{formatAmount(payment.amount)}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          payment.status === 'succeeded'
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
    </div>
  );
}
