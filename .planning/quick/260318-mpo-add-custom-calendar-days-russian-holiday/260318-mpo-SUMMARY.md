---
phase: quick-add-custom-calendar-days
plan: 01
subsystem: Gantt chart UI
tags: [i18n, holidays, russian-locale, calendar-customization]
dependency_graph:
  requires: []
  provides: [CUSTOM_DAYS_01]
  affects: [packages/web]
tech_stack:
  added: []
  patterns: [custom-calendar-days, utc-date-formatting]
key_files:
  created:
    - packages/web/src/lib/russianHolidays2026.ts
  modified:
    - packages/web/src/components/GanttChart.tsx
    - packages/web/src/App.tsx
decisions: []
metrics:
  duration: 22
  completed_date: "2026-03-18T13:23:52Z"
---

# Phase Quick-Add-Custom-Calendar-Days Plan 01: Russian Holidays 2026 Summary

**One-liner:** Custom calendar days support using gantt-lib's CustomDayConfig interface with UTC-based Russian holidays 2026

## Overview

Added support for custom calendar days to the GanttChart component, enabling proper visualization of Russian official holidays as non-working days. The implementation uses gantt-lib's built-in `CustomDayConfig` interface and forwards the configuration through the wrapper component.

## Changes Made

### 1. Russian Holidays 2026 Data File
**File:** `packages/web/src/lib/russianHolidays2026.ts`

- Created reusable data file with 16 official Russian holidays for 2026
- All dates use `Date.UTC()` format to avoid timezone issues
- Exported as `CustomDayConfig[]` array with `type: 'weekend'`
- Covers: New Year (Jan 1-8), Defender's Day (Feb 23), Women's Day (Mar 8), Labour Day (May 1), Victory Day (May 9), Russia Day (Jun 12), Unity Day (Nov 4)

### 2. GanttChart Wrapper Component
**File:** `packages/web/src/components/GanttChart.tsx`

- Imported `CustomDayConfig` type from gantt-lib
- Added `customDays?: CustomDayConfig[]` to `GanttChartProps` interface
- Added `customDays` to destructured props
- Forwarded `customDays` prop to underlying `GanttLibChart` component

### 3. App Integration
**File:** `packages/web/src/App.tsx`

- Imported `russianHolidays2026` from `./lib/russianHolidays2026.ts`
- Added `customDays={russianHolidays2026}` prop to `GanttChart` component

## Technical Details

### CustomDayConfig Interface
```typescript
interface CustomDayConfig {
  date: Date;
  type: 'weekend' | 'workday';
}
```

### Date Format
All holiday dates use UTC format to prevent timezone-related issues:
```typescript
{ date: new Date(Date.UTC(2026, 0, 1)), type: 'weekend' }
```

## Deviations from Plan

None - plan executed exactly as written.

## Verification

✅ Build completed successfully with no TypeScript errors
✅ All three tasks committed atomically
✅ customDays prop properly forwarded through component hierarchy
✅ Russian holidays data follows correct format

## Success Criteria

- ✅ Russian holidays 2026 are visually distinct from regular workdays (via weekend styling)
- ✅ Custom days feature is reusable (can add other countries' holidays later)
- ✅ GanttChart wrapper properly forwards customDays prop to gantt-lib
- ✅ No TypeScript errors in build

## Testing

To verify the implementation:
1. Start dev server: `npm run dev:web`
2. Open browser and navigate to the application
3. Verify that Russian holiday dates are highlighted with weekend background color:
   - Jan 1-8 (New Year holidays)
   - Feb 23 (Defender of the Fatherland Day)
   - Mar 8 (International Women's Day)
   - May 1 (Spring and Labour Day)
   - May 9 (Victory Day)
   - Jun 12 (Russia Day)
   - Nov 4 (Unity Day)

## Future Enhancements

- Add support for other countries' holidays
- Consider creating a holidays configuration system for multi-locale support
- Add UI for users to select their country/region

## Commits

- `fea9815`: feat(quick-add-custom-calendar-days-01): add Russian holidays 2026 data file
- `3dcfb98`: feat(quick-add-custom-calendar-days-01): add customDays prop to GanttChart wrapper
- `101c7eb`: feat(quick-add-custom-calendar-days-01): integrate Russian holidays in App.tsx
