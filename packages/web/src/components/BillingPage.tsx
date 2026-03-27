/**
 * BillingPage — full billing UI for subscription management
 *
 * Shows: current plan, AI usage, limits, payment history,
 * plan upgrade cards with YooKassa embedded widget.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBillingStore } from '../stores/useBillingStore';

interface BillingPageProps {
  initialPlan?: string | null;
  onClose: () => void;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Бесплатный',
  start: 'Старт',
  team: 'Команда',
  enterprise: 'Корпоративный',
};

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  start: { monthly: 1490, yearly: 12000 },
  team: { monthly: 4990, yearly: 59880 },
  enterprise: { monthly: 12900, yearly: 154800 },
};

const PLAN_FEATURES: Record<string, string[]> = {
  start: [
    '5 проектов',
    '10 AI-генераций в месяц',
    '20 уточнений на проект',
    '20 ресурсов',
  ],
  team: [
    '20 проектов',
    'Безлимит AI-генераций',
    'Безлимит уточнений',
    'Безлимит ресурсов',
    '5 участников команды',
  ],
  enterprise: [
    'Безлимит всего',
    '20+ участников команды',
    'Приоритетная поддержка',
  ],
};

function formatPrice(price: number): string {
  return price.toLocaleString('ru-RU') + ' ₽';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₽';
}

function loadWidgetScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (document.getElementById('yookassa-widget')) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';
    s.id = 'yookassa-widget';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load YooKassa widget'));
    document.body.appendChild(s);
  });
}

export function BillingPage({ initialPlan, onClose }: BillingPageProps) {
  const {
    subscription,
    payments,
    loading,
    paymentLoading,
    paymentSuccess,
    paymentError,
    fetchSubscription,
    fetchPayments,
    createPayment,
    pollPaymentStatus,
    resetPaymentState,
  } = useBillingStore();

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(initialPlan ?? null);
  const paymentContainerRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<unknown>(null);

  useEffect(() => {
    void fetchSubscription();
    void fetchPayments();
  }, [fetchSubscription, fetchPayments]);

  // If initialPlan is set, pre-select the upgrade flow
  useEffect(() => {
    if (initialPlan) {
      setSelectedPlan(initialPlan);
    }
  }, [initialPlan]);

  const handleUpgrade = useCallback(async (plan: string) => {
    resetPaymentState();
    setSelectedPlan(plan);

    const result = await createPayment(plan, billingPeriod);
    if (!result) return;

    try {
      // Load YooKassa widget script
      await loadWidgetScript();

      // Clean up previous checkout instance
      if (checkoutRef.current && paymentContainerRef.current) {
        paymentContainerRef.current.innerHTML = '';
        checkoutRef.current = null;
      }

      // Create checkout widget
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YooMoneyCheckoutWidget = (window as any).YooMoneyCheckoutWidget;
      if (!YooMoneyCheckoutWidget) {
        useBillingStore.setState({ paymentError: 'Ошибка загрузки виджета оплаты' });
        return;
      }

      const checkout = new YooMoneyCheckoutWidget({
        confirmation_token: result.confirmationToken,
        embedded_kit: true,
        error_callback: (err: unknown) => {
          console.error('[YooKassa] Widget error:', err);
          useBillingStore.setState({ paymentError: 'Ошибка виджета оплаты' });
        },
      });
      checkoutRef.current = checkout;

      if (paymentContainerRef.current) {
        checkout.render('payment-form-container');
      }

      // Start polling
      const succeeded = await pollPaymentStatus(result.paymentId);
      if (succeeded) {
        setSelectedPlan(null);
      }
    } catch (err) {
      console.error('[BillingPage] Payment flow error:', err);
      useBillingStore.setState({ paymentError: String(err) });
    }
  }, [billingPeriod, createPayment, pollPaymentStatus, resetPaymentState]);

  const handleEnterpriseClick = useCallback(() => {
    window.location.href = 'mailto:support@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф';
  }, []);

  const aiUnlimited = subscription?.aiLimit === -1;
  const aiUsagePercent = !aiUnlimited && subscription
    ? Math.min(100, Math.round((subscription.aiUsed / subscription.aiLimit) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Управление подпиской</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Current Plan */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Текущий план</h2>
          {loading ? (
            <div className="text-gray-400">Загрузка...</div>
          ) : subscription ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-primary">
                  {PLAN_LABELS[subscription.plan] || subscription.plan}
                </span>
                {subscription.plan !== 'free' && (
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    subscription.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {subscription.isActive ? 'Активна' : 'Истекла'}
                  </span>
                )}
              </div>

              {subscription.periodEnd && (
                <p className="text-sm text-gray-500">
                  Действует до: {formatDate(subscription.periodEnd)}
                </p>
              )}

              {/* AI Usage Bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">AI-генерации</span>
                  <span className="text-gray-900 font-medium">
                    {aiUnlimited ? 'Безлимит' : `${subscription.aiUsed} / ${subscription.aiLimit}`}
                  </span>
                </div>
                {!aiUnlimited && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
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
            <div className="text-gray-400">Не удалось загрузить данные подписки</div>
          )}
        </div>

        {/* Plan Upgrade Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Улучшить тариф</h2>

          {/* Period Toggle */}
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gray-100 rounded-lg p-1 inline-flex">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  billingPeriod === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Месяц
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  billingPeriod === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Год
                <span className="ml-1 text-xs text-green-600 font-medium">-33%</span>
              </button>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['start', 'team', 'enterprise'] as const).map((plan) => {
              const prices = PLAN_PRICES[plan];
              const features = PLAN_FEATURES[plan];
              const isEnterprise = plan === 'enterprise';

              return (
                <div
                  key={plan}
                  className="bg-white rounded-xl border p-6 shadow-sm flex flex-col"
                >
                  <h3 className="text-lg font-semibold text-gray-900">{PLAN_LABELS[plan]}</h3>
                  <div className="mt-2 mb-4">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatPrice(prices[billingPeriod])}
                    </span>
                    <span className="text-gray-500 text-sm">
                      /{billingPeriod === 'monthly' ? 'мес' : 'год'}
                    </span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-green-500 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isEnterprise ? (
                    <a
                      href="mailto:support@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф"
                      className="w-full py-2.5 px-4 border border-gray-300 rounded-lg text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Напишите нам
                    </a>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan)}
                      disabled={paymentLoading}
                      className="w-full py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {paymentLoading && selectedPlan === plan ? 'Загрузка...' : 'Выбрать'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Widget Container */}
        {selectedPlan && selectedPlan !== 'enterprise' && (
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Оплата</h2>
            <div id="payment-form-container" ref={paymentContainerRef} />

            {paymentLoading && !paymentContainerRef.current?.innerHTML && (
              <div className="text-gray-400 text-sm">Загрузка формы оплаты...</div>
            )}
          </div>
        )}

        {/* Payment Success */}
        {paymentSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <svg className="h-12 w-12 text-green-500 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h3 className="text-lg font-semibold text-green-800 mb-1">Оплата прошла успешно!</h3>
            <p className="text-sm text-green-600">Ваш тариф обновлён. Данные обновятся автоматически.</p>
          </div>
        )}

        {/* Payment Error */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{paymentError}</p>
            <button
              onClick={resetPaymentState}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Payment History */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">История платежей</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-400">Нет платежей</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Дата</th>
                    <th className="pb-2 font-medium">Тариф</th>
                    <th className="pb-2 font-medium">Период</th>
                    <th className="pb-2 font-medium">Сумма</th>
                    <th className="pb-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2.5 text-gray-700">{formatDate(payment.createdAt)}</td>
                      <td className="py-2.5 text-gray-700">{PLAN_LABELS[payment.plan] || payment.plan}</td>
                      <td className="py-2.5 text-gray-700">{payment.period === 'monthly' ? 'Месяц' : 'Год'}</td>
                      <td className="py-2.5 text-gray-700">{formatAmount(payment.amount)}</td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          payment.status === 'succeeded'
                            ? 'bg-green-100 text-green-700'
                            : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
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
