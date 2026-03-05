---
phase: 09-session-control
plan: 02
subsystem: authentication
tags: [auth, jwt, otp, email, rest, typescript]
wave: 2
dependency_graph:
  requires:
    - id: "09-01"
      subsystem: "database-schema"
      description: "Multi-user SQLite schema with users, projects, sessions, and OTP support"
  provides:
    - id: "09-02"
      subsystem: "authentication"
      description: "OTP authentication service with JWT tokens and REST endpoints"
    - id: "09-02"
      subsystem: "email"
      description: "Email service for OTP delivery with nodemailer"
  affects:
    - subsystem: "middleware"
      description: "Plan 04 (auth middleware) will verify JWT tokens from this plan"
    - subsystem: "ui"
      description: "Plan 05 (UI) will use these endpoints for OTP login flow"
tech_stack:
  added:
    - "jsonwebtoken ^9.0.2"
    - "@types/jsonwebtoken ^9.0.7"
    - "nodemailer ^6.9.16"
    - "@types/nodemailer ^6.4.17"
  patterns:
    - "JWT access/refresh token pattern"
    - "OTP-based passwordless authentication"
    - "Singleton DB client pattern"
    - "Fastify plugin pattern for route registration"
key_files:
  created:
    - path: "packages/server/src/auth.ts"
      description: "JWT sign/verify utilities and OTP generator"
    - path: "packages/server/src/email.ts"
      description: "Email service for OTP delivery"
    - path: "packages/mcp/src/auth-store.ts"
      description: "AuthStore class with DB operations"
    - path: "packages/server/src/routes/auth-routes.ts"
      description: "Fastify plugin with 4 auth endpoints"
  modified:
    - path: "packages/mcp/package.json"
      description: "Added @gantt/mcp/auth-store export"
    - path: "packages/server/src/index.ts"
      description: "Registered auth routes"
decisions:
  - "15-minute access token expiry"
  - "7-day refresh token expiry"
  - "Console OTP fallback when EMAIL_HOST not configured"
  - "Fail fast if JWT_SECRET env var missing"
metrics:
  duration: "248s"
  completed_date: "2026-03-05T14:17:52Z"
  total_tasks: 2
  completed_tasks: 2
  total_files: 4
  created_files: 4
  modified_files: 2
---

# Phase 09 Plan 02: OTP Authentication Service Summary

**One-liner:** JWT-based OTP authentication service with email delivery, REST endpoints, and SQLite-backed session management.

## Objective

Implement the complete OTP authentication flow that Plan 04 (middleware) and Plan 05 (UI) depend on. This includes JWT token generation, OTP delivery via email, and REST endpoints for the full auth lifecycle (request → verify → refresh → logout).

## Artifacts Created

### JWT Utilities (`packages/server/src/auth.ts`)
- `JwtPayload` interface with sub, email, projectId, sessionId, type fields
- `signAccessToken()`: 15-minute expiry JWT
- `signRefreshToken()`: 7-day expiry JWT
- `verifyToken()`: Throws on invalid/expired tokens
- `generateOtp()`: Cryptographically secure 6-digit code

### Email Service (`packages/server/src/email.ts`)
- `sendOtpEmail()` function using nodemailer
- Configurable SMTP via EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS env vars
- Console fallback when EMAIL_HOST not configured (for development)
- HTML email template with large, readable OTP display

### AuthStore (`packages/mcp/src/auth-store.ts`)
- `createOtp()`: Store OTP with 10-minute expiration
- `consumeOtp()`: Validate and mark as used
- `findOrCreateUser()`: Get or create user by email
- `createDefaultProject()`: Auto-create "Default Project" for new users
- `listProjects()`, `createProject()`: Project management
- `createSession()`, `findSessionByAccessToken()`, `findSessionByRefreshToken()`: Session lifecycle
- `updateSessionTokens()`: Token refresh support
- `deleteSession()`: Logout support

### Auth Routes (`packages/server/src/routes/auth-routes.ts`)
- `POST /api/auth/request-otp`: Generate and email OTP
- `POST /api/auth/verify-otp`: Verify OTP, issue JWT tokens, auto-create user/project
- `POST /api/auth/refresh`: Exchange refresh token for new access token
- `POST /api/auth/logout`: Invalidate session

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error with JWT_SECRET**
- **Found during:** Task 1
- **Issue:** TypeScript inferred JWT_SECRET as `string | undefined` even after throw check
- **Fix:** Added separate `SECRET` constant with type assertion after null check
- **Files modified:** packages/server/src/auth.ts
- **Commit:** cec6998

### Authentication Gates

None - no authentication required for implementing auth endpoints.

## Technical Details

### JWT Payload Structure
```typescript
{
  sub: string,      // user_id
  email: string,
  projectId: string,
  sessionId: string,
  type: 'access' | 'refresh',
  iat: number,      // issued at
  exp: number       // expiration
}
```

### Auth Flow Sequence
1. User requests OTP → generate 6-digit code → store in DB (10min expiry) → send email
2. User submits OTP → validate and consume → find/create user → get/create project → sign tokens → create session → return tokens
3. Client sends refresh token → find session → verify token → sign new tokens → update session → return new tokens
4. Client sends access token → find session → delete session → return ok

### Environment Variables
- `JWT_SECRET` (required): Signing secret for JWT tokens
- `EMAIL_HOST` (optional): SMTP server hostname
- `EMAIL_PORT` (optional, default: 587): SMTP port
- `EMAIL_USER` (optional): SMTP username
- `EMAIL_PASS` (optional): SMTP password
- `EMAIL_FROM` (optional, default: 'Gantt App <noreply@example.com>'): Sender address

## Verification Results

- [x] `npx tsc --project packages/server/tsconfig.json --noEmit` passes
- [x] `npx tsc --project packages/mcp/tsconfig.json --noEmit` passes
- [x] Manual auth flow test: all 9 operations passed
- [x] OTP generation produces valid 6-digit strings
- [x] JWT sign/verify round-trip works correctly
- [x] AuthStore operations (createOtp, consumeOtp, findOrCreateUser, createSession, etc.) work
- [x] Console OTP fallback works when EMAIL_HOST not set

## Commits

- `cec6998`: feat(09-02): JWT utils, OTP generator, and email service
- `6555c51`: feat(09-02): AuthStore DB operations and auth REST routes

## Next Steps

Plan 03 (User Store) will add project-scoped task operations. Plan 04 (Auth Middleware) will verify JWT tokens from these endpoints. Plan 05 (UI) will use these endpoints for the login flow.

## Self-Check: PASSED

- [x] packages/server/src/auth.ts - FOUND
- [x] packages/server/src/email.ts - FOUND
- [x] packages/mcp/src/auth-store.ts - FOUND
- [x] packages/server/src/routes/auth-routes.ts - FOUND
- [x] .planning/phases/09-session-control/09-02-SUMMARY.md - FOUND
- [x] Commit cec6998 exists
- [x] Commit 6555c51 exists
