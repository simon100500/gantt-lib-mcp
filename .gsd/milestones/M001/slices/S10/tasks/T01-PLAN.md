# T01: 10-work-stability 01

**Slice:** S10 — **Milestone:** M001

## Description

Fix three server-side/MCP bugs that cause silent data corruption and chat UX breakage:

- Bug 3: MCP child process runs without PROJECT_ID, so tasks are created with project_id=NULL. The broadcast step uses list(projectId) without includeGlobal, so the Gantt chart empties after AI commands even though tasks exist in DB.
- Bug 4: The for-await streaming loop broadcasts the full assistant text twice — once from streaming token events and once from the final AssistantMessage event.
- Bug 5: The system prompt instructs the AI to call export_tasks and print raw JSON, filling the chat with unreadable output.

Purpose: After this plan, AI commands produce tasks scoped to the right project, the Gantt updates in real-time with the correct task set, and responses are concise readable text.
Output: Three files modified: system.md (rewritten), agent.ts (env + broadcast + dedup), mcp/index.ts (env fallback in create_task + create_tasks_batch).

## Must-Haves

- [ ] "AI responds with 1-2 sentence confirmation, never raw JSON exports"
- [ ] "Tasks created by AI are stored with the correct project_id, not NULL"
- [ ] "After AI turn completes, broadcast includes both project-scoped and global tasks (matches HTTP GET)"
- [ ] "Each AI response appears exactly once in chat (no duplicate messages)"

## Files

- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`
- `packages/mcp/src/index.ts`
