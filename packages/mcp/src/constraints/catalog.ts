export type PlanId = 'free' | 'start' | 'team' | 'enterprise';
export type BillingPeriod = 'monthly' | 'yearly';
export type LimitKey = 'projects' | 'ai_queries' | 'archive' | 'resource_pool' | 'export';
export type Unlimited = 'unlimited';
export type ExportAccessLevel = 'none' | 'pdf' | 'pdf_excel' | 'pdf_excel_api';
export type LimitValueKind = 'count' | 'usage' | 'boolean' | 'access_level';
export type UsageLimitPeriod = 'daily' | 'lifetime';

export interface CountLimitMetadata {
  key: 'projects';
  label: string;
  valueKind: 'count';
}

export interface UsageLimitMetadata {
  key: 'ai_queries';
  label: string;
  valueKind: 'usage';
}

export interface BooleanLimitMetadata {
  key: 'archive' | 'resource_pool';
  label: string;
  valueKind: 'boolean';
}

export interface AccessLevelLimitMetadata {
  key: 'export';
  label: string;
  valueKind: 'access_level';
}

export type LimitMetadata =
  | CountLimitMetadata
  | UsageLimitMetadata
  | BooleanLimitMetadata
  | AccessLevelLimitMetadata;

export interface Pricing {
  monthly: number;
  yearly: number;
}

export interface UsageLimitValue {
  period: UsageLimitPeriod;
  value: number;
}

export interface PlanDefinition {
  label: string;
  pricing: Pricing;
  limits: {
    projects: number | Unlimited;
    ai_queries: UsageLimitValue;
    archive: boolean;
    resource_pool: boolean;
    export: ExportAccessLevel;
  };
}

export const UNLIMITED: Unlimited = 'unlimited';

export const LIMIT_CATALOG: Record<LimitKey, LimitMetadata> = {
  projects: {
    key: 'projects',
    label: 'Проекты',
    valueKind: 'count',
  },
  ai_queries: {
    key: 'ai_queries',
    label: 'AI-запросы',
    valueKind: 'usage',
  },
  archive: {
    key: 'archive',
    label: 'Архив проектов',
    valueKind: 'boolean',
  },
  resource_pool: {
    key: 'resource_pool',
    label: 'Пул ресурсов',
    valueKind: 'boolean',
  },
  export: {
    key: 'export',
    label: 'Экспорт',
    valueKind: 'access_level',
  },
};

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    label: 'Бесплатный',
    pricing: {
      monthly: 0,
      yearly: 0,
    },
    limits: {
      projects: 1,
      ai_queries: { period: 'lifetime', value: 20 },
      archive: true,
      resource_pool: false,
      export: 'none',
    },
  },
  start: {
    label: 'Старт',
    pricing: {
      monthly: 1490,
      yearly: 11900,
    },
    limits: {
      projects: 5,
      ai_queries: { period: 'daily', value: 25 },
      archive: true,
      resource_pool: true,
      export: 'pdf',
    },
  },
  team: {
    label: 'Команда',
    pricing: {
      monthly: 4990,
      yearly: 47900,
    },
    limits: {
      projects: 15,
      ai_queries: { period: 'daily', value: 50 },
      archive: true,
      resource_pool: true,
      export: 'pdf_excel',
    },
  },
  enterprise: {
    label: 'Корпоративный',
    pricing: {
      monthly: 12900,
      yearly: 129000,
    },
    limits: {
      projects: 'unlimited',
      ai_queries: { period: 'daily', value: 100 },
      archive: true,
      resource_pool: true,
      export: 'pdf_excel_api',
    },
  },
};

export function getPlanCatalog(): Record<PlanId, PlanDefinition> {
  return PLAN_CATALOG;
}

export function getLimitCatalog(): Record<LimitKey, LimitMetadata> {
  return LIMIT_CATALOG;
}

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return PLAN_CATALOG[planId];
}

export function getPlanPricing(planId: PlanId): Pricing {
  return PLAN_CATALOG[planId].pricing;
}

export function getPlanLabel(planId: PlanId): string {
  return PLAN_CATALOG[planId].label;
}

export function getPlanLimit<K extends LimitKey>(planId: PlanId, limitKey: K): PlanDefinition['limits'][K] {
  return PLAN_CATALOG[planId].limits[limitKey];
}

export function isUnlimited(value: number | Unlimited): value is Unlimited {
  return value === UNLIMITED;
}
