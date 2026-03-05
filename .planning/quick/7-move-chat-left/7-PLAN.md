---
phase: quick
plan: 7
type: execute
wave: 1
depends_on: []
files_modified: [packages/web/src/App.tsx]
autonomous: false
requirements: []
must_haves:
  truths:
    - "Chat sidebar appears on the left side of the screen"
    - "Gantt chart appears on the right side of the screen"
    - "Border between chat and chart is on the right side of chat"
    - "Control bar remains above the Gantt chart"
    - "Layout width is still 98vh"
  artifacts:
    - path: "packages/web/src/App.tsx"
      provides: "Main app layout with chat on left"
      contains: "borderLeft" changed to "borderRight" and order swapped
  key_links:
    - from: "App.tsx layout"
      to: "ChatSidebar component"
      via: "JSX element order change"
      pattern: "aside.*ChatSidebar.*main.*GanttChart"
---

<objective>
Move chat sidebar from right to left side of the screen.

Purpose: Chat sidebar should be on the left (leading side) for better UX - typical pattern for AI assistants.
Output: Chat sidebar positioned left of Gantt chart with border on right side of chat.
</objective>

<execution_context>
@D:/Projects/gantt-lib-mcp/.claude/get-shit-done/workflows/execute-plan.md
@D:/Projects/gantt-lib-mcp/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Current layout (App.tsx lines 106-251):
```tsx
return (
  <div style={{ display: 'flex', height: '98vh', fontFamily: 'sans-serif' }}>
    <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {/* Control Bar + GanttChart */}
    </main>
    <aside style={{ width: 360, borderLeft: '1px solid #e0e0e0', ... }}>
      <ChatSidebar ... />
    </aside>
  </div>
);
```

Required change:
1. Swap element order: aside before main
2. Change border from borderLeft to borderRight on the aside
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reorder JSX elements in App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    In the return statement (around line 105), swap the order of the main and aside elements:

    Current order: main first, then aside
    New order: aside first, then main

    Change line 242 from:
      <aside style={{ width: 360, borderLeft: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>
    To:
      <aside style={{ width: 360, borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>

    The aside block (lines 242-250) should be moved before the main block (lines 107-241).

    Do NOT change: main element styling, ChatSidebar props, control bar, GanttChart props.
  </action>
  <verify>
    <automated>grep -n "aside.*ChatSidebar" packages/web/src/App.tsx | head -1</automated>
  </verify>
  <done>ChatSidebar JSX element appears before main element in source, borderRight replaces borderLeft</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Chat sidebar moved to left side of screen with border on right edge</what-built>
  <how-to-verify>
    1. Run: npm run dev:web
    2. Open browser to http://localhost:5173
    3. Verify chat sidebar is on the LEFT side
    4. Verify Gantt chart is on the RIGHT side
    5. Verify border appears between chat and chart (on right side of chat)
  </how-to-verify>
  <resume-signal>Type "approved" or describe layout issues</resume-signal>
</task>

</tasks>

<verification>
- Chat sidebar renders on left side
- Border is on right side of chat (borderRight not borderLeft)
- Gantt chart still fills remaining space
- Control bar still above Gantt chart
</verification>

<success_criteria>
Chat sidebar positioned on left side of screen, Gantt chart on right, border separates them correctly.
</success_criteria>

<output>
After completion, create `.planning/quick/7-move-chat-left/7-SUMMARY.md`
</output>
