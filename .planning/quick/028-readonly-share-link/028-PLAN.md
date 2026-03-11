# Quick Task 028: Read-only share link without registration

**Status:** Complete
**Date:** 2026-03-12

## Task 1

**files**
- `packages/server/src/auth.ts`
- `packages/server/src/routes/auth-routes.ts`
- `packages/mcp/src/auth-store.ts`

**action**
- Add a dedicated `share` JWT token type.
- Add an authenticated endpoint that creates a public share URL for the current project.
- Add a public endpoint that resolves a share token into project metadata and task data in read-only mode.

**verify**
- Typecheck `packages/server` and `packages/mcp` with `tsc --noEmit`.
- Confirm the share endpoint does not accept non-share tokens.

**done**
- Share tokens are generated on demand and public read-only project data can be loaded without login.

## Task 2

**files**
- `packages/web/src/App.tsx`
- `packages/web/src/hooks/useSharedProject.ts`

**action**
- Add a simple share button for authenticated users.
- Detect `?share=` deeplinks on app load.
- Render the linked project in read-only mode and disable chat/edit/save flows.

**verify**
- Typecheck `packages/web` with `tsc --noEmit`.
- Confirm share mode suppresses auth-only fetches and interactive edits.

**done**
- Shared links open directly in a read-only UI without registration.
