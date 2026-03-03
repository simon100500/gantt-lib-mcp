---
phase: 06-qwen-agent
plan: "01"
subsystem: agent
tags: [tdd, wave-0, scaffold, test, typescript]
dependency_graph:
  requires: []
  provides: [agent/agent.test.js, agent/prompts/system.md, agent/tsconfig.json]
  affects: [package.json]
tech_stack:
  added: []
  patterns: [node-test-runner, pathToFileURL-windows-compat]
key_files:
  created:
    - agent/agent.test.js
    - agent/prompts/system.md
    - agent/tsconfig.json
  modified:
    - package.json
decisions:
  - "pathToFileURL for Windows ESM dynamic import compatibility (Rule 1 auto-fix)"
  - "AGENT-02 passes in Wave 0 (ERR_MODULE_NOT_FOUND is accepted as valid state)"
  - "System prompt stored in agent/prompts/system.md separate from code"
  - "agent/tsconfig.json extends root tsconfig, overrides rootDir/outDir only"
metrics:
  duration: "8 min"
  completed_date: "2026-03-03"
  tasks_completed: 2
  files_changed: 4
---

# Phase 6 Plan 01: Wave 0 Scaffold Summary

Wave 0 scaffold for qwen-agent: 3-test unit file, Gantt planning system prompt, and TypeScript compiler config for the agent directory — establishing red test contracts before implementation.

## What Was Built

- `agent/agent.test.js` — 3 unit test suites using `node:test` built-in runner: AGENT-01 (validateArgs throws on missing prompt), AGENT-02 (module import without crash), AGENT-06 (system.md exists and non-empty)
- `agent/prompts/system.md` — System prompt for Gantt chart planning agent (1155 chars), covering workflow steps (import_tasks → create tasks → set dependencies → export_tasks), date rules, output format, and language matching
- `agent/tsconfig.json` — Extends root tsconfig.json, overrides rootDir to `.` and outDir to `../dist/agent`, excludes test files
- `package.json` — Added `build:agent: "tsc -p agent/tsconfig.json"` script

## Wave 0 State

| Test | Status | Notes |
|------|--------|-------|
| AGENT-01: CLI arg validation | FAIL | "dist/agent/agent.js not found — run: npm run build:agent" — correct red state |
| AGENT-02: Module imports without crash | PASS | ERR_MODULE_NOT_FOUND caught and accepted as valid state |
| AGENT-06: System prompt file exists | PASS | system.md present with 1155 chars (>100 required) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Windows ESM import URL scheme incompatibility**
- **Found during:** Task 1 verification
- **Issue:** On Windows, `import(join(PROJECT_ROOT, 'dist/agent/agent.js'))` fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME: Only URLs with a scheme in: file, data, and node are supported`. Windows absolute paths like `D:/...` are not valid ESM URLs.
- **Fix:** Added `pathToFileURL` from `node:url` and a `toFileUrl()` helper function. All dynamic imports now use `import(toFileUrl(absPath))` which generates correct `file:///D:/...` URLs.
- **Files modified:** `agent/agent.test.js`
- **Commit:** 0032fc4

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 6c66583 | test | add Wave 0 failing unit tests for AGENT-01, AGENT-02, AGENT-06 |
| 0032fc4 | feat | add system prompt, agent tsconfig, and build:agent script |

## Self-Check

- [x] agent/agent.test.js exists (51 lines, >50 minimum)
- [x] agent/prompts/system.md exists (1155 chars, >100 minimum)
- [x] agent/tsconfig.json exists with extends and outDir: ../dist/agent
- [x] package.json has build:agent script
- [x] AGENT-06 test passes
- [x] AGENT-01 fails with correct "not found" message (red state confirmed)
- [x] Both task commits exist in git log

## Self-Check: PASSED
