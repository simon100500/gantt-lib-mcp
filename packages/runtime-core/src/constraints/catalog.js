export const UNLIMITED = 'unlimited';
export const LIMIT_CATALOG = {
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
export const PLAN_CATALOG = {
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
export function getPlanCatalog() {
    return PLAN_CATALOG;
}
export function getLimitCatalog() {
    return LIMIT_CATALOG;
}
export function getPlanDefinition(planId) {
    return PLAN_CATALOG[planId];
}
export function getPlanPricing(planId) {
    return PLAN_CATALOG[planId].pricing;
}
export function getPlanLabel(planId) {
    return PLAN_CATALOG[planId].label;
}
export function getPlanLimit(planId, limitKey) {
    return PLAN_CATALOG[planId].limits[limitKey];
}
export function isUnlimited(value) {
    return value === UNLIMITED;
}
//# sourceMappingURL=catalog.js.map