# T06: 09-session-control 06

**Slice:** S09 — **Milestone:** M001

## Description

Build authentication UI using shadcn/ui components. Modern, minimal SaaS design.

- OTP modal: fixed overlay with backdrop blur, shadcn Card layout, 6 individual digit Input boxes (Stripe/Linear pattern)
- Project switcher: shadcn DropdownMenu in control bar
- useAuth hook: localStorage persistence, JWT refresh, project switching
- WebSocket: auth handshake after connect

The Gantt app renders behind the modal — no jarring redirects, no blank screens.

## Must-Haves

- [ ] "Unauthenticated user sees OTP modal — Gantt is visible but blurred behind"
- [ ] "User completes email → 6-digit OTP flow and enters the app with auth tokens stored"
- [ ] "Authenticated user sees current project name in top bar with a clickable switcher"
- [ ] "Project switcher dropdown shows list of projects + New project option"
- [ ] "WebSocket sends { type: 'auth', token } handshake immediately after connect"
- [ ] "Logout clears tokens from localStorage and shows OTP modal again"
- [ ] "App refreshes page/tasks when project is switched"

## Files

- `packages/web/src/hooks/useAuth.ts`
- `packages/web/src/components/OtpModal.tsx`
- `packages/web/src/components/ProjectSwitcher.tsx`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/App.tsx`
- `packages/server/src/routes/auth-routes.ts`
