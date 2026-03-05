---
phase: quick
plan: 7
subsystem: Web UI Layout
tags: [ui, layout, refactor]
completed_date: 2026-03-05
duration: 1
tasks: 1
files: 1
---

# Phase Quick Plan 7: Move Chat Sidebar to Left Summary

Chat sidebar repositioned from right to left side of screen following standard AI assistant UX patterns.

## One-Liner
Swapped JSX element order in App.tsx to render ChatSidebar before main content, changed borderLeft to borderRight for correct visual separation.

## Changes Made

### Files Modified

| File | Changes |
|------|---------|
| `packages/web/src/App.tsx` | Moved `<aside>` element before `<main>` element, changed `borderLeft` to `borderRight` on aside style |

### Technical Details

**Before:**
```tsx
<div style={{ display: 'flex', height: '98vh', fontFamily: 'sans-serif' }}>
  <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
    {/* Control Bar + GanttChart */}
  </main>
  <aside style={{ width: 360, borderLeft: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>
    <ChatSidebar ... />
  </aside>
</div>
```

**After:**
```tsx
<div style={{ display: 'flex', height: '98vh', fontFamily: 'sans-serif' }}>
  <aside style={{ width: 360, borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>
    <ChatSidebar ... />
  </aside>
  <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
    {/* Control Bar + GanttChart */}
  </main>
</div>
```

## Verification Results

- Chat sidebar renders on left side of screen
- Border appears on right side of chat sidebar (borderRight)
- Gantt chart fills remaining space on right side
- Control bar remains above Gantt chart
- Layout height remains 98vh
- No changes to ChatSidebar props, GanttChart props, or control bar functionality

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 9f00ce2 | feat(quick-7): move chat sidebar to left side of screen | packages/web/src/App.tsx |

## Metrics

- Duration: 1 minute
- Tasks completed: 1/1
- Files modified: 1
- Lines changed: 9 insertions, 9 deletions

## Self-Check: PASSED

- [x] Commit 9f00ce2 exists in git log
- [x] File packages/web/src/App.tsx modified correctly
- [x] borderRight replaces borderLeft
- [x] ChatSidebar JSX appears before main element
- [x] Summary file created at correct path
