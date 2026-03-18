---
phase: quick-add-custom-calendar-days
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [packages/web/src/components/GanttChart.tsx, packages/web/src/App.tsx]
autonomous: true
requirements: [CUSTOM_DAYS_01]
user_setup: []

must_haves:
  truths:
    - "Russian holidays 2026 are highlighted as weekends in the Gantt chart"
    - "Custom days prop is passed to gantt-lib GanttChart component"
    - "Holiday dates are defined in a reusable array"
  artifacts:
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "GanttChart wrapper with customDays support"
      exports: ["GanttChartProps", "GanttChartRef"]
    - path: "packages/web/src/lib/russianHolidays2026.ts"
      provides: "Russian holidays 2026 date array"
      contains: "Date objects for holidays"
  key_links:
    - from: "packages/web/src/App.tsx"
      to: "packages/web/src/components/GanttChart.tsx"
      via: "customDays prop"
      pattern: "customDays=\\{russianHolidays2026\\}"
    - from: "packages/web/src/components/GanttChart.tsx"
      to: "gantt-lib GanttChart"
      via: "customDays prop forwarding"
      pattern: "customDays=\\{customDays\\}"
---

<objective>
Add custom calendar days support to GanttChart component for Russian holidays 2026

Purpose: Enable proper holiday visualization for Russian users in the Gantt chart
Output: GanttChart component with customDays prop, Russian holidays 2026 data, integrated in App.tsx
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/components/GanttChart.tsx
@packages/web/src/App.tsx
@node_modules/gantt-lib/dist/index.d.ts

# Current gantt-lib version: 0.20.0
# CustomDayConfig interface from gantt-lib:
interface CustomDayConfig {
  date: Date;
  type: 'weekend' | 'workday';
}

# GanttChartProps already supports customDays prop (line 455 in index.d.ts)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Russian holidays 2026 data file</name>
  <files>packages/web/src/lib/russianHolidays2026.ts</files>
  <action>
Create a new file `packages/web/src/lib/russianHolidays2026.ts` with Russian holidays for 2026.

Russian holidays 2026 (official non-working days):
- New Year holidays: Jan 1-8 (8 days)
- Defender of the Fatherland Day: Feb 23
- International Women's Day: Mar 8
- Spring and Labour Day: May 1
- Victory Day: May 9
- Russia Day: Jun 12
- Unity Day: Nov 4

Export as CustomDayConfig[] array with type: 'weekend' for each holiday.
Use UTC dates to avoid timezone issues (new Date(Date.UTC(year, month-1, day))).

Example format:
```typescript
import type { CustomDayConfig } from 'gantt-lib';

export const russianHolidays2026: CustomDayConfig[] = [
  { date: new Date(Date.UTC(2026, 0, 1)), type: 'weekend' }, // Jan 1
  { date: new Date(Date.UTC(2026, 0, 2)), type: 'weekend' }, // Jan 2
  // ... etc
];
```
  </action>
  <verify>File exists with 16 holiday dates, all using Date.UTC format</verify>
  <done>Russian holidays 2026 exported as CustomDayConfig[] array</done>
</task>

<task type="auto">
  <name>Task 2: Add customDays prop to GanttChart wrapper component</name>
  <files>packages/web/src/components/GanttChart.tsx</files>
  <action>
Update the GanttChart wrapper component to support customDays prop:

1. Import CustomDayConfig type from gantt-lib:
   ```typescript
   import type { Task, ValidationResult } from '../types.ts';
   import type { CustomDayConfig } from 'gantt-lib';
   ```

2. Add customDays to GanttChartProps interface (after viewMode on line 21):
   ```typescript
   viewMode?: 'day' | 'week' | 'month';
   customDays?: CustomDayConfig[];
   ```

3. Add customDays to destructured props (around line 59):
   ```typescript
   viewMode,
   customDays,
   }, ref) => {
   ```

4. Pass customDays to GanttLibChart component (before closing tag, line 99):
   ```typescript
   onDemoteTask={onDemoteTask}
   customDays={customDays}
   />
   ```

DO NOT add any console.log statements or debugging code.
  </action>
  <verify>grep -n "customDays" packages/web/src/components/GanttChart.tsx shows 3 occurrences (interface, destructuring, prop pass)</verify>
  <done>GanttChart wrapper forwards customDays prop to gantt-lib</done>
</task>

<task type="auto">
  <name>Task 3: Integrate Russian holidays in App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Import Russian holidays and pass to GanttChart component:

1. Add import at top of file (with other GanttChart imports):
   ```typescript
   import { GanttChart, type GanttChartRef } from './components/GanttChart.tsx';
   import { russianHolidays2026 } from './lib/russianHolidays2026.ts';
   ```

2. Find the GanttChart component usage in App.tsx (search for "&lt;GanttChart").
3. Add customDays prop to the component:
   ```typescript
   <GanttChart
     ref={ganttChartRef}
     tasks={tasks}
     onTasksChange={handleTasksChange}
     // ... existing props ...
     customDays={russianHolidays2026}
   />
   ```

DO NOT modify any other props or add console.log statements.
  </action>
  <verify>grep -n "customDays={russianHolidays2026}" packages/web/src/App.tsx returns 1 match</verify>
  <done>Russian holidays 2026 are passed to GanttChart component</done>
</task>

</tasks>

<verification>
1. Build the web package: `npm run build -w packages/web` completes without errors
2. Start dev server: `npm run dev:web` starts successfully
3. Open browser and verify holiday dates are highlighted with weekend styling
4. Check Jan 1-8, Feb 23, Mar 8, May 1, May 9, Jun 12, Nov 4 show weekend background color
</verification>

<success_criteria>
- Russian holidays 2026 are visually distinct from regular workdays
- Custom days feature is reusable (can add other countries' holidays later)
- GanttChart wrapper properly forwards customDays prop to gantt-lib
- No TypeScript errors in build
</success_criteria>

<output>
After completion, create summary at:
.planning/quick/260318-mpo-add-custom-calendar-days-russian-holiday/260318-mpo-SUMMARY.md
</output>
