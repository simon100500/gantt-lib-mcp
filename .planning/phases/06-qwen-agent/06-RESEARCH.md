# Phase 6: qwen-agent - Research

**Researched:** 2026-03-04
**Domain:** @qwen-code/sdk + TypeScript agent + MCP stdio subprocess + Z.AI/GLM-4.7 custom endpoint
**Confidence:** MEDIUM — SDK is young (v0.1.4), docs are sparse, env-variable behavior changed at v0.1.0

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `@qwen-code/sdk` (TypeScript, npm package) — not the Python qwen-agent library
- SDK `query(config)` function as the agent entry point
- Model: qwen-max or qwen-plus via config (validate Z.AI GLM-4.7 compatibility)
- `permissionMode: 'yolo'` — all tools execute without confirmation
- MCP integration via `mcpServers` parameter in `query()` config
- MCP server config: `{ command: "node", args: ["dist/index.js"] }` — stdio subprocess
- Agent calls `import_tasks` with empty array at session start to clear state
- CLI interface: `node agent.js "project description"` (or via ts-node)
- Output: tasks.json on disk (from `export_tasks` or `get_tasks` result) + stdout progress
- System prompt stored in `agent/prompts/system.md` (editable without code changes)
- New `agent/` directory in repo root
- Reads root `.env` for API keys

### Claude's Discretion
- CLI argument parsing format (process.argv vs minimist)
- Output filename (output.json vs tasks.json)
- Error handling when MCP server fails to start
- `maxSessionTurns` value

### Deferred Ideas (OUT OF SCOPE)
- HTTP API (Express/Fastify) for SaaS
- VPS deploy + multi-user access
- Web UI for prompt input and Gantt display
- Real-time streaming of agent responses
- Migrating to Python if @qwen-code/sdk proves incompatible
</user_constraints>

---

## Summary

`@qwen-code/sdk` (version 0.1.4) is a TypeScript SDK wrapping the Qwen Code CLI as a subprocess. The `query()` function accepts a config object and returns an async iterable of typed messages. MCP servers — including our existing `dist/index.js` stdio server — are supported natively via the `mcpServers` parameter with `{ command, args }` shape.

**The critical Z.AI compatibility question** has a clear answer: the SDK uses `authType: 'openai'` to talk to any OpenAI-compatible endpoint. Z.AI provides an OpenAI-compatible endpoint at `https://api.z.ai/api/paas/v4/`. The GLM Coding Plan uses a separate endpoint `https://api.z.ai/api/coding/paas/v4`. Configure via `~/.qwen/settings.json` (global) or by passing `env` option in `query()` which merges into the subprocess environment.

**Important caveat:** Environment variable handling changed at v0.1.0. `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` are **ignored** when `authType` is `qwen-oauth`. They only take effect when `authType: 'openai'` is active. The `env` option in `query()` passes variables directly to the subprocess, which should allow programmatic configuration without requiring a global `~/.qwen/settings.json`.

**Primary recommendation:** Use `authType: 'openai'` + `env` option to pass `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` directly from the project `.env` file, targeting Z.AI's OpenAI-compatible endpoint. This avoids requiring global user-level config.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@qwen-code/sdk` | 0.1.4 | Agent framework — wraps Qwen Code CLI, provides `query()` | Locked decision; project is TypeScript |
| `dotenv` | ^17.3.1 | Load `.env` for API keys | Already in project deps |
| Node.js | >=18.0.0 | Runtime (SDK requirement; project uses >=20 already) | Already established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fs/promises` | built-in | Write `tasks.json` to disk | Final output step |
| `process.argv` | built-in | Parse CLI argument `"project description"` | Simpler than minimist for single arg |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `process.argv` | `minimist` / `yargs` | Overkill — single positional arg needed |
| Z.AI OpenAI endpoint | Z.AI Anthropic endpoint (`api.z.ai/api/anthropic`) | GLM-4.7 works on both; OpenAI endpoint avoids Anthropic SDK dependency |
| `~/.qwen/settings.json` | `env` option in `query()` | settings.json is global (bad for CI/projects); `env` option is project-scoped |

**Installation:**
```bash
npm install @qwen-code/sdk
```
Node.js >=18.0.0 required (project already uses Node.js 20+, no issue).

---

## Architecture Patterns

### Recommended Project Structure
```
agent/
├── agent.ts            # CLI entry point — main script
└── prompts/
    └── system.md       # System prompt (editable, no code changes needed)
