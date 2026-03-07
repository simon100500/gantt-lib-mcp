---
phase: quick-007
plan: 007
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/components/ChatSidebar.tsx
  - packages/web/src/App.tsx
autonomous: true
requirements:
  - QUICK-007-01: Add loading indicator during AI response generation
  - QUICK-007-02: Display only final AI response, not intermediate messages
must_haves:
  truths:
    - "User sees visual loading indicator while AI generates response"
    - "Loading indicator has shimmering text animation effect"
    - "Only final AI response is displayed in chat, not 'I will do this' messages"
    - "Streaming tokens accumulate and display as single complete message"
    - "Loading state clears when AI response is complete"
  artifacts:
    - path: "packages/web/src/components/ChatSidebar.tsx"
      provides: "Chat UI with loading indicator"
      contains: "loading prop, shimmer animation styles"
    - path: "packages/web/src/App.tsx"
      provides: "Loading state management"
      contains: "aiThinking state tracking"
  key_links:
    - from: "App.tsx"
      to: "ChatSidebar.tsx"
      via: "loading={aiThinking}"
      pattern: "loading.*aiThinking"
---

<objective>
Add animated loading indicator during AI response generation with shimmering text effect. Ensure only final AI response is displayed, not intermediate planning messages.

Purpose: Improve user experience by providing visual feedback during AI processing and displaying only the final result rather than internal AI reasoning.

Output: Enhanced chat interface with loading shimmer animation.
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/web/src/components/ChatSidebar.tsx
@packages/web/src/App.tsx
@packages/web/src/hooks/useWebSocket.ts

# Current implementation
- ChatSidebar receives `streaming` prop for partial AI responses
- App.tsx manages `aiThinking` state during AI processing
- useWebSocket accumulates streaming tokens into `streaming` state
- Streaming content displays with pulsing cursor indicator
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add loading indicator with shimmer animation to ChatSidebar</name>
  <files>packages/web/src/components/ChatSidebar.tsx</files>
  <action>
Add loading indicator component with shimmering text animation:

1. Add `loading` prop to ChatSidebarProps interface
2. Create shimmer animation CSS keyframes in component (or global CSS)
3. Add loading indicator that appears when `loading && !streaming` (before any tokens arrive)
4. Shimmer effect: text with gradient background animation (similar to skeleton loaders)
5. Use Russian text "Генерация ответа..." or "AI думает..." for loading message
6. Style: subtle gray text with animated light sweep effect

Implementation approach:
- Use CSS @keyframes for shimmer gradient animation
- Apply to loading text with background-clip: text
- Position below message list or replace empty state
- Only show when loading=true and streaming is empty
</action>
  <verify>
<automated>cd packages/web && npm run build 2>&1 | grep -E "(error|Error)" || echo "Build successful"</automated>
</verify>
  <done>Loading indicator displays with shimmer animation when AI is thinking but no tokens yet received</done>
</task>

<task type="auto">
  <name>Task 2: Update App.tsx to pass loading state to ChatSidebar</name>
  <files>packages/web/src/App.tsx</files>
  <action>
Pass aiThinking state as loading prop to ChatSidebar:

1. Find ChatSidebar component usage (line ~298)
2. Add `loading={aiThinking}` prop
3. Ensure aiThinking is set to true immediately on user message send (already done on line 62)
4. Ensure aiThinking is set to false on 'done' or 'error' WebSocket messages (already done on lines 36, 48)

No changes to aiThinking logic needed - just pass the existing state to ChatSidebar.
</action>
  <verify>
<automated>cd packages/web && npm run build 2>&1 | grep -E "(error|Error)" || echo "Build successful"</automated>
</verify>
  <done>ChatSidebar receives loading prop and displays shimmer indicator during AI processing</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: Verify loading indicator behavior and final response display</name>
  <what-built>Complete loading indicator with shimmer animation in chat interface</what-built>
  <how-to-verify>
1. Start dev server: cd packages/web && npm run dev
2. Open browser to localhost:5173
3. Authenticate with OTP
4. Send a message to AI (e.g., "Create a task for tomorrow")
5. Verify shimmer loading indicator appears immediately
6. Verify shimmer animation has running light effect
7. Verify streaming tokens accumulate in single message (no intermediate "I will do this")
8. Verify final complete message appears when done event received
9. Verify loading indicator disappears when response complete
10. Test error case: disconnect server, verify loading state clears properly
  </how-to-verify>
  <resume-signal>Type "approved" if loading indicator works correctly, or describe issues</resume-signal>
</task>

</tasks>

<verification>
1. Build passes without TypeScript errors
2. Loading indicator appears with shimmer animation during AI processing
3. Only final AI response displayed, not intermediate planning messages
4. Streaming tokens accumulate into single complete message
5. Loading state clears properly on completion or error
6. Visual polish: animation smooth, text readable, not distracting
</verification>

<success_criteria>
- User sees immediate visual feedback when AI starts processing
- Shimmer animation provides professional loading indicator
- Chat displays only final AI responses, not internal reasoning
- Streaming response accumulates tokens seamlessly
- Loading state clears appropriately on completion/error
</success_criteria>

<output>
After completion, create `.planning/quick/007-ai-response-loader/007-SUMMARY.md`
</output>
