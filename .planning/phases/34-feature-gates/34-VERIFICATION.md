---
phase: 34-feature-gates
verified: 2026-04-04T12:00:00Z
status: passed
score: 3/3 must-haves verified
---

# Phase 34: Feature Gates Verification Report

**Phase Goal:** Boolean gates for archive, resource pool, export tiers
**Verified:** 2026-04-04T12:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Archive available on Start+; free users see upsell modal instead of functionality | VERIFIED | Server: `requireFeatureGate('archive')` guard on `/api/projects/:id/archive` sends `ARCHIVE_FEATURE_LOCKED` 403. Frontend: `handleArchiveProject` short-circuits via `buildProactiveConstraintDenial('archive')`. Catalog: `archive: false` for free, `true` for start/team/enterprise. Tests: server middleware + route contract tests, frontend billing selectors + constraint UI tests. |
| 2 | Resource pool available on Start+; free users see upsell modal | VERIFIED | Frontend: `handleOpenResourcePool` builds `RESOURCE_POOL_FEATURE_LOCKED` proactive denial. ProjectSwitcher renders "Пул ресурсов" button with `onOpenResourcePool` callback. Catalog: `resource_pool: false` for free, `true` for start/team/enterprise. |
| 3 | Export formats differentiated by plan: PDF on Start, PDF+Excel on Team, PDF+Excel+API on Enterprise | VERIFIED | `ExportAccessCard` renders PDF/Excel/API badges with plan-aware availability. `handleRequestExportLevel` uses ordered level comparison to gate locked tiers. Catalog: `export: 'none'/'pdf'/'pdf_excel'/'pdf_excel_api'` per plan. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/server/src/middleware/constraint-middleware.ts` | Reusable `requireFeatureGate` middleware helper | VERIFIED | Lines 130-162: `requireFeatureGate(limitKey, options)` function. Exports on line 171. |
| `packages/server/src/routes/auth-routes.ts` | Archive route preHandler with `requireArchiveAccess` | VERIFIED | Line 28-31: `requireArchiveAccess` defined. Line 411: wired as preHandler on archive route. |
| `packages/server/src/routes/auth-routes.test.ts` | Archive route contract coverage | VERIFIED | Lines 35-53: tests guard composition and delete exclusion. |
| `packages/server/src/middleware/constraint-middleware.test.ts` | Feature-gate denial tests | VERIFIED | Lines 154-227: `ARCHIVE_FEATURE_LOCKED` denial, `feature_disabled` reasonCode, `remaining: null`. |
| `packages/web/src/stores/useBillingStore.ts` | Typed selectors for archive/resource_pool/export | VERIFIED | Lines 140-163: `getArchiveAccess`, `getResourcePoolAccess`, `getExportAccessLevel`. `ExportAccessLevel` type on line 91. |
| `packages/web/src/lib/constraintUi.ts` | Expanded gate normalization with feature-gate codes | VERIFIED | Lines 21-82: `ConstraintLimitKey` includes archive/resource_pool/export. Lines 129-133: `FEATURE_GATE_CODES`. Lines 257-268: export tier descriptions and upgrade tiers. |
| `packages/web/src/components/LimitReachedModal.tsx` | Modal support for feature-gate denials | VERIFIED | Lines 79-83: detects feature-gate codes for button label resolution. Renders structured content from `buildConstraintModalContent`. |
| `packages/web/src/App.tsx` | Archive/resource-pool/export gate wiring | VERIFIED | Lines 48-86: `buildProactiveConstraintDenial` for boolean gates. Lines 756-762: `handleArchiveProject` short-circuits. Lines 768-775: `handleOpenResourcePool`. Lines 378-400: `handleRequestExportLevel`. Lines 333-416: `constraintDenial` bridge + effect. |
| `packages/web/src/components/ProjectSwitcher.tsx` | Resource-pool upsell entrypoint | VERIFIED | Lines 23, 228, 316-325: `onOpenResourcePool` prop and "Пул ресурсов" button with Layers icon. |
| `packages/web/src/components/layout/ProjectMenu.tsx` | Export access card with tier badges | VERIFIED | Lines 46-92: `EXPORT_TIERS`, `ExportAccessCard` component with PDF/Excel/API badges. Line 42: `onRequestExportLevel` prop. Lines 154-157: wired in billing footer. |
| `packages/web/src/stores/__tests__/billingSelectors.test.ts` | 13 tests for billing selectors | VERIFIED | Covers getArchiveAccess, getResourcePoolAccess, getExportAccessLevel with null/false/true/level cases. |
| `packages/web/src/lib/__tests__/constraintUi.test.ts` | 10 tests for constraint UI | VERIFIED | Covers feature-gate normalization, modal content for all 3 gates, export tier descriptions, legacy compatibility. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth-routes.ts` | `constraint-middleware.ts` | `requireArchiveAccess` preHandler import | WIRED | Line 21: imports `requireFeatureGate`. Line 28: `const requireArchiveAccess = requireFeatureGate('archive', ...)`. Line 411: preHandler array `[authMiddleware, requireArchiveAccess]`. |
| `constraint-middleware.ts` | `constraint-service.ts` | `constraintService.checkLimit(userId, limitKey)` | WIRED | Line 143: `constraintService.checkLimit(userId, limitKey)`. |
| `constraintUi.ts` | `useBillingStore.ts` | `getArchiveAccess`/`getResourcePoolAccess`/`getExportAccessLevel` selectors | WIRED | constraintUi.ts imports from useBillingStore (line 9-19). `buildFeatureGateDescription` calls `getExportTierFromPlan`. |
| `LimitReachedModal.tsx` | `constraintUi.ts` | `buildConstraintModalContent` | WIRED | Line 6: imports `buildConstraintModalContent`. Line 63: calls it to render modal content. |
| `ProjectSwitcher.tsx` | `App.tsx` | `onArchive`/`onOpenResourcePool` callbacks | WIRED | ProjectMenu passes `handleArchiveProject` and `handleOpenResourcePool` to both sidebar and overlay ProjectSwitcher instances. |
| `App.tsx` | `useAuthStore.ts` | `constraintDenial` shared state | WIRED | Line 333: reads `constraintDenial`. Lines 408-416: effect routes it to `openLimitModal`. |
| `ProjectMenu.tsx` | `App.tsx` | `onRequestExportLevel` callback | WIRED | Line 1068: App passes `handleRequestExportLevel` as `onRequestExportLevel`. ProjectMenu forwards to `ExportAccessCard`. |
| `App.tsx` | `constraintUi.ts` | `EXPORT_FEATURE_LOCKED` modal payload | WIRED | Line 45: `isConstraintCode` includes `EXPORT_FEATURE_LOCKED`. Line 392: `handleRequestExportLevel` builds denial with `EXPORT_FEATURE_LOCKED`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `constraint-middleware.ts` | `result` from `checkLimit` | `ConstraintService.checkLimit(userId, 'archive')` | Yes -- reads from PLAN_CATALOG via ConstraintService | FLOWING |
| `App.tsx` | `proactiveArchiveDenial` | `buildProactiveConstraintDenial('archive', billingStatus)` | Yes -- reads `billingStatus.limits.archive` from billing store | FLOWING |
| `App.tsx` | `handleOpenResourcePool` denial | `buildProactiveConstraintDenial('resource_pool', billingStatus)` | Yes -- reads `billingStatus.limits.resource_pool` | FLOWING |
| `ProjectMenu.tsx` | `ExportAccessCard currentLevel` | `getExportAccessLevel(subscription)` | Yes -- reads `subscription.limits.export` | FLOWING |
| `useAuthStore.ts` | `constraintDenial` | Parsed from 403 response body in `archiveProject()` | Yes -- parses structured JSON from server 403 | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED -- no runnable entry points that can be tested without a running server. All verification done via static code analysis and test file inspection.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GATE-01 | 34-01, 34-02, 34-03 | Feature gate for archive -- available on Start+, free sees upsell | SATISFIED | Server enforcement via `requireFeatureGate('archive')`. Frontend proactive denial + backend 403 parsing. Modal with `ARCHIVE_FEATURE_LOCKED`. |
| GATE-02 | 34-02, 34-03 | Feature gate for resource pool -- available on Start+, free sees upsell | SATISFIED | Frontend proactive denial via `buildProactiveConstraintDenial('resource_pool')`. ProjectSwitcher "Пул ресурсов" button with upsell modal. |
| GATE-03 | 34-02, 34-04 | Feature gate for export -- PDF on Start, PDF+Excel on Team, PDF+Excel+API on Enterprise | SATISFIED | `ExportAccessCard` in ProjectMenu billing footer. `handleRequestExportLevel` gates by ordered comparison. PLAN_CATALOG defines tier mapping. |

