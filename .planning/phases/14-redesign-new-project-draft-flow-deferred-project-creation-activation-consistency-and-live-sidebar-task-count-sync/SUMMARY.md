---
status: complete
updated: 2026-03-12
---

# Phase 14 Summary

## What Changed

- Replaced the old implicit draft flow in `packages/web/src/App.tsx` with an explicit workspace state model for guest, shared, draft, and active project modes.
- Added a single draft activation transaction that creates the backend project once, switches to it, opens the project workspace deterministically, and queues the first prompt until the WebSocket is ready.
- Kept empty-chart activation on the same path while avoiding the old split `pendingNewProject` / `pendingStartPrompt` logic.
- Switched chat sidebar visibility to the project workspace state instead of a standalone boolean.
- Added `syncProjectTaskCount(projectId, taskCount)` to `packages/web/src/hooks/useAuth.ts` and wired `App.tsx` to update the active sidebar count immediately from live task state.
- Updated the project switcher draft presentation so a draft is shown as a draft instead of masquerading as the previously active project.

## Verification

- `npm run build -w packages/web`
- Build completed successfully on 2026-03-12.

## Notes

- Vite emitted existing third-party `"use client"` bundle warnings from Radix UI and `gantt-lib`, but the production build succeeded.
