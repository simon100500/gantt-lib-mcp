---
phase: quick-017
plan: 17
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/App.tsx
autonomous: true
requirements: [QUICK-17]
must_haves:
  truths:
    - "Footer is NOT shown when chart is empty (tasks.length === 0)"
    - "Footer IS shown when chart has tasks (tasks.length > 0)"
    - "When chart is empty, layout is [EMPTY_STATE][CHAT] - chat extends to bottom of screen"
    - "When chart exists, layout is [CHART][CHAT] / [FOOTER][CHAT] - footer spans from left edge to left chat edge"
  artifacts:
    - path: packages/web/src/App.tsx
      provides: "Conditional footer rendering based on tasks.length"
      min_lines: 3
  key_links:
    - from: "tasks.length check"
      to: "footer rendering"
      via: "conditional JSX {tasks.length > 0 && <footer>}"
      pattern: "tasks\\.length.*>.*0.*footer"
---

<objective>
Conditionally show footer only when chart exists.

Purpose: The current layout always shows the footer (task count + connection status). When the chart is empty (initial state or all tasks deleted), the footer should be hidden so the chat sidebar can extend to the bottom of the screen. When the chart has tasks, the footer should appear below the chart, spanning from the left screen edge to the left edge of the chat sidebar.

Current behavior: Footer always visible at bottom of screen regardless of whether chart exists.

Desired behavior:
- Empty state (no tasks): [EMPTY_STATE_MESSAGE][CHAT] - no footer, chat extends to bottom
- With tasks: [CHART][CHAT] / [FOOTER][CHAT] - footer visible, flex from left edge to chat edge

Output: Updated App.tsx with conditional footer rendering.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add conditional rendering to footer based on tasks.length</name>
  <files>packages/web/src/App.tsx</files>
  <action>
In App.tsx, locate the footer element (lines 434-447). Currently it renders unconditionally:

```tsx
<footer className="flex items-center gap-4 h-7 px-4 bg-white border-t border-slate-200 shrink-0 select-none">
  ...
</footer>
```

Change it to conditionally render only when tasks exist:

```tsx
{tasks.length > 0 && (
  <footer className="flex items-center gap-4 h-7 px-4 bg-white border-t border-slate-200 shrink-0 select-none">
    <span className="font-mono text-[11px] text-slate-400">
      {tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
    </span>
    <span
      className={cn(
        'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
        displayConnected ? 'text-emerald-600' : 'text-amber-600',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', displayConnected ? 'bg-emerald-500' : 'bg-amber-400')} />
      {displayConnected ? 'Подключено' : 'Переподключение…'}
    </span>
  </footer>
)}
```

This ensures:
1. Footer only appears when tasks.length > 0
2. Layout becomes [EMPTY_STATE][CHAT] when no tasks (chat extends to bottom)
3. Layout becomes [CHART][CHAT] / [FOOTER][CHAT] when tasks exist
4. Footer naturally flexes from left screen edge to left chat edge due to parent flex layout
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp && npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 | tail -5</automated>
  </verify>
  <done>
    - Footer is hidden when tasks.length === 0
    - Footer is visible when tasks.length > 0
    - Chat sidebar extends to bottom of screen when no tasks
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
After the change:
1. Start the app with no tasks (empty state) — footer should NOT be visible
2. Create a task via AI chat — footer should appear below the chart
3. Delete all tasks — footer should disappear again
4. Verify chat sidebar extends to bottom of screen when footer is hidden
5. Verify footer spans from left edge to chat edge when visible
</verification>

<success_criteria>
- Footer renders conditionally based on tasks.length > 0
- Layout correctly adjusts between [EMPTY_STATE][CHAT] and [CHART][CHAT]/[FOOTER][CHAT]
- TypeScript compiles without errors
- No visual gaps or layout issues when footer toggles visibility
</success_criteria>

<output>
After completion, create `.planning/quick/17-show-footer-conditionally-based-on-chart/17-SUMMARY.md` with what was changed and verification results.
</output>
