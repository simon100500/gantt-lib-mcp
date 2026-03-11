---
status: awaiting_human_verify
trigger: "Investigate issue: ai-chat-follow-up-null-signal"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:18:00Z
---

## Current Focus

hypothesis: Confirmed. The bug was caused by sharing `abortControllerRef.current` across async boundaries instead of keeping a request-local controller reference.
test: Self-verification is complete; waiting for user confirmation in the real chat workflow.
expecting: A follow-up message sent immediately after the first AI reply should stream normally without `reading 'signal'` errors.
next_action: user verifies the follow-up chat flow in the browser

## Symptoms

expected: User can continue the chat after the first answer, for example adding one more task like `Сдача работ`, and the next request should stream normally.
actual: The first turn works, but a follow-up turn may fail immediately and the chat shows `Error: TypeError: Cannot read properties of null (reading 'signal')`.
errors: `TypeError: Cannot read properties of null (reading 'signal')`
reproduction: 1. Send an initial planning request. 2. Wait for response. 3. Send a follow-up message quickly after or while prior cleanup is still settling. 4. Error appears instead of sending the next chat request.
started: Observed in current codebase on 2026-03-11. Probably a regression in `packages/web/src/hooks/useAIStream.ts` where a shared AbortController ref is reused across async boundaries.

## Eliminated

## Evidence

- timestamp: 2026-03-11T00:06:00Z
  checked: `packages/web/src/hooks/useAIStream.ts`
  found: The current working tree differs from HEAD. HEAD used `abortControllerRef.current.signal` in both fetch calls and always set `abortControllerRef.current = null` in `finally`; the working tree now uses a local `controller.signal` and only clears the ref if it still matches that controller.
  implication: The HEAD implementation had a concrete async race on shared AbortController state that matches the reported null `signal` error during rapid follow-up sends.

- timestamp: 2026-03-11T00:08:00Z
  checked: `packages/web/src/App.tsx`
  found: Follow-up send availability is driven by `aiThinking || aiStreaming`, and `handleAIStreamMessage` clears `aiThinking` on `done` before `useAIStream` finishes its `finally` cleanup.
  implication: The UI can allow another send while the previous hook invocation is still unwinding, making the AbortController race reachable in normal usage.

- timestamp: 2026-03-11T00:12:00Z
  checked: `packages/web/src/hooks/useSSE.test.ts` via `npm exec vitest run packages/web/src/hooks/useSSE.test.ts`
  found: The targeted regression test for overlapping sends passed, and the hook no longer emitted an error message for the follow-up request path.
  implication: The working-tree hook implementation prevents the prior request's cleanup from corrupting the active request's controller state.

- timestamp: 2026-03-11T00:16:00Z
  checked: `packages/web` build via `npm run build -w packages/web`
  found: TypeScript and Vite build succeeded after adjusting the regression test's mocked response cast to `unknown as Response`.
  implication: The fix and its regression test compile cleanly in the web package.

## Resolution

root_cause: `useAIStream` stored the active AbortController only in a shared ref, then read `abortControllerRef.current.signal` inside async fetch setup and always nulled the ref in `finally`. When a previous request aborted and finished slightly later than a follow-up request, it could clear the shared ref while the new request was still starting, causing `Cannot read properties of null (reading 'signal')`.
fix: Keep a request-local `controller` constant for both fetch calls, assign it to the ref only for cancellation bookkeeping, and only clear the ref in `finally` if it still points to that same controller. Added a regression test that overlaps two `send()` calls and asserts the second call keeps a valid signal.
verification: Targeted Vitest regression test passed for `packages/web/src/hooks/useSSE.test.ts`, and `npm run build -w packages/web` completed successfully.
files_changed: ["packages/web/src/hooks/useAIStream.ts", "packages/web/src/hooks/useSSE.test.ts"]
