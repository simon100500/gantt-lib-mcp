---
phase: 40-yandex-auth
verified: 2026-04-07T22:48:35Z
status: passed
score: 5/5 must-haves verified
---

# Phase 40: Yandex Auth Verification Report

**Phase Goal:** Make Yandex widget login the primary auth path in the web app while preserving OTP fallback and the existing local session/bootstrap behavior.
**Verified:** 2026-04-07T22:48:35Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unauthenticated users see Yandex as the primary login action while OTP remains available as fallback | VERIFIED | `packages/web/src/components/OtpModal.tsx` now opens on a Yandex-first choice screen with `YandexAuthButton` primary CTA and "Войти по почте" fallback. |
| 2 | The callback route `/auth/yandex/callback` is handled inside the SPA and returns the token to the opener flow | VERIFIED | `packages/web/src/components/YandexCallbackPage.tsx` loads the helper SDK and calls `YaSendSuggestToken(...)`; `packages/web/src/App.tsx` renders it when `pathname === '/auth/yandex/callback'`. |
| 3 | Backend accepts a Yandex access token, resolves a profile, and returns the standard app auth payload | VERIFIED | `packages/server/src/services/yandex-auth-service.ts` normalizes `{ id, defaultEmail, emails, displayName }`; `packages/server/src/routes/auth-routes.ts` exposes `POST /api/auth/yandex` and returns the same `AuthSuccessResponse` shape as OTP. |
| 4 | Yandex and OTP share one local session/bootstrap path so post-login behavior remains unchanged | VERIFIED | `issueLocalAuthSession(...)` in `auth-routes.ts` is used by both `/api/auth/verify-otp` and `/api/auth/yandex`; `handleAuthSuccess(...)` in `packages/web/src/App.tsx` is shared by both login paths. |
| 5 | Yandex config/docs keep the client id frontend-only, any secret backend-only, and keep `packages/site` out of scope | VERIFIED | `packages/web/.env` contains only `VITE_YANDEX_CLIENT_ID`; `.planning/phases/40-yandex-auth/docs.md` documents backend-only `YANDEX_CLIENT_SECRET`, exact callback URLs, and explicitly states `packages/site` is not involved. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/server/src/services/yandex-auth-service.ts` | Dedicated Yandex token/profile service | VERIFIED | Fetches `https://login.yandex.ru/info`, normalizes email, classifies missing token / invalid token / missing email / upstream failures. |
| `packages/server/src/services/yandex-auth-service.test.ts` | Focused backend auth tests | VERIFIED | 5 passing tests in `packages/server/dist/services/yandex-auth-service.test.js`. |
| `packages/mcp/src/services/auth.service.ts` | Shared login-ready project helper | VERIFIED | `ensurePrimaryProject(userId)` guarantees a project exists before session issuance. |
| `packages/server/src/routes/auth-routes.ts` | Shared OTP/Yandex auth bootstrap + Yandex route | VERIFIED | `/api/auth/yandex` and `/api/auth/verify-otp` both call `issueLocalAuthSession(...)`. |
| `packages/web/src/components/YandexAuthButton.tsx` | Web Yandex SDK wrapper | VERIFIED | Lazy-loads suggest SDK, launches handler, extracts access token, POSTs to `/api/auth/yandex`. |
| `packages/web/src/components/YandexCallbackPage.tsx` | Callback token handoff screen | VERIFIED | Lazy-loads helper SDK and posts token back to the opener origin. |
| `packages/web/src/components/OtpModal.tsx` | Yandex-first auth modal with OTP fallback | VERIFIED | Choice screen + retained email/code branch. |
| `packages/web/src/App.tsx` | Callback routing and shared auth success path | VERIFIED | Recognizes `auth=yandex`, `auth=otp`, and `/auth/yandex/callback`. |
| `packages/web/.env` | Frontend placeholder for public Yandex env | VERIFIED | Contains `VITE_YANDEX_CLIENT_ID=` only. |
| `.planning/phases/40-yandex-auth/docs.md` | Exact rollout and verification docs | VERIFIED | Documents redirect URI, token handoff, env split, shipping checklist, and manual verification steps. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/web/src/components/YandexAuthButton.tsx` | `packages/server/src/routes/auth-routes.ts` | `POST /api/auth/yandex` | WIRED | Button submits `{ accessToken }` to `/api/auth/yandex`. |
| `packages/server/src/routes/auth-routes.ts` | `packages/mcp/src/services/auth.service.ts` | `ensurePrimaryProject`, `createSession`, `updateSessionTokens` | WIRED | Shared auth bootstrap uses MCP auth service for user/project/session persistence. |
| `packages/web/src/App.tsx` | `packages/web/src/components/YandexCallbackPage.tsx` | SPA route handoff | WIRED | `isYandexCallbackRoute` gates the callback page render. |
| `packages/web/src/components/OtpModal.tsx` | `packages/web/src/components/YandexAuthButton.tsx` | Shared modal UI | WIRED | The primary auth screen renders `YandexAuthButton` and forwards errors/success. |
| `packages/web/src/App.tsx` | `packages/web/src/components/OtpModal.tsx` | Shared success callback | WIRED | `handleAuthSuccess(...)` handles both Yandex and OTP results. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| MCP + server TypeScript compile | `npx tsc -p packages/mcp/tsconfig.json && npx tsc -p packages/server/tsconfig.json` | Clean | PASS |
| Yandex auth service tests | `node --test packages/server/dist/services/yandex-auth-service.test.js` | 5/5 passing | PASS |
| Web production build | `cd packages/web && npm run build` | PASS with pre-existing bundle-size and `"use client"` warnings from dependencies | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| YA-01 | Yandex is the primary auth CTA, OTP remains fallback | SATISFIED | `OtpModal.tsx` choice screen + fallback branch. |
| YA-02 | Backend validates Yandex token and maps it into local auth | SATISFIED | `YandexAuthService` + `/api/auth/yandex`. |
| YA-03 | OTP and Yandex share one local auth/session bootstrap | SATISFIED | Shared `issueLocalAuthSession(...)` route helper. |
| YA-04 | Callback flow returns the token into the web app without Astro involvement | SATISFIED | `YandexCallbackPage.tsx`, App route handling, phase docs. |
| YA-05 | Client ID is frontend env, secret remains backend-only | SATISFIED | `packages/web/.env` and phase docs env split. |

### Human Verification Required

### 1. Yandex widget login end-to-end

**Test:** Configure a real `VITE_YANDEX_CLIENT_ID`, open the auth modal, click "Войти через Яндекс", and complete the OAuth flow.
**Expected:** The callback page returns to the opener, `/api/auth/yandex` returns the standard auth payload, and the app logs in successfully.
**Why human:** Requires a real Yandex OAuth app and browser popup/postMessage behavior.

### 2. OTP fallback end-to-end

**Test:** From the same auth modal, switch to "Войти по почте", request an OTP code, and complete verification.
**Expected:** Login succeeds through the unchanged OTP flow and uses the same post-login workspace bootstrap as Yandex.
**Why human:** Requires live email delivery and UI confirmation.

### 3. Post-login import behavior after Yandex auth

**Test:** Create local guest tasks before login, then authenticate through Yandex.
**Expected:** Local tasks import into the authenticated project and the local draft project name transfers as before.
**Why human:** Verifies browser state carry-over and UX continuity rather than static code structure.

### Gaps Summary

No implementation gaps found. The remaining work is external/manual: configure a real Yandex OAuth application and run the browser-based checklist. All required code paths, route wiring, env boundaries, and rollout docs for Phase 40 are present.

---

_Verified: 2026-04-07T22:48:35Z_
_Verifier: Codex (inline verification)_