No orphaned requirements found. REQUIREMENTS.md maps GATE-01, GATE-02, GATE-03 to Phase 34, all three are covered by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | -- | -- | -- | -- |

No anti-patterns detected. No TODOs, FIXMEs, placeholders, stub implementations, or hardcoded empty data in any modified file.

### Human Verification Required

### 1. Archive upsell modal visual appearance

**Test:** Log in as a free-tier user, open project switcher, click "В архив" on any active project.
**Expected:** A modal appears with title "Архив проектов недоступен", description mentioning the plan restriction, and a "Перейти на тарифы" button.
**Why human:** Visual layout, text readability, and modal interaction are UI concerns.

### 2. Export access card visual rendering

**Test:** Log in as different plan tiers and observe the billing footer in the sidebar.
**Expected:** Free shows all three badges (PDF/Excel/API) as locked. Start shows PDF available (green) and Excel/API locked. Team shows PDF+Excel available and API locked. Enterprise shows all three available.
**Why human:** Badge styling, color contrast, and hover states require visual inspection.

### 3. Resource pool button interaction

**Test:** Log in as a free-tier user, click "Пул ресурсов" in the project switcher.
**Expected:** Upsell modal opens with "Пул ресурсов недоступен" title and upgrade guidance.
**Why human:** Modal content and button behavior verification.

### Gaps Summary

No gaps found. All three feature gates (archive, resource pool, export tiers) are implemented end-to-end:

- **Server side:** Archive route is guarded by `requireFeatureGate('archive')` middleware with structured 403 denial payload.
- **Frontend contracts:** Billing selectors (`getArchiveAccess`, `getResourcePoolAccess`, `getExportAccessLevel`), expanded `ConstraintLimitKey`, `FEATURE_GATE_CODES`, and `buildConstraintModalContent` all support the three new limit keys.
- **Shell wiring:** `handleArchiveProject` proactively gates free users, `handleOpenResourcePool` routes to upsell modal, `ExportAccessCard` shows plan-aware tier badges.
- **Data flow:** All data sources trace back to real billing state (`subscription.limits`) and the PLAN_CATALOG.
- **Test coverage:** Server-side tests for archive middleware and route contracts. Frontend tests for billing selectors (13) and constraint UI normalization (10).

---

_Verified: 2026-04-04T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
