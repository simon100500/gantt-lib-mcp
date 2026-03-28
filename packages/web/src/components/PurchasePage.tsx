import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { LoginButton } from './LoginButton';
import { Button } from './ui/button';
import { useBillingStore } from '../stores/useBillingStore';
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  formatPrice,
  isPaidPlan,
  loadWidgetScript,
  type BillingPeriod,
  type PaidPlanId,
} from '../lib/billing';

interface PurchasePageProps {
  initialPlan?: string | null;
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
}

export function PurchasePage({
  initialPlan,
  isAuthenticated,
  userEmail,
  onLoginRequired,
}: PurchasePageProps) {
  const {
    paymentLoading,
    paymentStatusChecking,
    paymentSuccess,
    paymentError,
    activePaymentId,
    createPayment,
    pollPaymentStatus,
    resumePaymentStatusCheck,
    resetPaymentState,
  } = useBillingStore();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlanId | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<{ plan: PaidPlanId; period: BillingPeriod } | null>(null);
  const [preferredPlan, setPreferredPlan] = useState<PaidPlanId | null>(() => (
    isPaidPlan(initialPlan) ? initialPlan : null
  ));
  const paymentContainerRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<unknown>(null);

  useEffect(() => {
    if (isPaidPlan(initialPlan)) {
      setPreferredPlan(initialPlan);
    }
  }, [initialPlan]);

  const startCheckout = useCallback(async (plan: PaidPlanId, period: BillingPeriod) => {
    resetPaymentState();
    setCheckoutPlan(plan);

    const result = await createPayment(plan, period);
    if (!result) {
      setCheckoutPlan(null);
      return;
    }

    try {
      await loadWidgetScript();

      if (checkoutRef.current && paymentContainerRef.current) {
        paymentContainerRef.current.innerHTML = '';
        checkoutRef.current = null;
      }

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
          console.error('[PurchasePage] Widget error:', err);
          useBillingStore.setState({ paymentError: 'Ошибка виджета оплаты' });
        },
      });
      checkoutRef.current = checkout;

      if (paymentContainerRef.current) {
        checkout.render('payment-form-container');
      }

      const succeeded = await pollPaymentStatus(result.paymentId);
      if (succeeded) {
        setCheckoutPlan(null);
      }
    } catch (err) {
      console.error('[PurchasePage] Payment flow error:', err);
      useBillingStore.setState({ paymentError: String(err) });
    }
  }, [createPayment, pollPaymentStatus, resetPaymentState]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void resumePaymentStatusCheck();
  }, [isAuthenticated, resumePaymentStatusCheck]);

  useEffect(() => {
    if (!isAuthenticated || !pendingCheckout) {
      return;
    }

    const pending = pendingCheckout;
    setPendingCheckout(null);
    void startCheckout(pending.plan, pending.period);
  }, [isAuthenticated, pendingCheckout, startCheckout]);

  useEffect(() => () => {
    if (paymentContainerRef.current) {
      paymentContainerRef.current.innerHTML = '';
    }
    checkoutRef.current = null;
  }, []);

  useEffect(() => {
    if (!paymentSuccess || !isAuthenticated) {
      return;
    }

    const redirectTimer = window.setTimeout(() => {
      window.location.href = '/account';
    }, 1200);

    return () => window.clearTimeout(redirectTimer);
  }, [isAuthenticated, paymentSuccess]);

  const handleChoosePlan = useCallback((plan: 'start' | 'team' | 'enterprise') => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:support@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф';
      return;
    }

    setPreferredPlan(plan);
    if (!isAuthenticated) {
      setPendingCheckout({ plan, period: billingPeriod });
      onLoginRequired();
      return;
    }

    void startCheckout(plan, billingPeriod);
  }, [billingPeriod, isAuthenticated, onLoginRequired, startCheckout]);

  const checkoutMode = Boolean(checkoutPlan && !paymentSuccess);

  if (checkoutMode && checkoutPlan) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <PublicPurchaseHeader
          isAuthenticated={isAuthenticated}
          userEmail={userEmail}
          onLoginRequired={onLoginRequired}
        />
        <div className="px-4 py-8 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  resetPaymentState();
                  setCheckoutPlan(null);
                }}
                className="text-slate-500 transition-colors hover:text-slate-800"
                aria-label="Вернуться к тарифам"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Оплата тарифа {PLAN_LABELS[checkoutPlan]}</h1>
                <p className="text-sm text-slate-500">
                  {formatPrice(PLAN_PRICES[checkoutPlan][billingPeriod])} / {billingPeriod === 'monthly' ? 'месяц' : 'год'}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div id="payment-form-container" ref={paymentContainerRef} />

              {paymentLoading && !paymentContainerRef.current?.innerHTML && (
                <div className="text-sm text-slate-400">Загрузка формы оплаты...</div>
              )}

              {paymentError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">{paymentError}</p>
                  <button
                    type="button"
                    onClick={resetPaymentState}
                    className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                  >
                    Скрыть ошибку
                  </button>
                  {activePaymentId && !paymentStatusChecking && (
                    <button
                      type="button"
                      onClick={() => void resumePaymentStatusCheck()}
                      className="ml-4 mt-2 text-sm text-red-600 underline hover:text-red-800"
                    >
                      Проверить снова
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] text-slate-900">
      <PublicPurchaseHeader
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        onLoginRequired={onLoginRequired}
      />

      <main className="px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <section className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Оплата</h1>
              {paymentSuccess && (
                <p className="mt-2 text-sm text-green-700">Оплата прошла успешно. Переходим в аккаунт...</p>
              )}
            </div>

            <div className="inline-flex w-fit rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setBillingPeriod('monthly')}
                className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                  billingPeriod === 'monthly'
                    ? 'bg-slate-900 font-medium text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Месяц
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('yearly')}
                className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                  billingPeriod === 'yearly'
                    ? 'bg-slate-900 font-medium text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Год
                <span className="ml-1 text-xs text-emerald-400">-33%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {(['start', 'team', 'enterprise'] as const).map((plan) => {
              const prices = PLAN_PRICES[plan];
              const features = PLAN_FEATURES[plan];
              const isPreferred = preferredPlan === plan;

              return (
                <article
                  key={plan}
                  className={`flex flex-col rounded-3xl border p-6 shadow-sm transition-all ${
                    isPreferred
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{PLAN_LABELS[plan]}</h3>
                    {plan === 'start' && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        isPreferred ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        Популярный
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <span className="text-4xl font-bold">{formatPrice(prices[billingPeriod])}</span>
                    <span className={`ml-1 text-sm ${isPreferred ? 'text-slate-300' : 'text-slate-500'}`}>
                      /{billingPeriod === 'monthly' ? 'мес' : 'год'}
                    </span>
                  </div>

                  <ul className={`mt-6 flex-1 space-y-3 text-sm ${isPreferred ? 'text-slate-100' : 'text-slate-600'}`}>
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${isPreferred ? 'text-emerald-300' : 'text-emerald-500'}`} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleChoosePlan(plan)}
                    className={`mt-8 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                      isPreferred
                        ? 'bg-white text-slate-900 hover:bg-slate-100'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {plan === 'enterprise' ? 'Напишите нам' : isAuthenticated ? 'Купить' : 'Войти и купить'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

interface PublicPurchaseHeaderProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
}

function PublicPurchaseHeader({ isAuthenticated, userEmail, onLoginRequired }: PublicPurchaseHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-3 text-slate-900">
          <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
          <div>
            <div className="text-sm font-semibold tracking-tight">GetGantt Purchase</div>
            <div className="text-xs text-slate-500">Тарифы и оплата</div>
          </div>
        </a>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
              <Button variant="outline" size="sm" onClick={() => { window.location.href = '/account'; }}>
                В аккаунт
              </Button>
            </>
          ) : (
            <LoginButton onClick={onLoginRequired} />
          )}
        </div>
      </div>
    </header>
  );
}
