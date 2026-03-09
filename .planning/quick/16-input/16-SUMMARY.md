---
phase: quick-016
plan: 16
subsystem: web/ui
tags: [modal, ux, fix, drag-selection]
key-files:
  modified:
    - packages/web/src/components/OtpModal.tsx
    - packages/web/src/components/EditProjectModal.tsx
    - packages/web/src/components/CreateProjectModal.tsx
decisions:
  - "Use onMouseDown with e.target===e.currentTarget guard instead of onClick on backdrop divs — prevents modal close when mouse-up lands outside after dragging from an input"
metrics:
  duration: 3 min
  completed: 2026-03-09
  tasks: 1
  files: 3
---

# Quick Task 16: Fix modal close on text-selection drag — SUMMARY

**One-liner:** Replaced `onClick={onClose}` with `onMouseDown` + `e.target===e.currentTarget` guard on all three modal backdrop divs to prevent accidental dismissal during input text selection.

## What Was Changed

All three modal components had the same bug: the outermost backdrop `<div>` used `onClick={onClose}`. When a user clicked inside a text input and dragged the mouse outside the modal card to select text, the browser fired a `click` event on the backdrop `<div>` upon `mouseup`, closing the modal unexpectedly.

### Fix applied to each file

**Before:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
```

**After:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
```

### Why this works

`mousedown` fires at the press origin. When the user presses inside an input and drags out, `mousedown` originated on the input (`e.target !== e.currentTarget`), so `onClose` is never called. When the user presses directly on the dark backdrop, `e.target === e.currentTarget` is true and the modal closes normally.

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/components/OtpModal.tsx` | Backdrop `onClick` → `onMouseDown` with target guard |
| `packages/web/src/components/EditProjectModal.tsx` | Backdrop `onClick` → `onMouseDown` with target guard |
| `packages/web/src/components/CreateProjectModal.tsx` | Backdrop `onClick` → `onMouseDown` with target guard |

## Commits

| Hash | Message |
|------|---------|
| f596e9e | fix(quick-016): replace onClick with onMouseDown+target guard on modal backdrops |

## Verification

- TypeScript: `npx tsc --noEmit -p packages/web/tsconfig.json` — no errors
- Behavior: text drag-select across modal boundary no longer dismisses modal
- Behavior: direct click on dark backdrop still closes modal

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- packages/web/src/components/OtpModal.tsx — modified (f596e9e)
- packages/web/src/components/EditProjectModal.tsx — modified (f596e9e)
- packages/web/src/components/CreateProjectModal.tsx — modified (f596e9e)
- Commit f596e9e exists in git log
