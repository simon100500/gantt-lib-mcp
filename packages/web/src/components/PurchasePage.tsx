import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { LoginButton } from './LoginButton';
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

const FREE_FEATURES = [
  '1 проект',
  '20 AI-запросов (разово)',
  'Гостевые ссылки',
];

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
      window.location.href = 'mailto:ai@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф';
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
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
        <PublicPurchaseHeader
          isAuthenticated={isAuthenticated}
          userEmail={userEmail}
          onLoginRequired={onLoginRequired}
        />
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  resetPaymentState();
                  setCheckoutPlan(null);
                }}
                className="text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
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
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-slate-900">
      <PublicPurchaseHeader
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        onLoginRequired={onLoginRequired}
      />

      <main className="flex-1 overflow-y-auto bg-white px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <section className="mx-auto max-w-5xl">
          <a
            href="/account"
            className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 rounded"
          >
            ← Назад к Аккаунту
          </a>
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl" style={{ textWrap: 'balance' }}>Тарифы</h1>
              {paymentSuccess && (
                <p className="mt-2 text-sm text-green-700">Оплата прошла успешно. Переходим в аккаунт...</p>
              )}
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {(['free', 'start', 'team'] as const).map((plan) => {
              const prices = plan === 'free' ? null : PLAN_PRICES[plan];
              const features = plan === 'free' ? FREE_FEATURES : PLAN_FEATURES[plan];
              const isPreferred = preferredPlan === plan;
              const isAccent = plan === 'start';

              return (
                <article
                  key={plan}
                  className={`flex flex-col rounded-3xl border p-6 shadow-sm transition-all ${isAccent
                    ? 'border-primary/30 bg-primary/[0.045] text-slate-900 shadow-[0_20px_60px_-36px_rgba(97,88,224,0.35)]'
                    : 'border-slate-200 bg-white text-slate-900'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{PLAN_LABELS[plan]}</h3>
                    {plan === 'start' && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isAccent ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                        Популярный
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    {plan === 'free' ? (
                      <>
                        <span className="text-4xl font-bold">0 ₽</span>
                        <span className="ml-1 text-sm text-slate-500">/ всегда</span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">{formatPrice(PLAN_PRICES[plan][billingPeriod])}</span>
                        <span className="ml-1 text-sm text-slate-500">
                          /{billingPeriod === 'monthly' ? 'мес' : 'год'}
                        </span>
                        {billingPeriod === 'yearly' && (
                          <span className="mt-1 block text-sm text-emerald-600">
                            Экономия {formatPrice(PLAN_PRICES[plan].monthly * 12 - PLAN_PRICES[plan].yearly)} в год
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => {
                      if (plan === 'free') {
                        window.location.href = isAuthenticated ? '/account' : '/';
                        return;
                      }
                      handleChoosePlan(plan);
                    }}
                    className={`mt-8 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 ${plan === 'free'
                      ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                      : isAccent
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                      }`}
                  >
                    {plan === 'free' ? 'Продолжить бесплатно' : isAuthenticated ? `Перейти на ${PLAN_LABELS[plan]}` : `Войти и перейти на ${PLAN_LABELS[plan]}`}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Корпоративный от {formatPrice(PLAN_PRICES.enterprise.monthly)}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Безлимит проектов, расширенная команда и приоритетная поддержка для постоянного портфеля.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { window.location.href = 'mailto:ai@getgantt.ru?subject=Запрос%20на%20корпоративный%20тариф'; }}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                Напишите нам
              </button>
            </div>
          </div>

          <div className="mt-6 text-sm leading-relaxed text-slate-600">
            <h2 className="text-base font-semibold text-slate-900">Гарантии</h2>
            <div className="mt-3 space-y-2">
              <p>Это разовые платежи, не подписка. Каждый платёж вы подтверждаете вручную. Не продлевается автоматически. Вернём деньги, если тариф не понравится.</p>
            </div>
          </div>

          <div className="mt-6 text-sm leading-relaxed text-slate-600">
            <div className="space-y-2">
              <p>GetGantt предоставляет доступ к цифровому онлайн-сервису. Условия выбранного тарифа указаны на этой странице.</p>
              <p>
                Продолжая оплату, вы соглашаетесь с{' '}
                <a
                  href="https://getgantt.ru/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  пользовательским соглашением
                </a>
                .
              </p>
              <p>ИП Волобуев Дмитрий Юрьевич, ИНН 781902818607</p>
              <p>
                Контакт для обращений:{' '}
                <a
                  href="mailto:ai@getgantt.ru"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  ai@getgantt.ru
                </a>
              </p>
            </div>
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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-3 text-slate-900">
          <img
            src="/favicon.svg"
            alt=""
            width="18"
            height="18"
            className="h-[18px] w-[18px]"
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-semibold tracking-tight">ГетГант</div>
          </div>
        </a>
        <span className="text-sm text-slate-400" aria-hidden="true">/</span>
        <span className="text-sm font-medium text-slate-900">Тарифы</span>

        <div className="ml-auto flex items-center gap-3">
          {isAuthenticated ? (
            <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
          ) : (
            <LoginButton onClick={onLoginRequired} />
          )}
        </div>
      </div>
    </header>
  );
}
