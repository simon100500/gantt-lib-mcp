---
phase: 45-history-refactor
plan: 05
status: ready_for_human_verification
updated: 2026-04-18
---

# Phase 45 Human UAT

## Preconditions

- Use a project that already has at least three visible history versions.
- Include one older version that can be restored safely.
- Sign in to the web app with a user who can edit that project.

## Flow 1: Open the version list

1. Open the project workspace.
2. Click `История`.
3. Confirm the right-side panel shows a version timeline with multiple rows.

Expected:
- Rows show user-visible version entries rather than undo/redo terminology.
- The current version is marked as current.
- Older rows expose a restore action.

## Flow 2: Preview an older version

1. In the history list, click any non-current row.
2. Confirm the workspace switches into preview mode for that selected version.

Expected:
- The preview is loaded from the server and the visible chart matches the selected historical version.
- The UI offers `Вернуться к текущей версии`.
- The selected preview row is not treated as the current editable state.

## Flow 3: Return to the current version

1. While previewing an older version, click `Вернуться к текущей версии`.
2. Confirm the workspace returns to the live current snapshot.

Expected:
- The current version view is restored without reloading the page.
- The project remains editable after returning to current mode.

## Flow 4: Restore an older version

1. Select an older history row.
2. Trigger `Восстановить эту версию`.
3. Wait for the restore request to complete.

Expected:
- The workspace refreshes to the restored authoritative snapshot.
- The visible current version now matches the restored version.
- The history list refreshes and marks the new latest row as current.

## Flow 5: Confirm editing is blocked during preview

1. Click `Показать эту версию` by selecting an older history row.
2. While preview mode is active, try to:
   - drag a task on the chart
   - edit a task field
   - send a chat mutation
3. Return to current mode and repeat one edit attempt.

Expected:
- Preview mode blocks editing and mutation actions.
- Returning to current mode re-enables normal editing behavior.

## Result Capture

Record:
- project used
- which row was previewed
- which row was restored
- whether editing stayed blocked during preview
- any mismatch between previewed and restored snapshots