```

No separate tsconfig needed for `agent/` if the root `tsconfig.json` includes it, OR run with `ts-node` / compile separately. The simplest approach: add `agent` to `rootDir` or use a wrapper tsconfig that extends root.

**Complication:** Root `tsconfig.json` has `"rootDir": "./src"` and `"outDir": "./dist"`. For `agent/`, options are:
1. Add a `agent/tsconfig.json` extending root config with adjusted `rootDir`/`outDir`
2. Compile `agent.ts` with `tsc --outDir dist/agent agent/agent.ts`
3. Run directly with `npx ts-node --esm agent/agent.ts` (no compile needed for dev)

Recommended: Use ts-node for simplicity. The agent is a script, not a library. If distribution is needed, compile separately.

### Pattern 1: query() Basic Usage
**What:** Call `query()` with config, iterate async messages, extract final result.
**When to use:** Every agent invocation.

```typescript
// Source: https://github.com/QwenLM/qwen-code/blob/main/packages/sdk-typescript/README.md
import { query, isSDKResultMessage, isSDKAssistantMessage } from '@qwen-code/sdk';
import * as dotenv from 'dotenv';

dotenv.config(); // loads .env from cwd (project root)

const session = query({
  prompt: userPrompt,
  model: process.env.OPENAI_MODEL ?? 'glm-4.7',
  cwd: process.cwd(),
  permissionMode: 'yolo',
  authType: 'openai',
  env: {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'glm-4.7',
  },
  mcpServers: {
    gantt: {
      command: 'node',
      args: ['dist/index.js'],
    },
  },
  maxSessionTurns: 20,
});

