import {
  PLAN_CATALOG,
  getPlanLimit as getCatalogPlanLimit,
  type BillingPeriod,
  type ExportAccessLevel,
  type PlanId,
  type Unlimited,
} from '@gantt/mcp/constraints';

export type PlanKey = PlanId;
export type LegacyUnlimited = -1;
export type LegacyNumericLimit = number | LegacyUnlimited;

export interface PlanLimits {
  projects: LegacyNumericLimit;
  aiGenerations: number;
  aiRefinements: LegacyUnlimited;
  resources: LegacyUnlimited;
  teamMembers: number;
  archive: boolean;
  resource_pool: boolean;
  export: ExportAccessLevel;
}

export interface PlanPricing {
  monthly: number;
  yearly: number;
  description: string;
}

export interface PlanConfig {
  label: string;
  limits: PlanLimits;
  pricing: PlanPricing;
}

function toLegacyUnlimited(value: number | Unlimited): LegacyNumericLimit {
  return value === 'unlimited' ? -1 : value;
}

function getDescription(plan: PlanKey): string {
  return `Сервис ГетГант. Тариф ${PLAN_CATALOG[plan].label}`;
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  free: {
    label: PLAN_CATALOG.free.label,
    limits: {
      projects: toLegacyUnlimited(PLAN_CATALOG.free.limits.projects),
      aiGenerations: PLAN_CATALOG.free.limits.ai_queries.value,
      aiRefinements: -1,
      resources: -1,
      teamMembers: 1,
      archive: PLAN_CATALOG.free.limits.archive,
      resource_pool: PLAN_CATALOG.free.limits.resource_pool,
      export: PLAN_CATALOG.free.limits.export,
    },
    pricing: { ...PLAN_CATALOG.free.pricing, description: getDescription('free') },
  },
  start: {
    label: PLAN_CATALOG.start.label,
    limits: {
      projects: toLegacyUnlimited(PLAN_CATALOG.start.limits.projects),
      aiGenerations: PLAN_CATALOG.start.limits.ai_queries.value,
      aiRefinements: -1,
      resources: -1,
      teamMembers: 1,
      archive: PLAN_CATALOG.start.limits.archive,
      resource_pool: PLAN_CATALOG.start.limits.resource_pool,
      export: PLAN_CATALOG.start.limits.export,
    },
    pricing: { ...PLAN_CATALOG.start.pricing, description: getDescription('start') },
  },
  team: {
    label: PLAN_CATALOG.team.label,
    limits: {
      projects: toLegacyUnlimited(PLAN_CATALOG.team.limits.projects),
      aiGenerations: PLAN_CATALOG.team.limits.ai_queries.value,
      aiRefinements: -1,
      resources: -1,
      teamMembers: 5,
      archive: PLAN_CATALOG.team.limits.archive,
      resource_pool: PLAN_CATALOG.team.limits.resource_pool,
      export: PLAN_CATALOG.team.limits.export,
    },
    pricing: { ...PLAN_CATALOG.team.pricing, description: getDescription('team') },
  },
  enterprise: {
    label: PLAN_CATALOG.enterprise.label,
    limits: {
      projects: toLegacyUnlimited(PLAN_CATALOG.enterprise.limits.projects),
      aiGenerations: PLAN_CATALOG.enterprise.limits.ai_queries.value,
      aiRefinements: -1,
      resources: -1,
      teamMembers: 20,
      archive: PLAN_CATALOG.enterprise.limits.archive,
      resource_pool: PLAN_CATALOG.enterprise.limits.resource_pool,
      export: PLAN_CATALOG.enterprise.limits.export,
    },
    pricing: { ...PLAN_CATALOG.enterprise.pricing, description: getDescription('enterprise') },
  },
};

export function getPlanLimits(plan: PlanKey): PlanLimits {
  return PLAN_CONFIG[plan]?.limits ?? PLAN_CONFIG.free.limits;
}

export function getPlanPricing(plan: PlanKey, period: BillingPeriod): number {
  return PLAN_CONFIG[plan]?.pricing[period] ?? 0;
}

export function getCanonicalPlanLimit(
  plan: PlanKey,
  limitKey: 'projects' | 'ai_queries' | 'archive' | 'resource_pool' | 'export',
) {
  return getCatalogPlanLimit(plan, limitKey);
}

export function isPlanActive(periodEnd: string | null): boolean {
  if (!periodEnd) return false;
  return new Date(periodEnd).getTime() > Date.now();
}
