---
status: verifying
trigger: "Investigate issue: websocket-connection-failed - WebSocket connection to 'ws://localhost:5173/ws' fails"
created: "2025-03-06T00:00:00.000Z"
updated: "2025-03-06T00:00:00.000Z"
---

## Current Focus
hypothesis: Vite proxy config has incorrect target protocol - using 'ws://localhost:3000' instead of 'http://localhost:3000'
test: Fix the Vite proxy configuration to use http:// protocol for WebSocket proxy target
expecting: WebSocket connection should succeed after fixing proxy config
next_action: Fix vite.config.ts and test the connection

## Symptoms
expected: Real-time sync should work via WebSocket - app should be able to send/receive real-time messages
actual: WebSocket connection fails to ws://localhost:5173/ws with error "WebSocket is closed before the connection is established"
errors:
  - useWebSocket.ts:77 WebSocket connection to 'ws://localhost:5173/ws' failed: WebSocket is closed before the connection is established.
  - useWebSocket.ts:69 [ws] error Event
reproduction: Error occurs every time the app loads
started: Recently broken - it worked before

## Eliminated

## Evidence
- timestamp: "2025-03-06T00:00:00.000Z"
  checked: vite.config.ts WebSocket proxy configuration
  found: The proxy config uses `target: 'ws://localhost:3000'` which is incorrect for Vite's proxy
  implication: Vite proxy needs the target to be http://, not ws:// - Vite handles WebSocket upgrade automatically when ws: true is set

## Resolution
root_cause: Vite proxy configuration was using incorrect target protocol `ws://localhost:3000` instead of `http://localhost:3000`. When using Vite's proxy with ws:true, the target should use http:// protocol and Vite handles the WebSocket upgrade automatically.
fix: Changed `target: 'ws://localhost:3000'` to `target: 'http://localhost:3000'` in packages/web/vite.config.ts
verification: Pending - needs user to restart dev server and test WebSocket connection
files_changed:
  - packages/web/vite.config.ts