for await (const message of session) {
  if (isSDKAssistantMessage(message)) {
    // Print progress
    for (const block of message.content) {
      if (block.type === 'text') process.stdout.write(block.text);
    }
  }
  if (isSDKResultMessage(message)) {
    // Session complete — result available
    console.log('\n[Agent complete]');
  }
}
```

### Pattern 2: MCP stdio Subprocess Configuration
**What:** Register the existing MCP server as subprocess child process.
**When to use:** Always — the gantt MCP server is the agent's tool provider.

```typescript
// Source: CONTEXT.md / @qwen-code/sdk README
mcpServers: {
  gantt: {
    command: 'node',
    args: ['dist/index.js'],   // path relative to cwd
    // cwd defaults to query() cwd option (project root)
  }
}
```

The SDK spawns `node dist/index.js` as a child process using stdio transport. The MCP server must be compiled (`npm run build`) before the agent runs.

### Pattern 3: Z.AI OpenAI-Compatible Endpoint
**What:** Configure the SDK to use Z.AI's OpenAI-compatible endpoint instead of default Qwen cloud.
**When to use:** Always in this project — credentials come from project `.env`.

```typescript
// Z.AI OpenAI-compatible endpoint (general API)
OPENAI_BASE_URL = 'https://api.z.ai/api/paas/v4/'
// Z.AI Coding Plan endpoint (if user has Coding Plan subscription)
// OPENAI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'
OPENAI_API_KEY  = '<Z.AI API key>'
OPENAI_MODEL    = 'glm-4.7'   // or model name per Z.AI docs
```

Pass these via `env` option in `query()`. The `authType: 'openai'` ensures the SDK reads `OPENAI_*` variables instead of using Qwen OAuth.

### Pattern 4: State Reset at Session Start
**What:** Call `import_tasks` with empty array before generating — ensures clean state.
**When to use:** Start of every agent run.

Include in system prompt:
```
Before creating any tasks, call import_tasks with jsonData='[]' to clear existing state.
```

OR add a multi-turn prompt that first sends the clear command, then the user prompt. The `prompt` parameter accepts `AsyncIterable<SDKUserMessage>` for multi-turn.

### Pattern 5: Extracting Final JSON Output
**What:** After agent session completes, retrieve tasks via `export_tasks` MCP tool.
**When to use:** At session end — write tasks.json to disk.

The agent's system prompt should instruct it to call `export_tasks` as the last step and output the JSON. The agent script then captures this from message content and writes it to `tasks.json`.

Alternative: watch for `isSDKResultMessage` and extract the result content if the agent returns the JSON in its final message.

### Anti-Patterns to Avoid
- **Using `qwen-oauth` authType with custom endpoints:** This ignores `OPENAI_*` env vars. Always use `authType: 'openai'` for custom base URLs.
- **Relying on global `~/.qwen/settings.json`:** The project should be self-contained. Pass credentials via `env` option.
- **Running agent before MCP server is compiled:** `node dist/index.js` fails if `dist/` is stale. Add build step or check.
- **Omitting `cwd` from MCP config:** Without it, relative paths like `dist/index.js` resolve from the subprocess cwd, not the project root. Set `cwd: process.cwd()` in the `query()` call.
- **Not handling `import_tasks` at session start:** The MCP server is stateful in-memory. Without clearing, previous runs' data persists in the same process (though each `node dist/index.js` spawn is fresh, so this is not an issue for subprocess mode — the child process starts fresh each time).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent loop (LLM + tool calls) | Custom agentic loop | `@qwen-code/sdk query()` | Handles tool execution, retries, permission modes, MCP protocol |
| MCP protocol parsing | Custom stdio MCP client | SDK's built-in `mcpServers` param | Protocol is complex; SDK handles handshake, tool discovery, result parsing |
| .env loading | Manual file reading | `dotenv.config()` | Already a dependency; handles escaping, comments, multiline |
| TypeScript execution | Custom build pipeline | `ts-node --esm` or existing `tsc` | Project already has tsc configured |

**Key insight:** The SDK abstracts the entire agentic loop including tool calling. Do not build retry logic, tool dispatch, or MCP communication — the SDK handles all of it via `permissionMode: 'yolo'`.

---

## Common Pitfalls

### Pitfall 1: authType Mismatch — Environment Variables Ignored
**What goes wrong:** Agent talks to Qwen OAuth cloud, ignores `OPENAI_BASE_URL` and Z.AI credentials.
**Why it happens:** Default `authType` may be `qwen-oauth` if `~/.qwen/settings.json` has `selectedType: qwen-oauth`. The SDK ignores `OPENAI_*` env vars in that mode.
**How to avoid:** Explicitly set `authType: 'openai'` in the `query()` config AND pass all `OPENAI_*` vars via `env` option.
**Warning signs:** Agent works but calls Qwen Cloud instead of GLM; `401` errors from wrong auth; ignoring the local `.env`.

### Pitfall 2: MCP Server Not Compiled
**What goes wrong:** Agent starts, SDK tries to spawn `node dist/index.js`, fails with `ENOENT` or module not found.
**Why it happens:** The TypeScript source hasn't been compiled to `dist/`.
**How to avoid:** Add `npm run build` check or build step in agent startup. Document in README that `npm run build` is a prerequisite.
**Warning signs:** MCP server spawn fails immediately; no tools available to the agent.

### Pitfall 3: Z.AI Endpoint Version Confusion
**What goes wrong:** `404` errors from Z.AI API calls.
**Why it happens:** Z.AI has multiple endpoints — general API (`/api/paas/v4/`) vs Coding Plan (`/api/coding/paas/v4`). The Coding Plan endpoint is only for users with that subscription. Also, the Anthropic-compatible endpoint (`/api/anthropic`) requires different auth headers.
**How to avoid:** Use the OpenAI-compatible general endpoint `/api/paas/v4/` by default. Let users override via `.env`. Document which Z.AI plan is required.
**Warning signs:** `404 Not Found` or `403 Forbidden` on first API call.

### Pitfall 4: SDK Version / CLI Bundle Mismatch
**What goes wrong:** SDK cannot find the Qwen Code CLI executable.
**Why it happens:** Pre-v0.1.1, SDK required separate CLI install. From v0.1.1+, CLI is bundled. If user has stale global install, path resolution may conflict.
**How to avoid:** Use SDK v0.1.4 which bundles the CLI. Don't require global `npm install -g @qwen-code/qwen-code`.
**Warning signs:** Error about missing `qwen` executable or `pathToQwenExecutable`.

### Pitfall 5: ESM / CommonJS Module Conflict
**What goes wrong:** `import` syntax errors or `require` not defined.
**Why it happens:** Project uses `"type": "module"` (ESM). `@qwen-code/sdk` v0.1.4 supports both CJS and ESM. However, `ts-node` with ESM requires `--esm` flag and `"module": "nodenext"` in tsconfig.
**How to avoid:** Use `NODE_OPTIONS='--experimental-specifier-resolution=node' ts-node --esm` or compile with `tsc` then run with `node`. The existing project tsconfig (`"module": "nodenext"`) is compatible.
**Warning signs:** `SyntaxError: Cannot use import statement` or `ERR_REQUIRE_ESM`.

### Pitfall 6: Subprocess cwd and MCP Server Path
**What goes wrong:** MCP server subprocess cannot find `dist/index.js`.
**Why it happens:** The MCP server is launched relative to the `cwd` passed to `query()`. If the agent is invoked from a different directory, the path breaks.
**How to avoid:** Always set `cwd: process.cwd()` in the `query()` call (or use `__dirname` / `import.meta.url` to compute the project root). Document: "Run agent from project root."
**Warning signs:** MCP spawn fails; tools not available; agent says it has no tools.

---

## Code Examples

### Complete Agent Script Structure
```typescript
// Source: CONTEXT.md decisions + @qwen-code/sdk README + research synthesis
// agent/agent.ts
import { query, isSDKResultMessage, isSDKAssistantMessage } from '@qwen-code/sdk';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

