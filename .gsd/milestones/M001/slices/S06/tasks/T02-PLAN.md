# T02: 06-qwen-agent 02

**Slice:** S06 — **Milestone:** M001

## Description

Implement `agent/agent.ts` — the CLI entry point that uses `@qwen-code/sdk` to run a Gantt chart generation agent. The agent accepts a project description as a CLI argument, runs a qwen-code session with the gantt MCP server as tool provider, streams assistant output to stdout, and writes the resulting tasks.json to disk.

Purpose: This is the main deliverable of Phase 6. The agent bridges the @qwen-code/sdk with the existing MCP server, enabling AI-driven Gantt chart generation from a plain text description.
Output: agent/agent.ts (source), dist/agent/agent.js (compiled), tasks.json (runtime output)

## Must-Haves

- [ ] "node --test agent/agent.test.js passes all 3 unit tests (AGENT-01, AGENT-02, AGENT-06)"
- [ ] "npm run build:agent compiles agent/agent.ts to dist/agent/agent.js without errors"
- [ ] "node dist/agent/agent.js with no args exits code 1 and prints Usage message"
- [ ] "node dist/agent/agent.js 'build a 3-story building' runs, connects to MCP server, writes tasks.json"

## Files

- `agent/agent.ts`
