---
phase: quick-23
plan: 23
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/GanttChart.tsx
  - packages/web/src/App.tsx
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "User sees prompt input field instead of 'No tasks yet' message when chart is empty"
    - "User sees 'Пустой график' button to start with empty chart"
    - "Submitting prompt opens chat sidebar and sends message to AI"
    - "Clicking 'Пустой график' shows empty Gantt chart with task list enabled"
  artifacts:
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "Empty state with prompt input and action button"
      exports: ["GanttChart"]
    - path: "packages/web/src/App.tsx"
      provides: "Chat trigger and empty chart state handling"
  key_links:
    - from: "GanttChart.tsx empty state input"
      to: "App.tsx handleSend"
      via: "onPromptSubmit callback prop"
      pattern: "onPromptSubmit.*handleSend"
---

<objective>
Replace "No tasks yet" message with interactive start screen featuring prompt input field and "Пустой график" button.

Purpose: Improve onboarding for new users by providing immediate action options when chart is empty.
Output: Enhanced empty state with AI prompt entry and quick-start button.
</objective>

<execution_context>
@.planning/STATE.md
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/components/GanttChart.tsx
@packages/web/src/App.tsx
@packages/web/src/components/ChatSidebar.tsx
@packages/web/src/components/ui/button.tsx
@packages/web/src/components/ui/input.tsx

Current empty state in GanttChart.tsx (lines 57-63):
```tsx
if (tasks.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
      <p className="text-sm">No tasks yet.</p>
      <p className="text-xs">Start a conversation to create your Gantt chart.</p>
    </div>
  );
}
```

App.tsx has:
- `handleSend` callback for chat messages
- `setChatSidebarVisible` to show chat panel
- `setShowTaskList` for task list visibility
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add prompt input and button to GanttChart empty state</name>
  <files>packages/web/src/components/GanttChart.tsx</files>
  <action>
Modify GanttChart.tsx:

1. Add new props to GanttChartProps interface:
   - `onPromptSubmit?: (prompt: string) => void;` - callback when user submits prompt
   - `onStartEmpty?: () => void;` - callback when user clicks "Пустой график" button

2. Replace the empty state div (lines 57-63) with an interactive start screen:
   - Centered layout with heading "С чего начнём?"
   - Textarea input (reuse ChatSidebar textarea styling) with placeholder "Опишите ваш проект..."
   - Primary button "Создать по описанию" with ArrowUp icon
   - OR separator button "или"
   - Secondary outline button "Пустой график"

3. Use local state for prompt input value
   - `const [promptValue, setPromptValue] = useState('');`
   - Handle form submit to call `onPromptSubmit(promptValue)`
   - Handle "Пустой график" button click to call `onStartEmpty()`

4. Styling should match existing UI patterns:
   - Use shadcn Input component or reuse textarea styling from ChatSidebar
   - Use shadcn Button component (primary for submit, outline for empty chart)
   - Spacing: gap-3 between elements
   - Max-width: 420px for the form container
   - Center everything with flex-col items-center

5. Import required components:
   - `import { useState } from 'react';`
   - `import { ArrowUp } from 'lucide-react';`
   - `import { Button } from './ui/button.tsx';`

Do NOT modify the GanttLibChart rendering path - only the empty state.
  </action>
  <verify>
    <automated>cd packages/web && npm run build 2>&1 | head -20</automated>
  </verify>
  <done>
    - GanttChart component accepts onPromptSubmit and onStartEmpty props
    - Empty state shows heading, textarea, submit button, separator, and "Пустой график" button
    - Input is textarea with auto-resize (1-5 rows like ChatSidebar)
    - Submit button disabled when input is empty
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire empty state callbacks to App.tsx handlers</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Modify App.tsx to wire the new GanttChart callbacks:

1. Pass `onPromptSubmit` prop to GanttChart (line ~415):
   - Function that:
     a) Calls `handleSend(prompt)` to send message to AI
     b) Calls `setChatSidebarVisible(true)` to show chat panel
     c) Focuses on chat input (optional enhancement)

2. Pass `onStartEmpty` prop to GanttChart:
   - Function that:
     a) Ensures `showTaskList` is true (call `setShowTaskList(true)`)
     b) Optionally scrolls to today or adds a placeholder empty task
     c) Does NOT send any message to AI

3. The implementation should be minimal - just delegate to existing handlers:
   ```tsx
   onPromptSubmit={(prompt) => {
     handleSend(prompt);
     setChatSidebarVisible(true);
   }}
   onStartEmpty={() => {
     setShowTaskList(true);
   }}
   ```

No new state or effects needed - reuse existing App.tsx handlers.
  </action>
  <verify>
    <automated>cd packages/web && npm run build 2>&1 | head -20</automated>
  </verify>
  <done>
    - Submitting prompt sends message to AI and opens chat sidebar
    - Clicking "Пустой график" shows empty Gantt chart with task list
    - No console errors on interaction
    - Chat sidebar opens smoothly when prompt is submitted
  </done>
</task>

</tasks>

<verification>
1. Visit http://localhost:5173 (or dev server)
2. Create new project or use demo mode with empty tasks
3. Verify empty state shows "С чего начнём?" heading
4. Type prompt in textarea and submit - verify chat opens and message is sent
5. Click "Пустой график" - verify empty chart appears with task list
6. Test both authenticated and demo modes
</verification>

<success_criteria>
- Empty state shows interactive prompt input instead of static "No tasks yet" message
- Prompt submission triggers AI chat with the user's message
- "Пустой график" button shows empty Gantt chart without AI interaction
- UI is responsive and matches existing design patterns
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/23-start-screen-no-tasks-yet/23-SUMMARY.md`
</output>
