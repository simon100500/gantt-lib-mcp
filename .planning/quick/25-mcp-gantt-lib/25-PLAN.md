# Quick Plan 25: Teach MCP agent to apply gantt-lib nesting

## Goal
Make the MCP agent reliably understand and execute gantt-lib hierarchy requests so nested tasks are applied through MCP tools instead of being described only in text.

## Task 1: Strengthen MCP agent instructions for hierarchy edits
Update `packages/mcp/agent/prompts/system.md` so the agent explicitly handles parent/child nesting with `parentId`, including how to create nested tasks, move a task under another task, and remove nesting.

## Task 2: Recognize hierarchy requests as real mutations
Update `packages/server/src/agent.ts` so Russian and English requests about nesting, subtasking, or moving tasks into a parent are treated as mutation intents and therefore must result in actual MCP tool calls.

## Task 3: Lock behavior with a focused regression test
Add a small test around the agent layer to verify hierarchy phrasing is recognized and the prompt keeps hierarchy instructions present.