dotenv.config(); // loads project root .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Read system prompt from file
const systemPrompt = readFileSync(
  join(PROJECT_ROOT, 'agent/prompts/system.md'),
  'utf-8'
);

// Get prompt from CLI args
const userPrompt = process.argv[2];
if (!userPrompt) {
  console.error('Usage: node agent.js "project description"');
  process.exit(1);
}

// Run agent
const session = query({
  prompt: `${systemPrompt}\n\nUser request: ${userPrompt}`,
  model: process.env.OPENAI_MODEL ?? 'glm-4.7',
  cwd: PROJECT_ROOT,
  permissionMode: 'yolo',
  authType: 'openai',
  env: {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
    OPENAI_API_KEY:  process.env.OPENAI_API_KEY  ?? '',
    OPENAI_MODEL:    process.env.OPENAI_MODEL    ?? 'glm-4.7',
  },
  mcpServers: {
    gantt: {
      command: 'node',
      args: [join(PROJECT_ROOT, 'dist/index.js')],
    },
  },
  maxSessionTurns: 30,
});

let finalJson: string | null = null;

for await (const message of session) {
  if (isSDKAssistantMessage(message)) {
    for (const block of message.content) {
      if (block.type === 'text') process.stdout.write(block.text + '\n');
    }
  }
  if (isSDKResultMessage(message)) {
    // Extract final result if present
    finalJson = message.result ?? null;
  }
}

// Write output
const outputPath = join(PROJECT_ROOT, 'tasks.json');
if (finalJson) {
  await writeFile(outputPath, finalJson, 'utf-8');
  console.log(`\nOutput written to ${outputPath}`);
} else {
  console.warn('\nNo JSON output captured from agent session');
}
```

### settings.json for Z.AI (alternative to env option)
```json
// ~/.qwen/settings.json — global config (not project-scoped)
{
  "modelProviders": {
    "openai": [
      {
        "id": "glm-4.7",
        "name": "GLM-4.7 (Z.AI)",
        "baseUrl": "https://api.z.ai/api/paas/v4/",
        "envKey": "OPENAI_API_KEY"
      }
    ]
  },
  "env": {
    "OPENAI_API_KEY": "your-z-ai-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "glm-4.7"
  }
}
```
Note: The `env` option in `query()` is preferred over this global file for project portability.

### System Prompt Template
```markdown
<!-- agent/prompts/system.md -->
You are a Gantt chart project planning expert. You create detailed, realistic project schedules.

