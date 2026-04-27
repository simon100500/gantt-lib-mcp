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
export type LimitMetadata = CountLimitMetadata | UsageLimitMetadata | BooleanLimitMetadata | AccessLevelLimitMetadata;
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
export declare const UNLIMITED: Unlimited;
export declare const LIMIT_CATALOG: Record<LimitKey, LimitMetadata>;
export declare const PLAN_CATALOG: Record<PlanId, PlanDefinition>;
export declare function getPlanCatalog(): Record<PlanId, PlanDefinition>;
export declare function getLimitCatalog(): Record<LimitKey, LimitMetadata>;
export declare function getPlanDefinition(planId: PlanId): PlanDefinition;
export declare function getPlanPricing(planId: PlanId): Pricing;
export declare function getPlanLabel(planId: PlanId): string;
export declare function getPlanLimit<K extends LimitKey>(planId: PlanId, limitKey: K): PlanDefinition['limits'][K];
export declare function isUnlimited(value: number | Unlimited): value is Unlimited;
//# sourceMappingURL=catalog.d.ts.map