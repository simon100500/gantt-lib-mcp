---
phase: quick-013
plan: 13
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ChatSidebar.tsx
  - packages/web/src/App.tsx
autonomous: true
requirements: [QUICK-013]
must_haves:
  truths:
    - "Unauthenticated user can type freely in the AI input without any warning or block"
    - "Submitting a message while unauthenticated opens the OTP login modal"
    - "After login, the typed text remains in the input field"
    - "The input is a textarea that grows with content up to 5 rows, then scrolls"
    - "Pressing Enter submits, Shift+Enter inserts a newline"
  artifacts:
    - path: packages/web/src/components/ChatSidebar.tsx
      provides: "Textarea input, no auth warning, onLoginRequired callback"
    - path: packages/web/src/App.tsx
      provides: "Passes onLoginRequired to ChatSidebar, triggers OTP modal"
  key_links:
    - from: ChatSidebar handleSubmit
      to: App.tsx onLoginRequired
      via: "prop callback when !isAuthenticated"
      pattern: "onLoginRequired"
---

<objective>
Remove the AI assistant auth block for unauthenticated users. Allow typing freely; show OTP modal only on send. Replace the single-line input with an auto-growing textarea (max 5 rows). Preserve typed text after login since ChatSidebar stays mounted under the modal overlay.

Purpose: Better UX — guest users can compose messages and log in on demand without losing their input.
Output: Updated ChatSidebar with textarea + auth-on-send pattern; App passes onLoginRequired callback.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/components/ChatSidebar.tsx
@packages/web/src/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor ChatSidebar — textarea + auth-on-send</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
    1. Add `onLoginRequired?: () => void` to ChatSidebarProps interface.

    2. Remove the auth warning block entirely (the amber `bg-amber-50` div that says "Для работы AI-ассистента требуется вход").

    3. Replace the `<input>` element with a `<textarea>`. Requirements:
       - ref: change `inputRef` type from `useRef<HTMLInputElement>` to `useRef<HTMLTextAreaElement>`
       - `rows={1}` as base
       - Auto-grow via `onInput` handler: set `e.currentTarget.style.height = 'auto'` then `e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'`
       - CSS: `max-height` equivalent to 5 rows — use `style={{ maxHeight: '7.5rem' }}` (5 * 1.5rem line-height)
       - `overflow-y: auto` when content exceeds max height — add `className` with `overflow-y-auto resize-none`
       - `placeholder`, `value`, `onChange`, `autoComplete`, `spellCheck` same as before
       - `onKeyDown`: if `e.key === 'Enter' && !e.shiftKey` → `e.preventDefault(); handleSubmit(e as any)`
       - Remove `disabled` attribute entirely — textarea is always editable (unauthenticated users can type freely)
       - Keep `disabled` on the textarea only when `aiThinking` (`disabled` prop from parent)

    4. Update `handleSubmit`:
       - If `!isAuthenticated`: call `onLoginRequired?.()` and return (do NOT clear input, so text persists)
       - Otherwise keep existing logic: `onSend(text); setInputValue('')`; also reset textarea height: `if (inputRef.current) inputRef.current.style.height = 'auto'`

    5. Quick chips: keep disabled logic as-is (`disabled={disabled || !connected}`) — chips are optional shortcuts.

    6. Send button: keep disabled when `!inputValue.trim()` but remove `!connected` from disabled condition for unauthenticated users — button should be pressable to trigger login. Actually simpler: keep `disabled={disabled || !inputValue.trim()}` (remove the `!connected` check from button so unauthenticated can press it; connected=false for guests since no WS auth).

    7. Update placeholder: when `!isAuthenticated` use `'Сообщение AI…'` (no "AI думает" for unauthenticated, only when `disabled` is true).
       Placeholder logic: `disabled ? 'AI думает…' : 'Сообщение AI…'`

    8. Form layout: change `items-center` to `items-end` on the form wrapper so the send button aligns to the bottom of the growing textarea.
  </action>
  <verify>
    TypeScript compiles: `cd D:/Projects/gantt-lib-mcp && npm run -w packages/web tsc --noEmit 2>&1 | tail -20`
  </verify>
  <done>
    - Auth warning banner is gone from ChatSidebar
    - Textarea renders, grows up to 5 rows, scrolls beyond that
    - Enter submits, Shift+Enter adds newline
    - Unauthenticated submit calls onLoginRequired without clearing input
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire onLoginRequired in App.tsx</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    In App.tsx, update the ChatSidebar usage (inside the `<aside>`) to pass:

    ```tsx
    onLoginRequired={() => setShowOtpModal(true)}
    ```

    No other changes needed — `isAuthenticated` is already passed, OTP modal is already controlled by `showOtpModal` state, and ChatSidebar stays mounted under the modal so `inputValue` persists naturally.
  </action>
  <verify>
    Build passes: `cd D:/Projects/gantt-lib-mcp && npm run -w packages/web build 2>&1 | tail -20`
  </verify>
  <done>
    - Unauthenticated user types a message, presses send → OTP modal opens
    - After logging in, OTP modal closes, the typed text is still in the textarea
    - Authenticated users send messages normally
  </done>
</task>

</tasks>

<verification>
1. `npm run -w packages/web build` exits 0 with no TypeScript errors
2. Manual check: open app as guest, type in AI input (should be freely editable), press Enter → OTP modal appears, text remains after closing modal
3. Multi-line text grows textarea up to 5 rows then scrolls
</verification>

<success_criteria>
- No auth warning in AI sidebar for unauthenticated users
- Textarea grows with content (1–5 rows), scrolls beyond 5
- Enter sends, Shift+Enter adds newline
- Unauthenticated send → OTP modal (input text preserved)
- Authenticated send → works as before
- TypeScript build passes
</success_criteria>

<output>
After completion, create `.planning/quick/13-ai-one-line-input-textarea-5/13-SUMMARY.md`
</output>