## Your Task
When given a project description, you will:
1. Call `import_tasks` with jsonData='[]' to clear any existing tasks
2. Analyze the project and identify all major tasks and milestones
3. Create tasks with realistic durations and dependencies using the MCP tools
4. Use `create_tasks_batch` for repetitive work patterns (floors, sections, phases)
5. Use `create_task` for individual unique tasks
6. Set up proper FS (Finish-Start) dependencies between sequential tasks
7. Call `export_tasks` as the final step and output the complete JSON

## Date Guidelines
- Use today's date as the project start unless specified otherwise
- Dates must be in YYYY-MM-DD format
- All tasks must have startDate <= endDate

## Output
End your session by calling `export_tasks` and presenting the JSON result.
```

### Message Type Guards
```typescript
// Source: @qwen-code/sdk README
import {
  isSDKResultMessage,
  isSDKAssistantMessage,
  isSDKUserMessage,
  isSDKSystemMessage,
} from '@qwen-code/sdk';

for await (const msg of session) {
  if (isSDKSystemMessage(msg))    { /* session metadata */ }
  if (isSDKUserMessage(msg))      { /* echoed user input */ }
  if (isSDKAssistantMessage(msg)) { /* LLM output + tool calls */ }
  if (isSDKResultMessage(msg))    { /* final result, session ends */ }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `OPENAI_API_KEY` env var global | `env` option in `query()` + `authType: 'openai'` | v0.1.0 | Must explicitly set authType; env vars ignored under qwen-oauth |
| Separate CLI install required | CLI bundled in SDK | v0.1.1 | No global install needed; SDK self-contained |
| qwen-oauth only | openai / qwen-oauth / gemini / anthropic | 2025-2026 | Multi-provider support; Z.AI works via openai auth type |

**Deprecated/outdated:**
- Setting `OPENAI_BASE_URL` globally via shell: Still works for CLI usage, but SDK programmatic API prefers the `env` option for project isolation.
- `pathToQwenExecutable` manual config: Not needed from v0.1.1 since CLI is bundled.

---

## Open Questions

1. **Does `env` option in `query()` actually override subprocess environment for OpenAI auth?**
   - What we know: The `env` parameter in `QueryOptions` is documented as `Record<string, string>` passed to subprocess. The source shows it forwarded to `ProcessTransport`.
   - What's unclear: Whether `ProcessTransport` *merges* with `process.env` or *replaces* it. If replacement, other env vars (like PATH) are lost.
   - Recommendation: Test empirically. If issues arise, fall back to setting env vars before calling `query()` via `process.env.OPENAI_BASE_URL = ...` before invocation.

2. **GLM-4.7 model name on Z.AI's OpenAI endpoint**
   - What we know: Z.AI documents GLM-5, GLM-4.6V in quick-start. GLM-4.7 is referenced in the Claude Code Z.AI integration docs.
   - What's unclear: Exact model identifier string to pass (`"glm-4.7"` vs `"GLM-4.7"` vs another alias).
   - Recommendation: Read `.env` value at runtime (`OPENAI_MODEL`). Let user configure. Default to `"glm-4.7"` based on CONTEXT.md and test.

3. **Does `authType: 'openai'` in `query()` take priority over global `~/.qwen/settings.json`?**
   - What we know: The `authType` option is documented and explicitly passed to the subprocess.
   - What's unclear: Precedence when `~/.qwen/settings.json` has `selectedType: qwen-oauth`.
   - Recommendation: First agent run should validate Z.AI connectivity early. If auth fails, check global settings.

4. **How to extract final JSON from the agent**
   - What we know: `isSDKResultMessage(msg)` gives the session's final result. The agent can also output text with the JSON.
   - What's unclear: Format of `msg.result` — is it raw string? object?
   - Recommendation: Instruct agent (via system prompt) to call `export_tasks` last and output raw JSON. Capture all text output from assistant messages and parse the last valid JSON block.

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` → treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (already used in this project) |
| Config file | None — inline `node --test` |
| Quick run command | `node --test agent/agent.test.js` |
| Full suite command | `npm test && node --test agent/agent.test.js` |

### Phase Requirements → Test Map

Phase 6 has no formal requirement IDs. Requirements come from CONTEXT.md decisions:

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| AGENT-01 | CLI rejects missing prompt arg | unit | `node --test agent/agent.test.js` | ❌ Wave 0 |
| AGENT-02 | agent.ts imports and calls query() without crashing | smoke | `node --test agent/agent.test.js` | ❌ Wave 0 |
| AGENT-03 | MCP server connection (dist/index.js spawns) | integration | manual: `node dist/agent/agent.js "build a house"` | N/A |
| AGENT-04 | Z.AI endpoint responds with valid completion | integration | manual: run agent with real .env | N/A |
| AGENT-05 | tasks.json written to disk after session | integration | manual: check file exists after run | N/A |
| AGENT-06 | System prompt loads from agent/prompts/system.md | unit | `node --test agent/agent.test.js` | ❌ Wave 0 |

Unit-testable behaviors (AGENT-01, AGENT-02, AGENT-06) can be automated. Integration tests (AGENT-03 through AGENT-05) require live Z.AI credentials and are manual-only — they cannot run without real API key and network.

### Sampling Rate
- **Per task commit:** `node --test agent/agent.test.js` (unit tests, no API key needed)
- **Per wave merge:** Unit tests + manual smoke test with real `.env`
- **Phase gate:** Manual end-to-end run: `node dist/agent/agent.js "construct a 5-story building"` → verify `tasks.json` contains valid Gantt JSON

### Wave 0 Gaps
- [ ] `agent/agent.test.js` — unit tests for AGENT-01, AGENT-02, AGENT-06
- [ ] `agent/prompts/system.md` — system prompt file (created in Wave 0 or task 1)
- [ ] `agent/agent.ts` — main implementation (created in task 1)

*(No test framework install needed — Node.js built-in test runner already established in this project.)*

---

## Sources

### Primary (HIGH confidence)
- [@qwen-code/sdk README](https://github.com/QwenLM/qwen-code/blob/main/packages/sdk-typescript/README.md) — query() API, QueryOptions, MCP config, message types
- [@qwen-code/sdk types.ts](https://raw.githubusercontent.com/QwenLM/qwen-code/main/packages/sdk-typescript/src/types/types.ts) — QueryOptions interface, McpServerConfig union type, `env` option, `authType`
- [Qwen Code Auth Configuration Docs](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/) — settings.json structure, openai authType, modelProviders, baseUrl config

### Secondary (MEDIUM confidence)
- [GitHub Issue #891 — OpenAI API env vars ignored](https://github.com/QwenLM/qwen-code/issues/891) — confirms OPENAI_* vars ignored under qwen-oauth; fix: switch to openai authType
- [GitHub Issue #599 — env and .env ignored](https://github.com/QwenLM/qwen-code/issues/599) — auth type must be openai, not qwen-oauth, for custom endpoints
- [Z.AI Quick Start](https://docs.z.ai/guides/overview/quick-start) — OpenAI-compatible endpoint URL, Coding Plan endpoint distinction
- [Z.AI Claude Code docs](https://docs.z.ai/devpack/tool/claude) — ANTHROPIC_BASE_URL and model mapping for Z.AI; GLM-4.7 confirmed as Opus/Sonnet tier
- [Together AI + qwen-code guide](https://docs.together.ai/docs/how-to-use-qwen-code) — confirms OPENAI_BASE_URL pattern for custom providers

### Tertiary (LOW confidence — verify empirically)
- [Qwen Code Settings Docs](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/) — settings.json `env` field and priority order (unverified if `env` option in query() overrides ~/.qwen/settings.json)
- Search synthesis on `env` option subprocess behavior — whether it merges or replaces process.env (unverified without source inspection)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK package name, version, installation confirmed from package.json source
- Architecture (query() pattern): MEDIUM — API confirmed from README and types.ts; actual subprocess env merging behavior unverified
- Z.AI endpoint compatibility: MEDIUM — Z.AI OpenAI endpoint confirmed; GLM-4.7 model name needs empirical test
- Pitfalls: HIGH — authType mismatch and env-var-ignored pitfall confirmed by two GitHub issues

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (SDK is actively developed; check for breaking changes in @qwen-code/sdk changelog)
