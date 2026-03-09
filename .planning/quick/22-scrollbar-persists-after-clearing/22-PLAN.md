---
phase: quick
plan: 22
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ChatSidebar.tsx
autonomous: true
requirements:
  - QUICK-022: Fix scrollbar persisting after clearing chat input

must_haves:
  truths:
    - "User can type multiple lines and textarea grows properly"
    - "User can clear all text and scrollbar disappears"
    - "Scroll only appears when content actually overflows"
  artifacts:
    - path: "packages/web/src/components/ChatSidebar.tsx"
      provides: "Chat input with proper scrollbar behavior"
      contains: "handleTextareaInput"
  key_links:
    - from: "handleTextareaInput"
      to: "el.style.overflowY"
      via: "dynamic overflow property based on content"
      pattern: "overflowY.*auto|hidden"
---

<objective>
Fix scrollbar appearing on textarea after clearing input text

Purpose: The textarea currently shows a scrollbar even when empty after typing and clearing text. This is a UI bug that creates visual clutter.
Output: Textarea scrollbar only appears when content actually overflows the visible area
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/components/ChatSidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix textarea scrollbar persistence after clearing</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
In ChatSidebar.tsx, modify the handleTextareaInput function (lines 53-57) to dynamically control the overflow-y property:

1. After setting the height, check if scrollHeight exceeds the maxHeight (7.5rem = 120px)
2. Set overflow-y to 'auto' only when content overflows, 'hidden' otherwise
3. Also update handleSubmit (line 45) to reset overflow-y to 'hidden' when clearing

Change the handleTextareaInput function to:
```typescript
function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  el.style.height = 'auto';
  const newHeight = el.scrollHeight;
  el.style.height = newHeight + 'px';
  // Only show scrollbar when content actually overflows
  el.style.overflowY = newHeight > 120 ? 'auto' : 'hidden';
}
```

And update line 45 in handleSubmit to also reset overflow:
```typescript
if (inputRef.current) {
  inputRef.current.style.height = 'auto';
  inputRef.current.style.overflowY = 'hidden';
}
```

Keep the `overflow-y-auto` class on line 193 as a fallback (the inline style will override it).
  </action>
  <verify>
Open http://localhost:5173, type multiple lines of text in the chat input to make it grow, then clear all text. Verify scrollbar disappears when empty.
  </verify>
  <done>Textarea scrollbar only appears when content overflows visible area; clearing text removes scrollbar</done>
</task>

</tasks>

<verification>
1. Type multiple lines to cause textarea growth
2. Continue typing until scrollbar appears (content overflow)
3. Clear all text
4. Verify scrollbar is gone
</verification>

<success_criteria>
- [ ] Textarea grows with content (existing behavior preserved)
- [ ] Scrollbar appears only when content overflows maxHeight
- [ ] Scrollbar disappears when text is cleared
- [ ] No console errors
</success_criteria>

<output>
After completion, create `.planning/quick/22-scrollbar-persists-after-clearing/22-SUMMARY.md`
</output>
