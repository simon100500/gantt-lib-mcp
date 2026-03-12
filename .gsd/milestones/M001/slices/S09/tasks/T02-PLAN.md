# T02: 09-session-control 02

**Slice:** S09 — **Milestone:** M001

## Description

Implement OTP authentication: email service, JWT utilities, database auth operations, and REST auth endpoints. This plan covers the complete auth flow from OTP request to JWT issuance.

Purpose: Establishes the auth foundation that Plan 04 (middleware) and Plan 05 (UI) depend on.

Output: 4 new files. Auth endpoints callable via curl. No UI yet.

## Must-Haves

- [ ] "User can request OTP by posting email to POST /api/auth/request-otp"
- [ ] "OTP is 6 digits, stored hashed in otp_codes table, expires in 10 minutes"
- [ ] "User can verify OTP via POST /api/auth/verify-otp and receive JWT tokens"
- [ ] "First-time user gets auto-created account + default project on verify"
- [ ] "Access token is a signed JWT (15 min expiry); refresh token is a signed JWT (7 days)"
- [ ] "User can refresh tokens via POST /api/auth/refresh"
- [ ] "User can logout via POST /api/auth/logout (invalidates session in DB)"

## Files

- `packages/server/src/auth.ts`
- `packages/server/src/email.ts`
- `packages/server/src/routes/auth-routes.ts`
- `packages/mcp/src/auth-store.ts`
