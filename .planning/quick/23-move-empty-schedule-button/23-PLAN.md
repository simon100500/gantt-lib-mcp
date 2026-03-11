---
phase: quick
plan: 23
type: execute
wave: 1
depends_on: []
files_modified: [packages/web/src/components/StartScreen.tsx]
autonomous: false
requirements: []
must_haves:
  truths:
    - "Пустой график button appears as first chip (leftmost) in chips row"
    - "Button is styled like other chips (border, hover states, not default button style)"
    - "Button functionality remains the same (creates placeholder task)"
  artifacts:
    - path: "packages/web/src/components/StartScreen.tsx"
      provides: "Start screen UI with Пустой график as first chip"
      min_lines: 147
  key_links:
    - from: "Пустой график chip"
      to: "onEmptyChart handler"
      via: "onClick prop"
      pattern: "onClick={onEmptyChart}"
---

<objective>
Move "Пустой график" button from bottom to first chip position

Purpose: User wants the "Пустой график" (Empty schedule) option to appear as the first chip in the chips row instead of a prominent button at the bottom, as it currently looks like an active action button when it's just one of the options.

Output: Updated StartScreen.tsx with Пустой график as first chip
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/components/StartScreen.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move Пустой график to chips array as first item</name>
  <files>packages/web/src/components/StartScreen.tsx</files>
  <action>
    1. Add "Пустой график" as the first item in the CHIPS array at the top of the file
       - Use empty string for prompt (since it directly calls onEmptyChart, not onSend)
       - Label: "Пустой график"

    2. In the chips row rendering (around line 114), add conditional logic:
       - First chip (Пустой график): use onClick={onEmptyChart} instead of onClick={() => handleChipClick(chip.prompt)}
       - Rest of chips: use existing onClick={() => handleChipClick(chip.prompt)}

    3. Remove the "Пустой график button" section (lines 132-142) completely

    The chip styling should remain the same for all chips including Пустой график:
    - text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500
    - hover:border-primary hover:text-primary
  </action>
  <verify>
    <automated>grep -n "Пустой график" packages/web/src/components/StartScreen.tsx</automated>
  </verify>
  <done>
    - CHIPS array has "Пустой график" as first element
    - Chips row renders all 5 chips (Пустой график + 4 existing)
    - First chip calls onEmptyChart on click
    - Bottom button section removed
    - All chips have identical styling
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>StartScreen with Пустой график as first chip</what-built>
  <how-to-verify>
    1. Start the web server: npm run dev:web (from packages/web)
    2. Open browser to http://localhost:5173
    3. Verify "Пустой график" appears as the FIRST chip (leftmost) in the chips row
    4. Verify it looks identical to other chips (border, hover effect)
    5. Click the "Пустой график" chip
    6. Verify it creates a new placeholder task and opens the Gantt chart
    7. Verify no "Пустой график" button at the bottom
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
Visual check that Пустой график is now a chip, not a prominent button
Functional check that clicking it still creates empty chart
</verification>

<success_criteria>
- Пустой график appears as first chip in the row
- Styled identically to other chips (not like an active button)
- Clicking it creates placeholder task as before
- No redundant button at bottom of screen
</success_criteria>

<output>
After completion, create `.planning/quick/23-move-empty-schedule-button/23-SUMMARY.md`
</output>
