---
phase: quick-020
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
autonomous: true
requirements:
  - QUICK-020-switches
  - QUICK-020-position
  - QUICK-020-autoschedule-fix

must_haves:
  truths:
    - "Авто-планирование и Просроченные отображаются как переключатели (switch) с треком и ползунком, а не как кнопки"
    - "Оба свитча расположены в правой части тулбара (после flex-1 разделителя)"
    - "Режим Авто-планирования работает: перетаскивание задачи-предшественника сдвигает зависимые задачи"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Switch UI для авто-планирования и просроченных, позиционирование справа, корректный onCascade"
  key_links:
    - from: "ToolbarSwitch (новый компонент в App.tsx)"
      to: "enableAutoSchedule state"
      via: "onClick toggle"
    - from: "GanttChart enableAutoSchedule prop"
      to: "onCascade callback"
      via: "handleCascade merges shifted tasks into full list"
---

<objective>
Convert the "Авто-планирование" and "Просроченные" toolbar controls from toggle-buttons to proper switch (track + thumb) UI components. Reposition both switches to the right side of the toolbar. Fix auto-schedule mode so it actually cascades dependent tasks on drag.

Purpose: Switches are the correct UI primitive for on/off settings. Right-side positioning groups settings away from action buttons. Auto-schedule currently appears wired but may not cascade because the `onCascade` handler only receives shifted tasks — the merge logic is correct but needs verification.
Output: Updated App.tsx with SwitchControl inline component, switches on right side of toolbar, confirmed auto-schedule cascade wiring.
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@D:/Projects/gantt-lib-mcp/packages/web/src/App.tsx

<interfaces>
<!-- gantt-lib API for auto-scheduling (from REFERENCE.md) -->

enableAutoSchedule?: boolean  // default: false — activates cascade constraint satisfaction on drag
onCascade?: (tasks: Task[]) => void  // fires INSTEAD of onChange during cascade drags; receives only shifted tasks

Correct hard-cascade pattern:
  enableAutoSchedule={true}
  onChange={setTasks}           // for non-cascade drags
  onCascade={(shifted) => {
    setTasks(prev => {
      const map = new Map(shifted.map(t => [t.id, t]));
      return prev.map(t => map.get(t.id) ?? t);
    });
  }}

highlightExpiredTasks?: boolean  // default: false — visually marks overdue tasks in --gantt-expired-color
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace ToolbarToggle with SwitchControl and reposition to right side</name>
  <files>packages/web/src/App.tsx</files>
  <action>
In App.tsx, do the following:

1. REMOVE the `ToolbarToggle` component and its props interface (lines ~22-56). Replace it with a new `SwitchControl` inline component:

```tsx
interface SwitchControlProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: React.ReactNode;
}

function SwitchControl({ checked, onChange, label, icon }: SwitchControlProps) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none group">
      {/* Track + thumb */}
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          checked
            ? 'bg-primary border-primary'
            : 'bg-slate-200 border-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </span>
      {/* Label with icon */}
      <span className={cn(
        'flex items-center gap-1 text-xs font-medium transition-colors',
        checked ? 'text-slate-800' : 'text-slate-500',
      )}>
        {icon}
        {label}
      </span>
    </label>
  );
}
```

2. In the toolbar JSX (the `<div className="flex items-center gap-1.5 h-11 ...">` section):

REMOVE the two `<ToolbarToggle>` blocks for "Авто-планирование" and "Просроченные" AND the `<ToolbarSep />` that separates them from action buttons.

The toolbar currently has this structure (left to right):
- ShowTaskList button | ToolbarSep | ToolbarToggle(AutoSchedule) | ToolbarToggle(Expired) | ToolbarSep | Button(Сегодня) | flex-1 | AI assistant button | validation badge

NEW structure should be:
- ShowTaskList button | ToolbarSep | Button(Сегодня) | flex-1 | SwitchControl(Авто-планирование) | ToolbarSep | SwitchControl(Просроченные) | [optional sep] | AI assistant button | validation badge

So: move the two feature switches AFTER the `<div className="flex-1" />` spacer, placing them on the right side. Keep "Сегодня" button on the left. Use `<ToolbarSep />` between the two switches if needed for visual grouping.

Replace the two old ToolbarToggle blocks with SwitchControl:
```tsx
<SwitchControl
  checked={enableAutoSchedule}
  onChange={setEnableAutoSchedule}
  label="Авто-план"
  icon={<Clock className="w-3 h-3" />}
/>
<ToolbarSep />
<SwitchControl
  checked={highlightExpiredTasks}
  onChange={setHighlightExpiredTasks}
  label="Просроченные"
  icon={<AlertTriangle className="w-3 h-3" />}
/>
```

Place these inside a `<div className="flex items-center gap-2">` on the right side, before the AI assistant button (which shows only when chat is hidden).

3. Verify auto-schedule wiring — the existing `handleCascade` and `onCascade={handleCascade}` props on GanttChart are correct. No changes needed to the cascade logic. However, also confirm `enableAutoSchedule={enableAutoSchedule}` is still passed correctly to GanttChart (it is, but double-check after refactor).

Do NOT remove the `ToolbarSep` component — it is still used. Do NOT change any other toolbar buttons or logic.
  </action>
  <verify>
    <automated>cd /d/Projects/gantt-lib-mcp && npm run build --workspace=packages/web 2>&1 | tail -20</automated>
  </verify>
  <done>
- Build passes with no TypeScript errors
- Toolbar shows two compact switches (track+thumb) on the RIGHT side of the toolbar
- "Авто-план" and "Просроченные" labels visible with icons
- "Сегодня" button remains on the LEFT side
- Toggling each switch changes its visual state (primary color track when on, gray when off)
- enableAutoSchedule state is passed correctly to GanttChart
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Switches UI repositioned to right side of toolbar. Auto-schedule toggle wired to enableAutoSchedule prop on GanttChart with onCascade handler.</what-built>
  <how-to-verify>
1. Open the app in the browser (dev server at http://localhost:5173 or wherever it runs)
2. Check the toolbar: "Авто-план" and "Просроченные" switches should appear on the RIGHT side of the toolbar (near the AI assistant button area), while "Сегодня" button is on the left
3. Toggle "Авто-план" switch ON — track should turn blue/primary color
4. With auto-plan ON: create at least 2 tasks with a dependency (task B depends on task A). Drag task A to a later date — task B should automatically shift to maintain the dependency gap. If B does NOT shift, auto-schedule is broken.
5. Toggle "Просроченные" OFF — expired task highlighting should disappear. Toggle ON — red highlighting returns for past-due tasks.
  </how-to-verify>
  <resume-signal>Type "approved" if both switches look correct and auto-schedule cascades dependent tasks. Describe any issues if not working.</resume-signal>
</task>

</tasks>

<verification>
- TypeScript build passes: `npm run build --workspace=packages/web`
- Both switches render as track+thumb (not button-style) on the right side of toolbar
- Auto-schedule cascade confirmed working by human test with dependent tasks
</verification>

<success_criteria>
- "Авто-планирование" and "Просроченные" appear as visual switches (track + sliding thumb) in the toolbar
- Both switches are positioned on the RIGHT side of the toolbar (after the flex-1 spacer)
- Enabling "Авто-план" and dragging a predecessor task causes dependent tasks to shift automatically (cascade mode works)
- "Просроченные" toggle correctly enables/disables expired task highlighting
- No TypeScript errors, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/020-auto-plan-overdue-to-switches/020-SUMMARY.md` with what was implemented.
</output>
