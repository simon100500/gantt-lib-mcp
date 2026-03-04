---
phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue
plan: "06"
subsystem: infra
tags: [docker, nginx, caprover, sqlite, fastify, react, deployment]

# Dependency graph
requires:
  - phase: 07-03
    provides: Fastify server with WebSocket, REST API, and SQLite persistence
  - phase: 07-04
    provides: React Gantt chart component with dhtmlx-gantt
  - phase: 07-05
    provides: Chat sidebar and WebSocket integration in React app

provides:
  - Dockerfile: 3-stage multi-stage build (web + server+mcp + nginx/node runtime)
  - nginx.conf: Nginx serving React SPA, proxying /api and /ws to Fastify :3000
  - captain-definition: CapRover deployment descriptor pointing to Dockerfile
  - docker-entrypoint.sh: starts Fastify in background, Nginx in foreground
  - .env.example: documents required env vars (OPENAI_API_KEY, DB_PATH, PORT)
  - .dockerignore: excludes build artifacts and dev files from Docker context

affects:
  - production deployment

# Tech tracking
tech-stack:
  added:
    - nginx:1.27-alpine (runtime base image)
    - node:22-alpine (build stages)
  patterns:
    - multi-stage Docker build: separate web build and server build stages, minimal runtime image
    - docker-entrypoint.sh: Fastify background + Nginx foreground process management
    - GANTT_PROJECT_ROOT env var for container path override (avoids __dirname hardcoding)

key-files:
  created:
    - Dockerfile
    - nginx.conf
    - captain-definition
    - docker-entrypoint.sh
    - .dockerignore
  modified:
    - .env.example
    - packages/server/src/agent.ts

key-decisions:
  - "GANTT_PROJECT_ROOT/GANTT_MCP_SERVER_PATH/GANTT_MCP_PROMPTS_DIR env vars allow container path overrides without breaking dev workflow"
  - "MCP dist copied to both /app/mcp/dist and /app/packages/mcp/dist — satisfies npm workspace symlink AND direct env var path"
  - "npm workspaces hoist all deps to root node_modules; per-package node_modules not needed in runtime image"
  - "All workspace package.json files copied in each build stage so npm ci workspace validation passes"

patterns-established:
  - "Pattern 1: Path override env vars — GANTT_* env vars let docker-entrypoint.sh set correct paths without changing TypeScript code"
  - "Pattern 2: Workspace symlink awareness — copy packages/mcp to both direct and symlink-expected locations in runtime image"

requirements-completed: [WEB-06]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 07 Plan 06: CapRover Deployment Configuration Summary

**Multi-stage Docker build (React+Vite + Node/Fastify + Nginx) with CapRover captain-definition, SQLite persistent volume at /data/gantt.db, and Nginx proxying /api and /ws to Fastify :3000**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T10:41:44Z
- **Completed:** 2026-03-04T10:45:04Z
- **Tasks:** 1 (Task 2 is checkpoint:human-verify — awaiting manual verification)
- **Files modified:** 8

## Accomplishments

- Dockerfile builds the complete application in 3 stages: Stage 1 builds the React/Vite web app, Stage 2 compiles server+mcp TypeScript, Stage 3 is nginx:alpine + nodejs runtime serving both
- nginx.conf routes all traffic correctly: `/` serves React SPA with fallback to index.html, `/ws` proxies WebSocket with upgrade headers, `/api/` proxies REST to Fastify
- captain-definition enables one-click CapRover deployment via `dockerfilePath: ./Dockerfile`
- docker-entrypoint.sh starts Fastify on :3000 in background, then Nginx on :80 in foreground with SQLite at /data/gantt.db
- .env.example documents all required and optional configuration variables

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile, nginx.conf, captain-definition, .env.example, entrypoint** - `289db7b` (feat)

## Files Created/Modified

- `Dockerfile` - 3-stage multi-stage build: build-web (React+Vite), build-server (Node+TS), runtime (nginx:alpine + nodejs)
- `nginx.conf` - Nginx server block: SPA fallback, WS proxy with upgrade headers, /api/ proxy to localhost:3000
- `captain-definition` - CapRover schema v2 pointing to ./Dockerfile
- `docker-entrypoint.sh` - Shell script starting Fastify with container env vars, then Nginx foreground
- `.dockerignore` - Excludes node_modules, dist, .git, .planning from build context
- `.env.example` - Documents OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, DB_PATH, PORT
- `packages/server/src/agent.ts` - Added GANTT_PROJECT_ROOT, GANTT_MCP_SERVER_PATH, GANTT_MCP_PROMPTS_DIR env var overrides

