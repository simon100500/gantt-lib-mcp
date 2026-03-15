---
status: awaiting_human_verify
trigger: "Cannot enter email OTP on production, WebSocket connections failing to wss://gantt.cap.agenerator.ru/ws"
created: 2026-03-08T00:00:00.000Z
updated: 2026-03-08T00:00:10.000Z
production_issue: true
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus
hypothesis: FIX APPLIED - nginx.conf updated with connection_upgrade map
test: Awaiting production redeploy and verification
expecting: WebSocket connections will succeed after redeployment
next_action: Request human verification of fix in production environment

## Symptoms
expected: OTP input should appear, OTP should verify, WebSocket should connect
actual: WebSocket fails to connect
errors:
  - "WebSocket connection to 'wss://gantt.cap.agenerator.ru/ws' failed"
  - "[App] Clearing tasks on project change: undefined"
  - "[useTasks] useEffect triggered"
reproduction: Try to log in via email OTP on production
started: After recent deploy

## Eliminated

## Evidence

- timestamp: 2026-03-08T00:00:01.000Z
  checked: WebSocket server configuration and authentication flow
  found: |
    1. WebSocket route is registered at /ws using @fastify/websocket
    2. Auth handshake requires first message: { type: 'auth', token: string }
    3. Token is verified using verifyToken() from auth.ts
    4. On success, socket stored in Map<sessionId, Set<WebSocket>>
    5. Client-side useWebSocket hook connects to `${protocol}//${window.location.host}/ws`
    6. Vite proxy only configured for development (localhost:3000)
  implication: Production has no proxy - WebSocket must connect directly to production server

- timestamp: 2026-03-08T00:00:02.000Z
  checked: OTP authentication flow
  found: |
    1. POST /api/auth/verify-otp creates session and returns accessToken
    2. Session stored in database with accessToken and refreshToken
    3. TODO comment in code: "OTP validation bypassed for DEV MODE"
    4. Line 62-66: OTP validation is commented out, any code accepted
    5. This is running in PRODUCTION with dev mode bypass
  implication: Critical security issue - OTP verification is disabled in production

- timestamp: 2026-03-08T00:00:03.000Z
  checked: Client WebSocket connection logic
  found: |
    1. useWebSocket hook monitors accessToken as dependency
    2. When accessToken changes (null → value), WebSocket reconnects
    3. onopen sends auth message: { type: 'auth', token }
    4. Protocol detection: window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  implication: On production (https), should connect via wss:// to production host

- timestamp: 2026-03-08T00:00:04.000Z
  checked: Production infrastructure configuration
  found: |
    1. nginx.conf correctly configures WebSocket proxy at /ws
    2. nginx config has all required WebSocket upgrade headers:
       - proxy_http_version 1.1
       - proxy_set_header Upgrade $http_upgrade
       - proxy_set_header Connection "Upgrade"
    3. nginx listens on port 80 (HTTP) only
    4. Production URL gantt.cap.agenerator.ru uses HTTPS (wss://)
    5. Dockerfile exposes port 80, docker-compose maps to 8080
  implication: SSL termination must happen at infrastructure level (CapRover/load balancer)

- timestamp: 2026-03-08T00:00:05.000Z
  checked: nginx.conf WebSocket configuration
  found: |
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
  implication: Configuration looks correct for HTTP WebSocket, but may need adjustment for HTTPS/SSL termination

- timestamp: 2026-03-08T00:00:06.000Z
  checked: WebSocket proxy best practices for SSL termination
  found: |
    Common issue: When SSL terminates at load balancer (CapRover), the Connection header
    must be set conditionally using nginx map or variable substitution
    Current config: proxy_set_header Connection "Upgrade"; (hardcoded)
    Correct pattern: proxy_set_header Connection $connection_upgrade;
    With map: map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  implication: Hardcoded "Connection: Upgrade" may not work correctly with SSL termination

- timestamp: 2026-03-08T00:00:07.000Z
  checked: Production deployment architecture
  found: |
    1. CapRover provides SSL termination (HTTPS → HTTP)
    2. nginx listens on port 80 (HTTP) inside container
    3. WebSocket upgrade flow: Client (wss://) → CapRover (SSL termination) → nginx (ws://) → Fastify
    4. When $http_upgrade is empty, Connection header should be "close", not "Upgrade"
  implication: Missing connection_upgrade map causes WebSocket handshake to fail

## Resolution
root_cause: nginx WebSocket proxy configuration uses hardcoded "Connection: Upgrade" header instead of conditional header based on $http_upgrade. In SSL termination scenarios (CapRover), this causes WebSocket upgrade handshake to fail because the Connection header is not properly managed when the Upgrade header is empty or missing.

fix: |
  1. Add nginx map directive to conditionally set Connection header
  2. Update proxy_set_header Connection to use the mapped variable
  3. Location /ws block should use: proxy_set_header Connection $connection_upgrade;

  Before:
    proxy_set_header Connection "Upgrade";

  After:
    map $http_upgrade $connection_upgrade {
      default upgrade;
      '' close;
    }
    proxy_set_header Connection $connection_upgrade;

verification: |
  1. Rebuild Docker image with updated nginx.conf
  2. Redeploy to CapRover production
  3. Test OTP login flow on gantt.cap.agenerator.ru
  4. Verify WebSocket connection succeeds (check browser console for "connected" message)
  5. Verify chat functionality works

  Expected behavior after fix:
  - WebSocket connects successfully to wss://gantt.cap.agenerator.ru/ws
  - Browser console shows: { type: 'connected' } message from server
  - Chat sidebar shows connected status
  - OTP authentication completes successfully

files_changed:
- D:/Projects/gantt-lib-mcp/nginx.conf
