# T01: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 01

**Slice:** S07 — **Milestone:** M001

## Description

Convert the existing single-package project into an npm workspaces monorepo with three packages: `@gantt/mcp`, `@gantt/server`, and `@gantt/web`.

Purpose: Establish the structural foundation for the web UI phase. All subsequent plans build on top of this scaffold.

Output:
- Root package.json with `"workspaces": ["packages/*"]`
- packages/mcp/ — TypeScript package containing the moved MCP server source
- packages/server/ — TypeScript package stub with Fastify + @libsql/client deps declared
- packages/web/ — React + Vite package stub with proxy config pointing to :3000
- All three packages compile/start without errors

## Must-Haves

- [ ] "npm install at root succeeds and resolves all workspace packages"
- [ ] "packages/mcp, packages/server, packages/web directories exist with valid package.json files"
- [ ] "npm run build:mcp compiles packages/mcp TypeScript without errors"
- [ ] "npm run dev:web launches Vite dev server on port 5173"
- [ ] "npm run dev:server starts the server package (even if stub) on port 3000"

## Files

- `package.json`
- `packages/mcp/package.json`
- `packages/mcp/tsconfig.json`
- `packages/server/package.json`
- `packages/server/tsconfig.json`
- `packages/web/package.json`
- `packages/web/tsconfig.json`
- `packages/web/vite.config.ts`
- `packages/web/index.html`
- `tsconfig.json`
- `.gitignore`
