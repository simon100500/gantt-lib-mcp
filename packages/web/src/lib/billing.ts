export type BillingPeriod = 'monthly' | 'yearly';
export type PlanId = 'free' | 'start' | 'team' | 'enterprise';
export type PaidPlanId = 'start' | 'team';

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Бесплатный',
  start: 'Старт',
  team: 'Команда',
  enterprise: 'Корпоративный',
};

export const PLAN_PRICES: Record<'start' | 'team' | 'enterprise', Record<BillingPeriod, number>> = {
  start: { monthly: 1490, yearly: 11900 },
  team: { monthly: 4990, yearly: 47900 },
  enterprise: { monthly: 12900, yearly: 129000 },
};

export const PLAN_FEATURES: Record<'start' | 'team' | 'enterprise', string[]> = {
  start: [
    '3 активных проекта',
    '25 AI-запросов в день',
    'Архив проектов',
    'Пул ресурсов',
    'Экспорт в PDF',
    'Гостевые ссылки',
  ],
  team: [
    '7 активных проекта',
    '50 AI-запросов в день',
    'Архив проектов',
    'Пул ресурсов',
    '5 участников команды',
    'Экспорт PDF + Excel',
    'Гостевые ссылки',
  ],
  enterprise: [
    'Безлимит проектов',
    '100 AI-запросов в день',
    '20 участников команды',
    'Экспорт PDF + Excel + API',
    'Приоритетная поддержка',
  ],
};

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlanId {
  return plan === 'start' || plan === 'team';
}

export function formatPrice(price: number): string {
  return price.toLocaleString('ru-RU') + ' ₽';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₽';
}

export function loadWidgetScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (document.getElementById('yookassa-widget')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';
    script.id = 'yookassa-widget';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load YooKassa widget'));
    document.body.appendChild(script);
  });
}
