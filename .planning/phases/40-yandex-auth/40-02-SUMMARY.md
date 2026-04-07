---
phase: 40-yandex-auth
plan: 02
subsystem: auth, ui
tags: [yandex, react, vite, oauth, modal]

# Dependency graph
requires:
  - phase: 40-yandex-auth
    provides: Backend `/api/auth/yandex` endpoint and shared auth success payload
provides:
  - Browser Yandex SDK bootstrap and callback handoff screen
  - Yandex-first auth modal with OTP fallback
  - App routing for `auth=yandex`, `auth=otp`, and `/auth/yandex/callback`
affects: [40-03, auth, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-third-party-sdk-loading, callback-route-token-handoff, yandex-first-auth-modal]

key-files:
  created:
    - packages/web/src/components/YandexAuthButton.tsx
    - packages/web/src/components/YandexCallbackPage.tsx
  modified:
    - packages/web/src/components/OtpModal.tsx
    - packages/web/src/App.tsx

key-decisions:
  - "Yandex SDK scripts are lazy-loaded inside dedicated components instead of globally injecting them into index.html."
  - "The existing OTP modal becomes a broader auth modal so Yandex and OTP share the same success callback."

patterns-established:
  - "Third-party auth SDK wrapper: load script once, surface component-local loading/errors, then POST the resulting token to backend."
  - "SPA callback route: render a dedicated callback screen inside App.tsx rather than relying on server-side routing."

requirements-completed: [YA-01, YA-03, YA-04]

# Metrics
duration: 5m
completed: 2026-04-08
---

# Phase 40 Plan 02: Yandex-first web auth summary

**Yandex login is now the primary web auth path, with a callback handoff page and the previous OTP flow preserved as an in-modal fallback**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T22:41:18Z
- **Completed:** 2026-04-07T22:46:25Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added a dedicated Yandex auth button component that lazy-loads the suggest SDK, extracts the widget token, and calls `/api/auth/yandex`.
- Added a minimal `/auth/yandex/callback` screen that relays the token back into the SPA flow.
- Converted the old OTP modal into a Yandex-first auth modal while preserving the existing email/code verification branch.
- Routed both Yandex and OTP login through the same post-login success path in `App.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Yandex widget bootstrap component and callback screen** - `d304a10` (feat/auth)
2. **Task 2: Convert the current OTP-first modal into a Yandex-first auth modal with OTP fallback** - `dbd1a4c` (feat/auth)
3. **Task 3: Route auth entry and callback handling through App.tsx without breaking existing login success behavior** - `2ac3f8e` (feat/auth)

## Files Created/Modified
- `packages/web/src/components/YandexAuthButton.tsx` - Loads Yandex SDK on demand, launches the suggest flow, and posts the token to backend auth.
- `packages/web/src/components/YandexCallbackPage.tsx` - Callback route screen that runs `YaSendSuggestToken` and provides a fallback status message.
- `packages/web/src/components/OtpModal.tsx` - Yandex-first auth modal with OTP fallback branch and shared error handling.
- `packages/web/src/App.tsx` - Handles the callback route and query-param-driven auth modal entry.

## Decisions Made
- Kept Yandex SDK loading component-scoped rather than global so the main bundle does not depend on the script during normal workspace use.
- Reused the existing `onSuccess(AuthSuccessResponse)` path so local task import and project-name transfer stay identical for OTP and Yandex logins.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - frontend env wiring is deferred to the final plan in this phase.

## Next Phase Readiness
- The browser can now complete the full Yandex token handoff flow once `VITE_YANDEX_CLIENT_ID` and deployment docs are finalized.
- Phase 40-03 should lock the env contract and verification checklist before release.

## Self-Check: PASSED

- FOUND: packages/web/src/components/YandexAuthButton.tsx
- FOUND: packages/web/src/components/YandexCallbackPage.tsx
- FOUND: packages/web/src/components/OtpModal.tsx
- FOUND: packages/web/src/App.tsx
- FOUND: d304a10 (Task 1 commit)
- FOUND: dbd1a4c (Task 2 commit)
- FOUND: 2ac3f8e (Task 3 commit)

---
*Phase: 40-yandex-auth*
*Completed: 2026-04-08*
