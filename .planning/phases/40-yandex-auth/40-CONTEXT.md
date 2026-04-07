# Phase 40: yandex-auth - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** User brief + local docs (`.planning/phases/40-yandex-auth/docs.md`) + official Yandex ID docs

<domain>
## Phase Boundary

Replace OTP-first login with Yandex quick login as the primary entry path in the web app, while keeping OTP as a reserve fallback.

This phase delivers:

1. **Primary Yandex login UX** in the existing auth modal / entry flow
2. **Yandex callback handling** at `https://ai.getgantt.ru/auth/yandex/callback`
3. **Backend token exchange** from Yandex OAuth access token to the app's existing local JWT session
4. **Fallback OTP path** preserved for users who prefer email or when Yandex login is unavailable
5. **Rollout updates** so product entry points open the Yandex-first auth flow instead of OTP-first

**In scope:** Web auth flow, frontend widget integration, callback page/route, backend identity lookup, local session issuance, CTA/link updates, basic validation and docs
**Out of scope:** Mobile auth, multiple social providers, account-linking UI, replacing email OTP entirely, deep auth schema redesign
</domain>

<decisions>
## Implementation Decisions

### Auth Product Behavior
- Yandex widget is the default login action shown to unauthenticated users
- OTP remains available in the same auth modal as a fallback, not as the primary first step
- Existing post-login behavior must remain unchanged: local tasks import, project rename carry-over, auth store hydration, and project/session semantics

### Yandex OAuth Flow
- Use Yandex Passport instant-login widget / suggest flow documented in `.planning/phases/40-yandex-auth/docs.md`
- Keep redirect/callback URL at `https://ai.getgantt.ru/auth/yandex/callback`
- The callback route returns the Yandex access token to the opener via `postMessage` using Yandex's helper script flow
- Frontend sends the obtained Yandex access token to backend; backend, not frontend, resolves the Yandex user profile

### Backend Identity Mapping
- Backend validates the Yandex token by requesting Yandex user info and extracting a stable identity plus email
- V1 local account mapping uses email as the canonical lookup key so existing OTP users land in the same account
- If Yandex does not return a usable email, login must fail with a user-facing error instead of creating a partial account
- Local app sessions remain the existing accessToken/refreshToken pair; Yandex token is not stored as the primary session token

### Implementation Shape
- Reuse the current OTP session issuance logic instead of duplicating token/project/session assembly in separate routes
- Prefer a dedicated Yandex auth service/helper over embedding fetch/validation logic directly in the route file
- Keep the existing `OtpModal` behavior as fallback, but evolve the auth entry UI to become Yandex-first

### Rollout
- Marketing/site CTAs that currently deep-link to `?auth=otp` should point to the Yandex-first login entry instead
- Explicit OTP deep-link may remain supported (`?auth=otp`) for troubleshooting and reserve access

### Agent's Discretion
- Exact frontend component split (`OtpModal` extension vs `AuthModal` wrapper)
- Whether the callback route is implemented as a dedicated React screen or a static public asset
- Exact Yandex script loading strategy and TypeScript global typings
- Whether to add provider metadata storage now or defer to a future auth-hardening phase
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / Planning
- `.planning/ROADMAP.md` — phase placement, dependency chain, and plan inventory
- `.planning/STATE.md` — current planning state and recent implementation context
- `.planning/phases/40-yandex-auth/docs.md` — copied Yandex widget/token helper documentation used for this phase

### Frontend Auth Flow
- `packages/web/src/App.tsx` — route parsing, auth modal open behavior, and shared post-login import flow
- `packages/web/src/components/OtpModal.tsx` — current OTP-first auth UI that will become fallback
- `packages/web/src/hooks/useAuth.ts` — auth hook entry point
- `packages/web/src/stores/useAuthStore.ts` — local auth/session persistence and refresh behavior
- `packages/web/public/` — place for static assets if callback flow is implemented outside the SPA
- `packages/web/vite.config.ts` — frontend runtime shape and static/public behavior

### Backend Auth Flow
- `packages/server/src/routes/auth-routes.ts` — current auth endpoints and session issuance logic
- `packages/server/src/auth.ts` — local JWT signing / verification
- `packages/mcp/src/services/auth.service.ts` — user lookup, default project creation, session persistence

### Product Entry Points
- `packages/site/src/components/Header.astro` — top-level auth CTA
- `packages/site/src/components/Footer.astro` — footer CTA
- `packages/site/src/pages/features.astro` — product marketing CTA links
- `packages/site/src/pages/faq.astro` — FAQ CTA links
- `packages/site/src/pages/pricing.astro` — pricing CTA links

### External Documentation
- `https://yandex.ru/dev/id/doc/ru/suggest/script-sdk-suggest` — widget / suggest flow
- `https://yandex.ru/dev/id/doc/ru/suggest/script-sdk-suggest-token` — callback token helper flow
- `https://yandex.com/dev/id/doc/en/` — Yandex ID overview and identity retrieval flow
</canonical_refs>

<specifics>
## Specific Ideas

### UX Target
- Auth modal opens with a prominent Yandex login action and a smaller "Войти по почте" fallback
- Existing OTP two-step flow can stay mostly intact behind the fallback action to reduce regression risk

### Backend Contract
- Add a dedicated endpoint such as `POST /api/auth/yandex`
- Request body should carry the Yandex access token returned by the widget flow
- Response shape should match the existing `AuthSuccessResponse` used by OTP success handling

### Callback Target
- The callback URL explicitly provided for this phase is `https://ai.getgantt.ru/auth/yandex/callback`
- The implementation must work both when the page is opened as part of the Yandex suggest flow and when it needs to send the token back to the opener window

### Rollout Expectation
- `?auth=yandex` (or default auth entry) becomes the recommended deep-link
- `?auth=otp` remains supported for fallback and troubleshooting
</specifics>

<deferred>
## Deferred Ideas

- Provider-agnostic social-auth abstraction
- Persistent `user_identity` / linked-accounts schema for multiple providers
- Native mobile SDK integration
- Additional providers (Google, VK, etc.)
- Admin tools for forcing provider unlink/relink
</deferred>

---

*Phase: 40-yandex-auth*
*Context gathered: 2026-04-08 from user brief, local docs, and Yandex ID docs*
