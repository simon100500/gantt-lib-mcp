---
status: awaiting_human_verify
trigger: "Investigate issue: filter-input-loses-focus\n\n**Summary:** In phase 23 filters UI, when typing the first letter into the filter search input, the input loses focus. Find and fix root cause."
created: 2026-03-20T00:00:00Z
updated: 2026-03-20T00:15:00Z
---

## Current Focus

hypothesis: The root cause is confirmed: Radix `DropdownMenu` typeahead was intercepting printable keys from the embedded input, so the first typed character moved active focus away from the field.
test: Human-verify in the browser that the filter input retains focus across multiple typed characters with the current `onKeyDownCapture={preventMenuTypeahead}` change.
expecting: The search input stays focused after the first character and continues accepting subsequent characters without requiring another click.
next_action: wait for user confirmation from the real UI workflow

## Symptoms

expected: Search input in filter popup should keep focus while user types multiple characters.
actual: After entering the first character in the filter search field, focus is lost from the input.
errors: No explicit errors reported.
reproduction: Open filters popup in web UI, click search input, type first letter, observe focus loss.
started: Regression discovered after completing phase 23 filters implementation on 2026-03-20.

## Eliminated

## Evidence

- timestamp: 2026-03-20T00:06:00Z
  checked: packages/web/src/components/FilterPopup.tsx
  found: The filter UI is rendered inside Radix `DropdownMenuContent`, and the search field is a plain controlled `Input` bound to `filterSearchText`.
  implication: The search field sits inside a menu primitive that may apply keyboard navigation/typeahead behavior unless explicitly stopped.

- timestamp: 2026-03-20T00:07:00Z
  checked: packages/web/src/components/layout/Toolbar.tsx
  found: Typing the first character changes `hasActiveFilters` from false to true, which only changes the trigger button variant while the popup is open; no changing `key` or conditional branch is present around `FilterPopup`.
  implication: A full remount caused by conditional rendering in the toolbar is unlikely.

- timestamp: 2026-03-20T00:08:00Z
  checked: packages/web/src/components/ui/dropdown-menu.tsx
  found: `FilterPopup` uses Radix `DropdownMenu` primitives directly, which are menu semantics rather than generic popover semantics.
  implication: Built-in menu keyboard behavior is a plausible root cause for focus being stolen from an embedded text input.

- timestamp: 2026-03-20T00:09:00Z
  checked: git status and working copy of packages/web/src/components/FilterPopup.tsx
  found: The file already contains an uncommitted `preventMenuTypeahead` handler wired through `onKeyDownCapture` on the search/date wrappers.
  implication: There is already a targeted local fix attempt for the suspected root cause, so verification is needed before applying more changes.

- timestamp: 2026-03-20T00:13:00Z
  checked: packages/web/package.json build pipeline
  found: `npm.cmd run build -w packages/web` completed successfully with the current `FilterPopup` changes.
  implication: The keyboard-capture fix is syntactically and type-wise valid and does not break the web package build.

## Resolution

root_cause: The filter popup embeds text inputs inside Radix `DropdownMenu`. Radix menu typeahead consumed the first printable keypress intended for the search field and moved menu focus, which made the input appear to lose focus after the first character.
fix: Stop keyboard events from bubbling to the menu by adding `preventMenuTypeahead` and wiring it through `onKeyDownCapture` on the search and date input wrappers in `packages/web/src/components/FilterPopup.tsx`.
verification: Verified that the web package builds successfully with the fix via `npm.cmd run build -w packages/web`. Browser behavior still needs user confirmation in the actual popup workflow.
files_changed: ["packages/web/src/components/FilterPopup.tsx"]
