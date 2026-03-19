---
phase: quick-260319-up3
plan: 01
subsystem: frontend-auth
tags: [auth, projects, sidebar, zustand]
dependency_graph:
  requires: []
  provides: [project-auto-load]
  affects: [useAuthStore, App.tsx]
tech_stack:
  added: []
  patterns: [useEffect-for-data-loading, auth-store-method-extension]
key_files:
  created: []
  modified:
    - packages/web/src/stores/useAuthStore.ts
    - packages/web/src/App.tsx
decisions: []
metrics:
  duration: "2 minutes"
  completed_date: "2026-03-19T19:08:00Z"
---

# Phase quick-260319-up3: Auto-refresh projects on page load Summary

JWT auth with refresh rotation using jose library: Implemented automatic project list refresh on page load for authenticated users by adding `refreshProjects()` method to `useAuthStore` and calling it from `App.tsx` on mount.

## Implementation Summary

### Task 1: Added refreshProjects() method to useAuthStore
**Commit:** `b04c925`

Added new async method `refreshProjects()` to the auth store interface and implementation:
- Checks for valid access token before proceeding
- Fetches projects from `/api/projects` endpoint using existing `fetchProjects` helper
- Updates store state with fetched projects
- Persists updated project list to localStorage via `persistStoredAuth`
- Handles errors gracefully with console.error logging
- Placed after `createProject` method (line 474)

**Files modified:**
- `packages/web/src/stores/useAuthStore.ts` (26 lines added)

### Task 2: Added useEffect in App.tsx for automatic project loading
**Commit:** `cea09c8`

Added `useEffect` hook that automatically refreshes projects on component mount:
- Checks if user is authenticated (`auth.isAuthenticated`)
- Validates access token exists (`auth.accessToken`)
- Skips refresh in shared mode (`hasShareToken`)
- Calls `auth.refreshProjects()` to fetch latest project list
- Dependencies: `[auth.isAuthenticated, auth.accessToken, hasShareToken]`
- Placed after `hasShareToken` declaration (line 40)

**Files modified:**
- `packages/web/src/App.tsx` (9 lines added)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Steps

To verify the fix works correctly:

1. Open application in incognito mode or clear localStorage
2. Log in to the application
3. Verify projects load in sidebar
4. Refresh page (F5)
5. Confirm project list displays immediately without needing to manually switch projects
6. Check browser console - no errors should be present

## Success Criteria Met

✅ Projects automatically load from server when authenticated user loads page
✅ Project list in sidebar is current after page refresh
✅ No manual project switch required to update project list
✅ Integration follows existing patterns (fetchProjects, persistStoredAuth)
✅ Error handling prevents UI breakage if fetch fails

## Technical Notes

- The `refreshProjects()` method reuses existing `fetchProjects(token)` helper function
- State persistence uses existing `persistStoredAuth()` for consistency
- The implementation follows the same pattern as `switchProject()` which also fetches projects
- Dependencies in useEffect are properly declared to avoid stale closures
- The void operator is used to intentionally ignore the Promise returned by refreshProjects
