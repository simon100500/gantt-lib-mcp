# S06: Qwen Agent

**Goal:** Create the Wave 0 scaffold for the qwen-agent: unit test file (failing tests that define expected behaviors), system prompt Markdown file, and a TypeScript compiler config for the agent directory.
**Demo:** Create the Wave 0 scaffold for the qwen-agent: unit test file (failing tests that define expected behaviors), system prompt Markdown file, and a TypeScript compiler config for the agent directory.

## Must-Haves


## Tasks

- [x] **T01: 06-qwen-agent 01**
  - Create the Wave 0 scaffold for the qwen-agent: unit test file (failing tests that define expected behaviors), system prompt Markdown file, and a TypeScript compiler config for the agent directory.

Purpose: Establish test contracts before implementation so AGENT-01, AGENT-02, and AGENT-06 are red before writing agent.ts. This is the Nyquist Wave 0 requirement — test stubs must exist before implementation tasks run.
Output: agent/agent.test.js (3 failing unit tests), agent/prompts/system.md, agent/tsconfig.json
- [x] **T02: 06-qwen-agent 02** `est:12min`
  - Implement `agent/agent.ts` — the CLI entry point that uses `@qwen-code/sdk` to run a Gantt chart generation agent. The agent accepts a project description as a CLI argument, runs a qwen-code session with the gantt MCP server as tool provider, streams assistant output to stdout, and writes the resulting tasks.json to disk.

Purpose: This is the main deliverable of Phase 6. The agent bridges the @qwen-code/sdk with the existing MCP server, enabling AI-driven Gantt chart generation from a plain text description.
Output: agent/agent.ts (source), dist/agent/agent.js (compiled), tasks.json (runtime output)

## Files Likely Touched

- `agent/agent.test.js`
- `agent/prompts/system.md`
- `agent/tsconfig.json`
- `agent/agent.ts`
