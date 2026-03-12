# T06: 07-web-ui-with-real-time-gantt-editing-via-ai-dialogue 06

**Slice:** S07 — **Milestone:** M001

## Description

Create the CapRover deployment configuration for the complete application: a single Docker container running Nginx (static files + proxy) and Fastify (API + WS + AI agent).

Purpose: Make the application deployable to a VPS via CapRover with persistent SQLite storage. This is the final integration step that validates the full stack works end-to-end in a production-like environment.

Output:
- Dockerfile — multi-stage build producing Nginx+Node runtime image
- nginx.conf — serves React SPA, proxies /api and /ws to Fastify
- captain-definition — CapRover deployment descriptor
- .env.example — documents required environment variables

## Must-Haves

- [ ] "docker build succeeds and produces a runnable container image"
- [ ] "Container serves static web files via Nginx on port 80"
- [ ] "Container proxies /api and /ws to Fastify on :3000 internally"
- [ ] "SQLite DB persists at /data/gantt.db (CapRover Persistent Directory mountpoint)"
- [ ] "captain-definition file configures CapRover to build and deploy the container"
- [ ] ".env.example documents all required environment variables"

## Files

- `Dockerfile`
- `nginx.conf`
- `captain-definition`
- `.env.example`
- `packages/server/src/index.ts`
