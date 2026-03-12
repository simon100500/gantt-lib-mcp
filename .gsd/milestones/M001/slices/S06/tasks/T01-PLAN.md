# T01: 06-qwen-agent 01

**Slice:** S06 — **Milestone:** M001

## Description

Create the Wave 0 scaffold for the qwen-agent: unit test file (failing tests that define expected behaviors), system prompt Markdown file, and a TypeScript compiler config for the agent directory.

Purpose: Establish test contracts before implementation so AGENT-01, AGENT-02, and AGENT-06 are red before writing agent.ts. This is the Nyquist Wave 0 requirement — test stubs must exist before implementation tasks run.
Output: agent/agent.test.js (3 failing unit tests), agent/prompts/system.md, agent/tsconfig.json

## Must-Haves

- [ ] "Running node --test agent/agent.test.js exits 0 with 3 passing unit tests"
- [ ] "agent/prompts/system.md exists and contains Gantt planning instructions"
- [ ] "agent/tsconfig.json compiles agent/agent.ts to dist/agent/agent.js"

## Files

- `agent/agent.test.js`
- `agent/prompts/system.md`
- `agent/tsconfig.json`
