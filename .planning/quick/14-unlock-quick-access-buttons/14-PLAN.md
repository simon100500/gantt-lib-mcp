---
phase: quick-014
plan: 14
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ChatSidebar.tsx
autonomous: true
requirements: [QUICK-014]
must_haves:
  truths:
    - "Quick-chip buttons are always clickable when WS is connected, regardless of auth state or AI thinking state"
    - "Clicking a chip places the chip text followed by a trailing space into the textarea, with focus moved to the textarea"
  artifacts:
    - path: packages/web/src/components/ChatSidebar.tsx
      provides: Fixed handleChip and chip disabled condition
  key_links:
    - from: chip button onClick
      to: handleChip
      via: "sets inputValue = chip + ' '"
---

<objective>
Remove the auth/AI-thinking block on quick-access chip buttons and append a trailing space when a chip is activated.

Purpose: Chips are example prompts — they should always be available to guests so they can see what the assistant can do. Trailing space positions the cursor after the text so the user can keep typing immediately.
Output: One file modified, two targeted line changes.
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
  <name>Task 1: Unlock chips and add trailing space on activation</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
Two changes in ChatSidebar.tsx:

1. In `handleChip` (line 48-51), change `setInputValue(chip)` to `setInputValue(chip + ' ')`.
   After the update the full function reads:
   ```ts
   function handleChip(chip: string) {
     setInputValue(chip + ' ');
     inputRef.current?.focus();
   }
   ```

2. On the chip `<button>` element (line 158), change:
   ```tsx
   disabled={disabled || !connected}
   ```
   to:
   ```tsx
   disabled={!connected}
   ```
   This removes the `disabled` (AI-thinking) gate so chips remain active while the AI is responding. The connection-lost gate stays — chips make no sense if the WS is down.

No other changes needed. The auth-gate already lives only in `handleSubmit` (which shows the OTP modal for unauthenticated users), so chips correctly funnel guests through login when they hit Send.
  </action>
  <verify>
    Run the dev server and open the app as a guest (not logged in). Confirm chips are enabled. Click a chip — the textarea should contain the chip text with a trailing space and the cursor should be in the textarea.
    For a quick automated sanity check: `cd D:/Projects/gantt-lib-mcp && npx tsc --noEmit -p packages/web/tsconfig.json`
  </verify>
  <done>
    - Chip buttons not grayed out for unauthenticated users
    - Clicking a chip fills the textarea with "&lt;chip text&gt; " (trailing space) and focuses the textarea
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
`npx tsc --noEmit -p packages/web/tsconfig.json` passes with no errors.
</verification>

<success_criteria>
- `disabled` prop on chip buttons is `!connected` only (not `disabled || !connected`)
- `handleChip` sets `inputValue` to `chip + ' '`
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/14-unlock-quick-access-buttons/14-SUMMARY.md`
</output>
