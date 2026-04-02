import { PLAN_CATALOG, type BillingPeriod, type PlanId } from '@gantt/mcp/constraints';

export type { BillingPeriod, PlanId } from '@gantt/mcp/constraints';
export type PaidPlanId = 'start' | 'team';

export const PLAN_LABELS: Record<PlanId, string> = Object.fromEntries(
  Object.entries(PLAN_CATALOG).map(([planId, plan]) => [planId, plan.label]),
) as Record<PlanId, string>;

export const PLAN_PRICES: Record<'start' | 'team' | 'enterprise', Record<BillingPeriod, number>> = {
  start: PLAN_CATALOG.start.pricing,
  team: PLAN_CATALOG.team.pricing,
  enterprise: PLAN_CATALOG.enterprise.pricing,
};

export const PLAN_FEATURES: Record<'start' | 'team' | 'enterprise', string[]> = {
  start: [
    '3 активных проекта',
    '25 AI-запросов в день',
    'до 5 участников команды',
    'Архив проектов',
    'Пул ресурсов',
    'Экспорт в PDF',
    'Гостевые ссылки',
  ],
  team: [
    '7 активных проектов',
    '50 AI-запросов в день',
    'до 20 участников команды',
    'Архив проектов',
    'Пул ресурсов',
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
