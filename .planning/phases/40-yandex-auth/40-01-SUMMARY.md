---
phase: 40-yandex-auth
plan: 01
subsystem: auth, api
tags: [yandex, oauth, jwt, fastify, otp]

# Dependency graph
requires:
  - phase: 38-paywall-trial-transition
    provides: Current local session/bootstrap auth flow and active web auth surface
provides:
  - Dedicated Yandex token/profile normalization service
  - Shared local auth bootstrap for OTP and Yandex login
  - POST /api/auth/yandex returning the standard auth payload
affects: [40-02, 40-03, auth, web-login]

# Tech tracking
tech-stack:
  added: []
  patterns: [social-login-profile-normalization, shared-auth-session-bootstrap]

key-files:
  created:
    - packages/server/src/services/yandex-auth-service.ts
    - packages/server/src/services/yandex-auth-service.test.ts
  modified:
    - packages/mcp/src/services/auth.service.ts
    - packages/server/src/routes/auth-routes.ts

key-decisions:
  - "Yandex access tokens are verified directly against Yandex user-info API, keeping client secret handling backend-only and optional."
  - "OTP and Yandex now share one route-local session bootstrap so JWT/session semantics remain identical."

patterns-established:
  - "Normalized social profile service: classify upstream auth failures into missing token, invalid token, missing email, and upstream failure."
  - "Shared auth bootstrap: user/project/session lookup happens once and returns the existing AuthSuccessResponse contract."

requirements-completed: [YA-01, YA-02, YA-03]

# Metrics
duration: 5m
completed: 2026-04-08
---

# Phase 40 Plan 01: Yandex backend auth bootstrap summary

**Yandex token validation, reusable local session bootstrap, and `/api/auth/yandex` now feed the same JWT/project payload as OTP login**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T22:35:54.168Z
- **Completed:** 2026-04-07T22:41:18Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added a dedicated `YandexAuthService` that fetches Yandex profile data, normalizes a canonical email, and classifies expected failure modes.
- Extracted shared local auth bootstrap logic so OTP and Yandex both reuse the same user/project/session issuance path.
- Exposed `POST /api/auth/yandex` with stable 400/401/502 responses while keeping OTP behavior unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Yandex token verification service and normalized profile contract** - `d9a74f5` (test/auth)
2. **Task 2: Refactor auth bootstrap so OTP and Yandex share one local session issuance path** - `2225583` (refactor/auth)
3. **Task 3: Expose POST /api/auth/yandex using the shared session bootstrap** - `26ce186` (feat/auth)

## Files Created/Modified
- `packages/server/src/services/yandex-auth-service.ts` - Yandex token lookup, email normalization, and typed auth errors.
- `packages/server/src/services/yandex-auth-service.test.ts` - Focused coverage for success, missing token, invalid token, missing email, and upstream failure.
- `packages/mcp/src/services/auth.service.ts` - Shared helper that guarantees a login-ready primary project.
- `packages/server/src/routes/auth-routes.ts` - Route-local auth bootstrap plus the new Yandex login endpoint.

## Decisions Made
- Verified Yandex tokens through `https://login.yandex.ru/info` using the widget-issued access token, which keeps backend secret usage optional and server-only.
- Kept JWT signing inside the server route layer and limited the MCP auth service change to project resolution, avoiding a cross-package token-signing dependency.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Server typechecking initially missed the new MCP auth helper because `@gantt/mcp` had to be rebuilt first; resolved by recompiling `packages/mcp` before the server verification pass.

## User Setup Required
None - no external service configuration required in this plan.

## Next Phase Readiness
- Web auth UI can now send Yandex widget tokens to `/api/auth/yandex` and expect the same payload shape as OTP login.
- Phase 40-03 still needs env/docs verification before the feature is ready to ship safely.

## Self-Check: PASSED

- FOUND: packages/server/src/services/yandex-auth-service.ts
- FOUND: packages/server/src/services/yandex-auth-service.test.ts
- FOUND: packages/mcp/src/services/auth.service.ts
- FOUND: packages/server/src/routes/auth-routes.ts
- FOUND: d9a74f5 (Task 1 commit)
- FOUND: 2225583 (Task 2 commit)
- FOUND: 26ce186 (Task 3 commit)

---
*Phase: 40-yandex-auth*
*Completed: 2026-04-08*
