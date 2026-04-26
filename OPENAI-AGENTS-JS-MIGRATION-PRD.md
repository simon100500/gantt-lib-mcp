# OpenAI Agents JS Migration PRD

## Summary

Replace `@qwen-code/sdk` with OpenAI Agents JS for the agent execution layer.

The migration is a hard replacement, not a feature-flagged adapter. Runtime code should no longer import or depend on `@qwen-code/sdk` after implementation. The target backend is the OpenAI API. The model must be provided through `OPENAI_MODEL`; the previous `glm-4.7` fallback is not valid for this migration.

## Current State

`@qwen-code/sdk` is currently used in a small number of surfaces:

- `packages/server/src/agent.ts`
  - initial generation route decision query;
  - initial generation planner query;
  - full-agent mutation attempt runner.
- `packages/server/src/agent/direct-tools.ts`
  - embedded direct tool definitions and qwen SDK MCP server wrapper.
- `packages/server/src/split-task.ts`
  - split-task planner query.
- `packages/mcp/agent/agent.ts`
  - legacy CLI agent runner.
- package manifests and lockfile.

Fast semantic mutation classifier/planner paths already use direct OpenAI-compatible `chat/completions` HTTP calls and do not depend on qwen. Those paths are out of scope unless a change is required to keep shared env validation consistent.

## Goals

- Remove `@qwen-code/sdk` from runtime code.
- Use `@openai/agents` for agent runs, tool execution, streaming, and local MCP subprocess support where needed.
- Preserve current product behavior:
  - initial project generation;
  - ordinary read-only chat;
  - ordinary conversational mutations;
  - split-task flow;
  - normalized tool execution and mutation verification;
  - agent debug logs and WebSocket completion behavior.
- Improve latency observability by preserving existing timing metrics around agent attempts.

## Non-Goals

- Do not redesign the mutation orchestrator.
- Do not rewrite fast semantic mutation classifier/planner HTTP flows.
- Do not add a qwen/OpenAI feature flag; this PRD targets hard replacement.
- Do not change database schemas.
- Do not change user-facing UX unless required by agent response behavior.

## Runtime Requirements

### Dependencies

Update workspace dependencies:

- Add `@openai/agents`.
- Add `openai`.
- Upgrade/add `zod@^4` where OpenAI Agents JS tools require it.
- Remove `@qwen-code/sdk` from `packages/server` and `packages/mcp`.

OpenAI Agents JS currently requires Zod v4 as a peer dependency. Existing qwen/tool bridge code uses Zod v3-style imports, so the migration must ensure TypeScript compiles against Zod v4.

### Environment

Required:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional:

- `OPENAI_BASE_URL`, only if a custom OpenAI-compatible endpoint is intentionally used later.

Validation rules:

- `OPENAI_API_KEY` must be non-empty.
- `OPENAI_MODEL` must be non-empty.
- `OPENAI_MODEL` must not silently fall back to `glm-4.7`.
- `glm-*` or `qwen-*` model names should fail fast in the OpenAI Agents JS runtime path.

## Implementation Requirements

### Server Agent Runner

In `packages/server/src/agent.ts`:

- Replace qwen `query()` usage in `executeInitialGenerationPlannerQuery`.
- Replace qwen `query()` usage in `executeInitialGenerationRouteDecisionQuery`.
- Replace qwen `query()` usage in `executeAgentAttempt`.
- Use OpenAI Agents JS `Agent` and `run`.
- Configure the OpenAI client/provider from env.
- Preserve return shapes expected by the rest of the file:
  - `{ content: string }` for initial generation queries;
  - `AgentAttemptResult` for full-agent mutation attempts.

For full-agent mutation attempts:

- Preserve timeout behavior.
- Preserve assistant text extraction.
- Preserve tool call counting.
- Preserve mutation tool call collection.
- Preserve fallback collection from MCP debug logs if direct event parsing cannot fully map tool results.
- Preserve debug log events where practical:
  - `sdk_text_delta`;
  - `sdk_assistant_message`;
  - `sdk_result_message`;
  - `agent_attempt_metrics`;
  - `agent_attempt_failed`;
  - `agent_attempt_summary`.

