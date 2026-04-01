/**
 * Plan configuration with env-driven prices and quotas
 *
 * Tariffs v5:
 * - free: 1 project, 20 AI requests (total), unlimited refinements, unlimited resources, 1 team
 * - start: 3 projects, 25 AI requests/day, unlimited refinements, unlimited resources, 1 team
 * - team: 7 projects, 50 AI requests/day, unlimited refinements, unlimited resources, 5 team
 * - enterprise: unlimited projects, 100 AI requests/day, unlimited refinements, unlimited resources, 20 team
 */

export type PlanKey = 'free' | 'start' | 'team' | 'enterprise';

export interface PlanLimits {
  projects: number;       // -1 = unlimited
  aiGenerations: number;  // -1 = unlimited
  aiRefinements: number;  // per project, -1 = unlimited
  resources: number;      // -1 = unlimited
  teamMembers: number;    // -1 = unlimited
}

export interface PlanPricing {
  monthly: number;   // price in rubles
  yearly: number;    // price in rubles
  description: string;
}

export interface PlanConfig {
  limits: PlanLimits;
  pricing: PlanPricing;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  return parseInt(val, 10);
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  free: {
    limits: {
      projects: envInt('PLAN_FREE_PROJECTS', 1),
      aiGenerations: envInt('PLAN_FREE_AI_GENERATIONS', 20),
      aiRefinements: envInt('PLAN_FREE_AI_REFINEMENTS', -1),
      resources: envInt('PLAN_FREE_RESOURCES', -1),
      teamMembers: envInt('PLAN_FREE_TEAM_MEMBERS', 1),
    },
    pricing: {
      monthly: envInt('PLAN_FREE_PRICE_MONTHLY', 0),
      yearly: envInt('PLAN_FREE_PRICE_YEARLY', 0),
      description: 'Сервис ГетГант. Тариф Бесплатный',
    },
  },
  start: {
    limits: {
      projects: envInt('PLAN_START_PROJECTS', 3),
      aiGenerations: envInt('PLAN_START_AI_GENERATIONS', 25),
      aiRefinements: envInt('PLAN_START_AI_REFINEMENTS', -1),
      resources: envInt('PLAN_START_RESOURCES', -1),
      teamMembers: envInt('PLAN_START_TEAM_MEMBERS', 1),
    },
    pricing: {
      monthly: envInt('PLAN_START_PRICE_MONTHLY', 1490),
      yearly: envInt('PLAN_START_PRICE_YEARLY', 11900),
      description: 'Сервис ГетГант. Тариф Старт',
    },
  },
  team: {
    limits: {
      projects: envInt('PLAN_TEAM_PROJECTS', 7),
      aiGenerations: envInt('PLAN_TEAM_AI_GENERATIONS', 50),
      aiRefinements: envInt('PLAN_TEAM_AI_REFINEMENTS', -1),
      resources: envInt('PLAN_TEAM_RESOURCES', -1),
      teamMembers: envInt('PLAN_TEAM_TEAM_MEMBERS', 5),
    },
    pricing: {
      monthly: envInt('PLAN_TEAM_PRICE_MONTHLY', 4990),
      yearly: envInt('PLAN_TEAM_PRICE_YEARLY', 47900),
      description: 'Сервис ГетГант. Тариф Команда',
    },
  },
  enterprise: {
    limits: {
      projects: envInt('PLAN_ENTERPRISE_PROJECTS', -1),
      aiGenerations: envInt('PLAN_ENTERPRISE_AI_GENERATIONS', 100),
      aiRefinements: envInt('PLAN_ENTERPRISE_AI_REFINEMENTS', -1),
      resources: envInt('PLAN_ENTERPRISE_RESOURCES', -1),
      teamMembers: envInt('PLAN_ENTERPRISE_TEAM_MEMBERS', 20),
    },
    pricing: {
      monthly: envInt('PLAN_ENTERPRISE_PRICE_MONTHLY', 12900),
      yearly: envInt('PLAN_ENTERPRISE_PRICE_YEARLY', 129000),
      description: 'Сервис ГетГант. Тариф Корпоративный',
    },
  },
};

export function getPlanLimits(plan: PlanKey): PlanLimits {
  return PLAN_CONFIG[plan]?.limits ?? PLAN_CONFIG.free.limits;
}

export function getPlanPricing(plan: PlanKey, period: 'monthly' | 'yearly'): number {
  return PLAN_CONFIG[plan]?.pricing[period] ?? 0;
}

export function isPlanActive(periodEnd: string | null): boolean {
  if (!periodEnd) return false;
  return new Date(periodEnd).getTime() > Date.now();
}
