---
id: T01
parent: S07
milestone: M001
provides:
  - npm workspaces monorepo with packages/mcp, packages/server, packages/web
  - "@gantt/mcp: TypeScript MCP server relocated from src/ to packages/mcp/src/"
  - "@gantt/server: Fastify stub on port 3000 with /health endpoint"
  - "@gantt/web: React + Vite app with proxy /api and /ws to localhost:3000"
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 25min
verification_result: passed
completed_at: 2026-03-04
blocker_discovered: false
---
# T01: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 01

**# Phase 07 Plan 01: Monorepo Scaffold Summary**

## What Happened

# Phase 07 Plan 01: Monorepo Scaffold Summary

**npm workspaces monorepo with @gantt/mcp (relocated MCP server), @gantt/server (Fastify stub), and @gantt/web (React + Vite with /api and /ws proxy to :3000)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-04T10:12:16Z
- **Completed:** 2026-03-04T10:37:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Converted single-package project to npm workspaces monorepo with packages/mcp, packages/server, packages/web
- @gantt/mcp compiles from packages/mcp/src/ with zero TypeScript errors (packages/mcp/dist/index.js exists)
- @gantt/server Fastify stub builds and starts on port 3000, /health endpoint returns {"status":"ok"}
- @gantt/web Vite config with proxy /api and /ws targeting localhost:3000

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo root and move MCP sources** - `273c680` (chore)
2. **Task 2: Scaffold server and web packages with stubs** - `68972fa` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified
- `package.json` - Root workspace config with npm workspaces and monorepo scripts
- `tsconfig.json` - Base config (no rootDir/outDir, each package owns its own)
- `.gitignore` - Added packages/*/dist/ and packages/*/node_modules/
- `packages/mcp/package.json` - @gantt/mcp package definition
- `packages/mcp/tsconfig.json` - MCP TypeScript config (rootDir: src, outDir: dist)
- `packages/mcp/src/*.ts` - All MCP source files (index, store, types, scheduler, config)
- `packages/mcp/agent/agent.ts` - Agent runner with updated path references for monorepo
- `packages/mcp/agent/agent.test.js` - Agent unit tests
- `packages/mcp/agent/prompts/system.md` - System prompt for agent
- `packages/server/package.json` - @gantt/server with Fastify + @libsql/client
- `packages/server/src/index.ts` - Fastify stub with /health endpoint
- `packages/web/package.json` - @gantt/web with React + Vite
- `packages/web/vite.config.ts` - Vite config with /api and /ws proxy to :3000
- `packages/web/index.html` - App entry point
- `packages/web/src/main.tsx` - React root mount
- `packages/web/src/App.tsx` - Stub component

## Decisions Made
- Used npm workspaces (native Node.js) rather than lerna or turborepo — three packages is simple enough
- Kept original src/ and agent/ directories in place per plan — to be removed after 07-02 validates migration
- Agent's PROJECT_ROOT in packages/mcp corresponds to packages/mcp/ (2 levels up from dist/agent/), MONOREPO_ROOT is 3 levels up for .env loading and tasks.json output
- @gantt/mcp listed as dependency in packages/server for future imports in 07-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed agent.ts PROJECT_ROOT and path references for monorepo**
- **Found during:** Task 1 (creating monorepo root and moving MCP sources)
- **Issue:** agent.ts used `join(__dirname, '../..')` with comment "project root". In new location `packages/mcp/dist/agent/`, this resolves to `packages/mcp/` (package root, not project root). .env loading and tasks.json output would have broken.
- **Fix:** Added MONOREPO_ROOT = `join(__dirname, '../../..')` for .env and tasks.json paths. Kept PROJECT_ROOT = `join(__dirname, '../..')` pointing to packages/mcp/ for the MCP server binary and system prompt (which are correct relative to package). Updated error message from `npm run build` to `npm run build:mcp`.
- **Files modified:** packages/mcp/agent/agent.ts
- **Verification:** Paths are logically correct — system.md at `packages/mcp/agent/prompts/system.md`, MCP server at `packages/mcp/dist/index.js`, .env at monorepo root
- **Committed in:** 273c680 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for agent path correctness in monorepo structure. No scope creep.

## Issues Encountered
- Port 3000 was already in use during verification test, tested on port 3001 instead — server started successfully, verification confirmed via Fastify startup log output

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo scaffold complete — all 3 packages compile and can be started
- 07-02 can now migrate MCP store to SQLite using @libsql/client in packages/mcp
- Original src/ and agent/ directories preserved until 07-02 validates
- packages/server has @gantt/mcp dependency ready for 07-03 server implementation

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*
