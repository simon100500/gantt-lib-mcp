---
phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue
plan: "05"
subsystem: ui
tags: [react, websocket, streaming, chat]

# Dependency graph
requires:
  - phase: 07-01
    provides: monorepo scaffold with packages/web Vite+React app
  - phase: 07-04
    provides: GanttChart component and useTasks hook with setTasks exposed

provides:
  - useWebSocket hook managing WS lifecycle with exponential backoff reconnect
  - ChatSidebar component with streaming AI response and conversation history
  - App.tsx wiring GanttChart + ChatSidebar with shared WebSocket state

affects:
  - 07-06-deploy

# Tech tracking
tech-stack:
  added: []
  patterns:
    - onMessage callback via useRef to avoid stale closures in WebSocket handler
    - streaming state accumulates tokens then commits to messages array on 'done'
    - aiThinking flag disables input while server is processing

key-files:
  created:
    - packages/web/src/hooks/useWebSocket.ts
    - packages/web/src/components/ChatSidebar.tsx
  modified:
    - packages/web/src/App.tsx

key-decisions:
  - "useRef for onMessage callback — avoids recreating WebSocket on every render while still calling latest handler"
  - "setStreaming functional update on 'done' — captures current partial text before clearing to commit to messages"
  - "connected prop passed to ChatSidebar — disables input when WS not open, prevents dropped messages"

patterns-established:
  - "Pattern 1: WS message handler via ref — keep WS connection stable, update logic without reconnecting"
  - "Pattern 2: Streaming accumulation — append tokens to streaming string, move to messages[] on 'done'"

requirements-completed: [WEB-05]

# Metrics
duration: 1min
completed: 2026-03-04
---

# Phase 07 Plan 05: Chat Sidebar and WebSocket Integration Summary

**React chat sidebar with real-time AI token streaming over WebSocket, exponential backoff reconnect, and live Gantt task updates on {type:'tasks'} broadcast**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-04T10:38:11Z
- **Completed:** 2026-03-04T10:38:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- useWebSocket hook connects to /ws, calls onMessage callback on each parsed JSON message, and reconnects automatically with exponential backoff (1s → 2s → 4s → max 16s)
- ChatSidebar shows full conversation history, renders streaming partial response with blinking cursor, and disables input while AI is thinking or WS is disconnected
- App.tsx wires all state together: tasks update immediately on {type:'tasks'}, tokens accumulate in streaming string, 'done' commits accumulated text as assistant message

## Task Commits

Each task was committed atomically:

1. **Task 1: useWebSocket hook with reconnect logic** - `464a37e` (feat)
2. **Task 2: ChatSidebar component and App.tsx integration** - `b158339` (feat)

## Files Created/Modified

- `packages/web/src/hooks/useWebSocket.ts` - WebSocket hook with connect/send/reconnect; exports useWebSocket, ServerMessage, ClientMessage types
- `packages/web/src/components/ChatSidebar.tsx` - Scrollable chat panel with streaming message, send form, connection indicator; exports ChatSidebar, ChatMessage
- `packages/web/src/App.tsx` - Updated to import and wire ChatSidebar + useWebSocket alongside GanttChart + useTasks

## Decisions Made

- Used `useRef` for the `onMessage` callback so the WebSocket connection is created once on mount but always calls the latest handler — avoids stale closure without triggering reconnect on every render cycle.
- The `setStreaming` functional update on 'done' captures the current accumulated partial text before clearing to zero — ensures no tokens are lost at the moment the message is finalized.
- `connected` prop passed through to ChatSidebar disables the input when WS is not OPEN, preventing messages being silently dropped.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full web UI ready: Gantt chart displays tasks, chat sidebar accepts user input, AI response streams in real time, tasks update live on broadcast
- Server (07-03) must be running on :3000 for WS and REST to function; Vite proxy routes /ws and /api to :3000
- Ready for deployment plan (07-06) — static build served by Fastify, single container

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*
