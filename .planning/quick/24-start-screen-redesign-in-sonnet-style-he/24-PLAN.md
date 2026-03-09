---
phase: quick-24
plan: 24
type: execute
wave: 1
depends_on: []
files_modified: [packages/web/src/components/GanttChart.tsx]
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Start screen shows header at top ('С чего начнём?')"
    - "Large white input field centered below header"
    - "Submit button positioned on the right side of input"
    - "Empty chart button positioned below input field"
    - "Layout matches Sonnet-style design (minimal, clean)"
  artifacts:
    - path: "packages/web/src/components/GanttChart.tsx"
      provides: "Sonnet-style start screen component"
      contains: "start screen form with inline submit button"
  key_links:
    - from: "GanttChart.tsx start screen"
      to: "onPromptSubmit prop"
      via: "form submit handler"
      pattern: "onPromptSubmit\\(trimmed\\)"
---

<objective>
Redesign start screen in Sonnet style: header at top, large white input field with submit button on the right, and "Пустой график" button below.

Purpose: Update the start screen to match Claude Sonnet's clean, minimal design pattern for better visual consistency.

Output: Updated GanttChart.tsx with Sonnet-style start screen layout.
</objective>

<execution_context>
@D:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@D:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@D:/Projects/gantt-lib-mcp/packages/web/src/components/GanttChart.tsx
@D:/Projects/gantt-lib-mcp/packages/web/src/components/ui/button.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign start screen in Sonnet style</name>
  <files>packages/web/src/components/GanttChart.tsx</files>
  <action>
    Modify the empty state render in GanttChart.tsx (lines 94-148):

    **Layout changes:**
    - Keep header "С чего начнём?" at top (h2, text-lg, font-semibold, text-slate-800)
    - Replace stacked form with flex-row layout for input + submit button
    - Input field: large white background, rounded-md, border-slate-200, remove gray background (bg-slate-50 -> bg-white)
    - Submit button: positioned on right side of input (not below), use primary variant, ArrowUp icon
    - "Пустой график" button: below input row, outline variant, full width

    **Implementation details:**
    - Wrap input + submit in a flex-row container (relative positioning for button)
    - Input: flex-1, pr-12 (space for button), min-h-[48px] for larger appearance
    - Submit button: absolute position right-2 top-1/2 -translate-y-1/2, h-8 w-8 p-0 (icon only)
    - "Пустой график" button: mt-4, w-full, outline variant

    Keep existing auto-resize textarea behavior and keyboard shortcuts (Enter to submit, Shift+Enter for newline).
  </action>
  <verify>
    <automated>npm run build:web --silent 2>&1 | grep -E "(error|Error)" || echo "Build successful"</automated>
  </verify>
  <done>
    Start screen renders with:
    - Header at top
    - Large white input field
    - Submit button on right side of input
    - "Пустой график" button below input
    - Clean, minimal Sonnet-style appearance
  </done>
</task>

</tasks>

<verification>
1. Build succeeds without errors
2. Start screen displays correctly in browser
3. Submit button positioned on right side of input
4. "Пустой график" button below input
5. Auto-resize textarea still works
6. Keyboard shortcuts (Enter, Shift+Enter) work
</verification>

<success_criteria>
- Start screen matches Sonnet-style layout
- Input field has white background (not gray)
- Submit button positioned on right side of input
- "Пустой график" button positioned below input row
- All existing functionality preserved
</success_criteria>

<output>
After completion, create `.planning/quick/24-start-screen-redesign-in-sonnet-style-he/24-SUMMARY.md`
</output>
