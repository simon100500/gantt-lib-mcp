---
phase: quick-260317-1tk
plan: 01
subsystem: UI Layout
tags: [topbar, button-repositioning, ux-improvement]
dependency_graph:
  requires: []
  provides: []
  affects: [App.tsx, topbar layout]
tech_stack:
  added: []
  patterns: [conditional-rendering, layout-flexbox]
key_files:
  created: []
  modified:
    - path: packages/web/src/App.tsx
      changes: "Moved '+ Новый проект' button from left to right section of topbar"
decisions: []
metrics:
  duration: "14s"
  completed_date: "2026-03-16T22:19:38Z"
---

# Phase Quick 260317-1tk Plan 01: Move '+ Новый проект' Button to Right Side of Topbar Summary

**One-liner:** Repositioned the "+ Новый проект" button from the left breadcrumb section to the right authentication section of the topbar for better visual balance.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

## Tasks Completed

| Task | Name | Commit | Files Modified |
| ---- | ---- | ------ | -------------- |
| 1 | Move "+ Новый проект" button to right side of topbar | 7f33664 | packages/web/src/App.tsx |

## Changes Made

### Task 1: Button Repositioning

**What was done:**
- Removed the "+ Новый проект" button from the left section (lines 774-783 in original)
- Added the button to the right section (lines 778-787 in updated)
- Positioned the button before the conditional rendering of share token/auth status
- Preserved all existing props: `variant="ghost"`, `size="sm"`, `onClick={handleCreateProject}`, and className
- Maintained conditional rendering logic: `{!hasShareToken && auth.isAuthenticated && (...)}`

**Layout structure after change:**
```tsx
<div className="flex items-center gap-2"> {/* Left section */}
  {/* Project breadcrumb */}
  {/* Share button */}
</div>

<div className="flex-1" /> {/* Spacer */}

{/* NEW: "+ Новый проект" button here */}
{!hasShareToken && auth.isAuthenticated && (
  <Button>+ Новый проект</Button>
)}

{hasShareToken ? (
  {/* "Только чтение" badge */}
) : !auth.isAuthenticated ? (
  {/* Login prompt */}
) : (
  {/* User dropdown */}
)}
```

## Verification Results

### Automated Verification
- Button location confirmed at line 785: `grep -n "Новый проект" packages/web/src/App.tsx`
- Button no longer appears in left section (after project breadcrumb)
- Button appears in right section before auth controls

### Visual Verification Checklist
- [ ] Button appears on right side of topbar
- [ ] Button is positioned near login/user dropdown (not in left section)
- [ ] Button maintains existing styling and behavior
- [ ] Button only displays for authenticated users without share token

## Technical Notes

**Button behavior preserved:**
- Trigger: Opens create project modal via `handleCreateProject` handler
- Styling: Ghost variant, small size, primary color with hover effect
- Visibility: Only when user is authenticated AND no share token is present

**Conditional rendering flow:**
1. If `hasShareToken` is true: Show "Только чтение" badge (no create button)
2. If `!auth.isAuthenticated`: Show login prompt (no create button)
3. Otherwise: Show user dropdown with "+ Новый проект" button before it

## Self-Check: PASSED

**Files modified:**
- [✓] packages/web/src/App.tsx exists and was modified

**Commits verified:**
- [✓] 7f33664 exists in git log

**Success criteria met:**
- [✓] Button repositioned to right side of topbar
- [✓] All existing functionality preserved (conditional rendering, click handler, styling)
- [✓] No visual regressions or layout issues (same button with same props)
- [✓] Conditional rendering logic intact (only for authenticated, non-shared sessions)