## Decisions Made

- Added `GANTT_PROJECT_ROOT` env var support in `agent.ts` because the container path `/app` doesn't match the `../../..` relative resolution from `dist/agent.js`. Dev workflow unchanged (env var not set = falls back to relative path).
- Copied `packages/mcp/dist` to both `/app/mcp/dist` (direct reference by GANTT_MCP_SERVER_PATH) and `/app/packages/mcp/dist` (satisfies npm workspace symlink from `node_modules/@gantt/mcp`).
- npm workspaces hoist all dependencies to root `node_modules`; only root `node_modules` needs to be copied to runtime image, not per-package node_modules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed container path resolution for agent.ts PROJECT_ROOT**
- **Found during:** Task 1 (Dockerfile creation)
- **Issue:** `agent.ts` uses `join(__dirname, '../../..')` which resolves to `/` (root) when `dist/agent.js` is at `/app/server/dist/` in container, not the project root `/app`
- **Fix:** Added `GANTT_PROJECT_ROOT` env var with fallback to relative resolution; added `GANTT_MCP_SERVER_PATH` and `GANTT_MCP_PROMPTS_DIR` for other container paths; `docker-entrypoint.sh` sets all three vars
- **Files modified:** `packages/server/src/agent.ts`, `docker-entrypoint.sh`
- **Verification:** TypeScript builds clean (`npm run build:server` exits 0)
- **Committed in:** 289db7b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed npm workspace package.json requirement for npm ci**
- **Found during:** Task 1 (Dockerfile review)
- **Issue:** Each build stage only copied its needed package.json files, but `npm ci` with workspaces validates all workspace package.json files are present
- **Fix:** Each build stage copies all 3 workspace package.json files before running `npm ci`
- **Files modified:** `Dockerfile`
- **Verification:** Static analysis — workspace package.json presence matches lockfile expectation
- **Committed in:** 289db7b (Task 1 commit)

**3. [Rule 1 - Bug] Fixed npm workspace symlink in runtime image**
- **Found during:** Task 1 (Dockerfile review)
- **Issue:** `node_modules/@gantt/mcp` is a symlink pointing to `packages/mcp`; runtime image only had `/app/mcp/dist`, not `/app/packages/mcp/dist`, so symlink would be broken
- **Fix:** Copy mcp dist to both `/app/mcp/dist` AND `/app/packages/mcp/dist`; also copy `packages/mcp/package.json`
- **Files modified:** `Dockerfile`
- **Verification:** Static analysis — symlink resolution path matches copied directory
- **Committed in:** 289db7b (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs — container path resolution, workspace npm ci, workspace symlink)
**Impact on plan:** All auto-fixes necessary for container to function correctly. No scope creep.

## Issues Encountered

Docker Desktop was not running in this environment, so `docker build` verification was done via static analysis and local TypeScript compilation (`npm run build:mcp` and `npm run build:server` both exit 0 cleanly). Full Docker build verification is part of the human-verify checkpoint.

## User Setup Required

**To deploy to CapRover:**
1. Create CapRover app
2. Enable Persistent Directory at `/data`
3. Set environment variables: `OPENAI_API_KEY`, optionally `DB_PATH=/data/gantt.db`
4. Deploy via git push or upload repo ZIP

**To test locally:**
```bash
docker build -t gantt-web .
docker run -p 8080:80 \
  -e OPENAI_API_KEY=your-key \
  -e DB_PATH=/data/gantt.db \
  -v $(pwd)/local-data:/data \
  gantt-web
```
Then visit http://localhost:8080

## Next Phase Readiness

- Deployment configuration complete — all files present and TypeScript compiles clean
- Awaiting human verification: `docker build` success + end-to-end test (chat → AI → Gantt update → persist after restart)
- After checkpoint approval, the full phase 7 is complete

---
*Phase: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue*
*Completed: 2026-03-04*

## Self-Check: PASSED

All files present. Commit 289db7b verified in git log.
