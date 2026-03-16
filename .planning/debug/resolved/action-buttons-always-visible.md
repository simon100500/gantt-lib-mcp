---
status: resolved
trigger: "Action buttons (кнопки действия) should only appear on hover, but they are always visible instead."
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED - debug CSS override in global.css was forcing action buttons to always be visible
test: removed the override, gantt-lib styles now control visibility correctly
expecting: buttons hidden by default, visible on row hover
next_action: resolved

## Symptoms

expected: Action buttons (delete, edit, etc.) should be hidden by default and only appear when hovering over a row/item
actual: Action buttons are always displayed regardless of hover state
errors: No JS errors reported
reproduction: Open the app and look at any list — buttons are visible all the time without needing to hover
started: Unknown

## Eliminated

## Evidence

- timestamp: 2026-03-15T00:00:30Z
  checked: node_modules/gantt-lib/dist/styles.css lines 1023-1033
  found: .gantt-tl-action-buttons has opacity:0 by default, opacity:1 only on .gantt-tl-row:hover - CSS is correct
  implication: the visibility logic in gantt-lib is working as designed

- timestamp: 2026-03-15T00:00:45Z
  checked: packages/web/src/global.css
  found: debug override block - ".gantt-tl-name-action-btn { opacity: 1 !important; pointer-events: auto !important; }" with comment "DEBUG: Make delete buttons always visible for testing entity deletion issue"
  implication: THIS is the root cause - a !important override was left in after debugging a deletion issue, forcing buttons to always be visible

## Resolution

root_cause: A debug CSS rule left in packages/web/src/global.css was applying `opacity: 1 !important` to `.gantt-tl-name-action-btn`, overriding gantt-lib's normal hover-only visibility logic.
fix: Removed the 4-line debug CSS block (comment + rule) from global.css
verification: Human confirmed - buttons now appear only on hover as expected
files_changed:
  - packages/web/src/global.css
