---
phase: quick-015
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ChatSidebar.tsx
  - packages/web/src/App.tsx
autonomous: true
requirements: [QUICK-015]
must_haves:
  truths:
    - "Quick-access chips are always enabled regardless of WS connection state"
    - "Guest user sees green/connected WS indicator in status bar"
    - "Authenticated user sees real WS connection state in status bar"
  artifacts:
    - path: "packages/web/src/components/ChatSidebar.tsx"
      provides: "Chips without disabled prop tied to connected"
    - path: "packages/web/src/App.tsx"
      provides: "Status bar indicator uses isGuest check"
  key_links:
    - from: "ChatSidebar.tsx chip button"
      to: "disabled prop"
      via: "remove !connected condition"
    - from: "App.tsx status bar"
      to: "connected variable"
      via: "displayConnected = isAuthenticated ? connected : true"
---

<objective>
Two small UI fixes related to WS connection state:
1. Quick-access chips (подсказки) are pure text shortcuts — they should never be gated on WS. Remove `disabled={!connected}` from chip buttons entirely.
2. WS status indicator in the footer: guests have no WS connection so they always see amber/disconnected. Fix by using `true` for guests, real `connected` for authenticated users.

Purpose: Consistent, non-misleading UX — chips always work, guests don't see a scary "reconnecting" state.
Output: Two patched files, no new deps.
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
  <name>Task 1: Remove !connected from chip disabled prop</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
    In ChatSidebar.tsx, find the chip button inside the `{/* ── Quick chips ──────────────────────────── */}` block (around line 154).

    Remove the `disabled={!connected}` prop from the chip `<button>` element entirely.

    The button currently looks like:
    ```tsx
    <button
      key={chip}
      type="button"
      onClick={() => handleChip(chip)}
      disabled={!connected}
      className={cn(
        'text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500',
        'transition-colors hover:border-primary hover:text-primary',
        ...
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
    ```

    After the change it should have no `disabled` prop at all. The `disabled:opacity-40 disabled:cursor-not-allowed` className tokens can also be removed since they are no longer relevant (chips are never disabled), but keep the rest of the className intact.

    Also check if `connected` prop is used anywhere else in ChatSidebar.tsx. It is used in the WS indicator dot (around line 73-75) — leave that unchanged.
  </action>
  <verify>
    grep -n "disabled={!connected}" packages/web/src/components/ChatSidebar.tsx
    # Should return no matches
  </verify>
  <done>Chip buttons have no disabled prop tied to WS connected state. They are always clickable.</done>
</task>

<task type="auto">
  <name>Task 2: Guest WS indicator always green in App.tsx status bar</name>
  <files>packages/web/src/App.tsx</files>
  <action>
    In App.tsx, the footer status bar (around lines 437-445) uses `connected` directly:

    ```tsx
    connected ? 'text-emerald-600' : 'text-amber-600'
    connected ? 'bg-emerald-500' : 'bg-amber-400'
    connected ? 'Подключено' : 'Переподключение…'
    ```

    Before this JSX block (or inline), derive a display variable:
    ```tsx
    const displayConnected = auth.isAuthenticated ? connected : true;
    ```

    Then replace all three `connected ?` references in the footer `<span>` with `displayConnected`. Do NOT change the `connected` prop passed to `<ChatSidebar>` — ChatSidebar already has its own indicator using the `connected` prop (which is fine; the same fix should apply there via the `connected` prop value). Actually, to keep it consistent, pass `displayConnected` to ChatSidebar as well:

    ```tsx
    connected={displayConnected}
    ```

    This way both the footer indicator and the ChatSidebar WS dot show green for guests.

    Place the `const displayConnected = ...` derivation right after the `const { send, connected } = useWebSocket(...)` line (line 115) so it is close to its source.
  </action>
  <verify>
    grep -n "displayConnected" packages/web/src/App.tsx
    # Should show: const displayConnected declaration + usage in footer + usage in ChatSidebar connected prop
  </verify>
  <done>
    Guests see green "Подключено" in the status bar and ChatSidebar dot. Authenticated users still see real WS state.
  </done>
</task>

</tasks>

<verification>
npm --prefix packages/web run build 2>&1 | tail -5
# Should complete without TypeScript errors
</verification>

<success_criteria>
- `disabled={!connected}` is gone from chip buttons in ChatSidebar.tsx
- `displayConnected` is used in App.tsx footer and passed to ChatSidebar
- TypeScript build passes clean
</success_criteria>

<output>
After completion, create `.planning/quick/15-ws-connected-ws/15-SUMMARY.md`
</output>
