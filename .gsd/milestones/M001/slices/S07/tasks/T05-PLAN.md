# T05: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 05

**Slice:** S07 — **Milestone:** M001

## Description

Implement the Chat sidebar and WebSocket integration that connects the web UI to the AI backend. This plan runs in parallel with 07-04 (Gantt chart) since both only touch packages/web/.

Purpose: Users interact with the AI through the chat sidebar. The AI modifies Gantt tasks, and the chart updates in real time via WebSocket broadcast.

Output:
- packages/web/src/hooks/useWebSocket.ts — manages WS lifecycle (connect, send, reconnect)
- packages/web/src/components/ChatSidebar.tsx — scrollable chat history + input form
- packages/web/src/App.tsx — updated to wire GanttChart + ChatSidebar with shared state

## Must-Haves

- [ ] "User types a message in the chat input and presses Enter or Send"
- [ ] "Message is sent over WebSocket as {type:'chat', message: string}"
- [ ] "AI response tokens stream in character-by-character as they arrive from the server"
- [ ] "When server broadcasts {type:'tasks'}, the Gantt chart updates immediately without page reload"
- [ ] "Conversation history is visible in the chat panel (user and assistant messages)"
- [ ] "WebSocket auto-reconnects if connection drops"

## Files

- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/components/ChatSidebar.tsx`
- `packages/web/src/App.tsx`