Event payload shape may change, but downstream behavioral meaning must stay stable.

### Direct Tool Bridge

In `packages/server/src/agent/direct-tools.ts`:

- Replace imports from `@qwen-code/sdk`.
- Build OpenAI Agents JS function tools from `NORMALIZED_TOOL_CATALOG`.
- Convert existing JSON-schema-like tool definitions into Zod v4 schemas.
- Tool execution must still call:
  - `createToolContext`;
  - `executeToolCall`.
- Tool results must still encode accepted/rejected mutation details, including:
  - `status`;
  - `reason`;
  - `changedTaskIds`;
  - `changedTasks`;
  - `changedDependencyIds`;
  - `conflicts`.

Remove the qwen-specific embedded SDK MCP server wrapper.

If a subprocess MCP path remains necessary for the legacy CLI, use OpenAI Agents JS `MCPServerStdio`, not qwen.

### Split Task

In `packages/server/src/split-task.ts`:

- Replace qwen `query()` usage in `executeDirectSplitPlanningQuery`.
- Use OpenAI Agents JS for the planner request.
- Preserve strict JSON prompt behavior.
- Preserve existing `plannerQuery` injection for tests.
- Preserve existing parsing and execution path.

### Legacy MCP Agent CLI

In `packages/mcp/agent/agent.ts`:

- Either rewrite the CLI runner to OpenAI Agents JS, or remove the qwen dependency path if the CLI is no longer needed.
- If kept:
  - use `Agent`, `run`, and `MCPServerStdio`;
  - keep argument validation;
  - keep system prompt loading;
  - keep writing `tasks.json` for CLI output compatibility.

### Package Cleanup

After implementation:

- `rg "@qwen-code/sdk"` should not find runtime imports.
- package manifests should not list `@qwen-code/sdk`.
- lockfile should not retain it as a direct workspace dependency.

## Acceptance Criteria

- `@qwen-code/sdk` is removed from runtime code and package manifests.
- Server build succeeds.
- MCP build succeeds.
- Existing agent-facing flows still work:
  - empty project initial generation;
  - read-only chat;
  - ordinary mutation;
  - split task;
  - complex full-agent request using normalized tools.
- Agent mutation verification still detects changed task IDs and rejected tool calls.
- WebSocket chat completion still emits final `done`.
- Debug logs still include enough data to compare latency before and after migration.

## Test Plan

Run after implementation:

```bash
npm install
npm run build:server
npm run build:mcp
node --test packages/server/src/agent.test.ts packages/server/src/agent.direct-tools.test.ts packages/server/src/split-task.test.ts
```

Add or update tests for:

- OpenAI env validation;
- OpenAI tool definitions count and names matching `NORMALIZED_TOOL_CATALOG`;
- direct tool execution accepted/rejected result shape;
- split-task planner query adapter;
- initial generation query adapter;
- mutation attempt telemetry where practical without live API.

Live smoke tests require real OpenAI env:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Scenarios:

- Create an initial schedule in an empty project.
- Ask a read-only project question.
- Add or edit one task through chat.
- Split an existing task.
- Run a broad planning/mutation request that requires normalized tools.

## Risks

- OpenAI Agents JS event shapes differ from qwen SDK partial assistant events, so tool call detection and timing metrics need careful remapping.
- Zod v4 upgrade can affect TypeScript types in the direct tool bridge.
- OpenAI Agents JS default endpoint behavior may differ between Responses and Chat Completions; the implementation should explicitly choose the endpoint compatible with the selected tool strategy.
- CLI behavior may change if local MCP subprocess handling differs from qwen.

## Decisions

- Use OpenAI API as the target backend for the migration.
- Require `OPENAI_MODEL` instead of hardcoding a model.
- Do a hard replacement, not a feature-flagged dual runner.
- Keep direct HTTP semantic mutation classifier/planner paths unchanged unless shared env validation requires minimal alignment.
