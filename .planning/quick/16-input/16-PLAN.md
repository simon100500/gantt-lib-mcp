---
phase: quick-016
plan: 16
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/OtpModal.tsx
  - packages/web/src/components/EditProjectModal.tsx
  - packages/web/src/components/CreateProjectModal.tsx
autonomous: true
requirements: [QUICK-16]
must_haves:
  truths:
    - "Selecting text in a modal input and releasing the mouse outside the modal does NOT close the modal"
    - "Clicking directly on the dark backdrop (outside the card) still closes the modal"
  artifacts:
    - path: packages/web/src/components/OtpModal.tsx
      provides: "Fixed backdrop click handler"
    - path: packages/web/src/components/EditProjectModal.tsx
      provides: "Fixed backdrop click handler"
    - path: packages/web/src/components/CreateProjectModal.tsx
      provides: "Fixed backdrop click handler"
  key_links:
    - from: "backdrop div"
      to: "onClose"
      via: "onMouseDown with target===currentTarget guard"
      pattern: "onMouseDown.*currentTarget"
---

<objective>
Fix modal focus loss when dragging text selection out of the modal.

Purpose: When a user click-drags inside an input to select text and releases the mouse outside the modal boundaries, the browser fires a `click` event on the backdrop element, which currently calls `onClose`. This causes the selection (and the modal) to vanish unexpectedly.

Root cause: All three modals use `onClick={onClose}` on the backdrop `<div>`. A `click` event fires wherever `mouseup` occurs regardless of where `mousedown` started. Replacing it with an `onMouseDown` handler that only fires when the down-press itself originated directly on the backdrop (i.e. `e.target === e.currentTarget`) fixes the issue.

Output: Three updated modal files with the corrected backdrop interaction.
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
  <name>Task 1: Replace onClick with onMouseDown + target guard on all modal backdrops</name>
  <files>
    packages/web/src/components/OtpModal.tsx,
    packages/web/src/components/EditProjectModal.tsx,
    packages/web/src/components/CreateProjectModal.tsx
  </files>
  <action>
In each of the three modal files, find the outermost backdrop `<div>` that currently has:

```tsx
<div className="fixed inset-0 z-50 ..." onClick={onClose}>
```

Replace `onClick={onClose}` with:

```tsx
onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
```

Remove the `onClick` attribute entirely — do not keep both.

Why this fix works: `mousedown` fires at the point where the press originates. When the user presses inside an input and drags out, `mousedown` occurred on the input (not the backdrop), so `e.target !== e.currentTarget` and `onClose` is never called. When the user presses directly on the dark backdrop, `e.target === e.currentTarget` is true and the modal closes as expected.

Apply the same change to all three files: OtpModal.tsx, EditProjectModal.tsx, CreateProjectModal.tsx. In OtpModal.tsx the backdrop div appears once at the top level (line 152).
  </action>
  <verify>
    <automated>cd D:/Projects/gantt-lib-mcp && npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 | tail -5</automated>
  </verify>
  <done>
    - No TypeScript errors in web package
    - Selecting text in any modal input and releasing outside the modal card does not close the modal
    - Clicking on the dark backdrop area outside the card still closes the modal
  </done>
</task>

</tasks>

<verification>
After the fix:
1. Open any modal (OTP login, create project, edit project name)
2. Click inside the text input and drag the mouse cursor outside the modal card while holding the button
3. Release the mouse button — modal must remain open with text selected
4. Click directly on the dark semi-transparent backdrop — modal must close
</verification>

<success_criteria>
- All three modal components use `onMouseDown` with `e.target === e.currentTarget` guard instead of `onClick` on the backdrop div
- TypeScript compiles without errors
- Text selection across the modal boundary no longer dismisses the modal
</success_criteria>

<output>
After completion, create `.planning/quick/16-input/16-SUMMARY.md` with what was changed and which files were modified.
</output>
```
