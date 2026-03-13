---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: PostgreSQL Migration
status: not_started
last_updated: "2026-03-13T00:00:00.000Z"
last_activity: "2026-03-13 - Milestone v2.0 started"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE: gantt-lib MCP Server

**Last updated:** 2026-03-13

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** AI может программно управлять диаграммами Ганта: создавать задачи, устанавливать зависимости и автоматически пересчитывать сроки при изменениях.

**Current focus:** PostgreSQL migration for production scaling

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-13 — Milestone v2.0 started

## Accumulated Context

### v1.0 Accomplishments (Building On)

**Status:** ✅ MVP Complete (2026-03-13)

**Tech Stack:**
- Monorepo (npm workspaces): packages/mcp, packages/server, packages/web
- MCP Server: @modelcontextprotocol/sdk with stdio transport
- Web Server: Fastify + WebSocket + SQLite (@libsql/client)
- Frontend: React + Vite + gantt-lib (drag-to-edit)
- Auth: OTP email + JWT tokens
- Deployment: Docker multi-stage build + Nginx + CapRover

**Features Shipped:**
- ✅ MCP tool API (create_task, update_task, delete_task, batch_create)
- ✅ Auto-schedule engine with FS/SS/FF/SF dependencies
- ✅ AI chat interface with streaming responses
- ✅ Interactive drag-to-edit Gantt chart
- ✅ Multi-user project isolation
- ✅ OTP email authentication
- ✅ Real-time WebSocket sync
- ✅ SQLite persistence
- ✅ Production Docker deployment

**Database Schema (v1.0):**
- users (id, email, created_at)
- projects (id, name, user_id, created_at)
- sessions (id, user_id, project_id, access_token, refresh_token, expires_at)
- otp_codes (id, email, code, expires_at)
- tasks (id, project_id, title, start, end, progress, order, parent_id)
- dependencies (id, project_id, from_id, to_id, type)
- messages (id, project_id, role, content, created_at)

**Known Decisions to Reference:**
- TypeScript types for auth (User, Project, Session, OtpEntry, AuthToken) exported from @gantt/mcp/types
- Foreign key constraints with CASCADE delete for automatic cleanup
- 15-minute access token expiry, 7-day refresh token expiry
- Fail fast if JWT_SECRET env var missing

### Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | TypeScript over Python | gantt-lib ecosystem compatibility |
| 2026-03-13 | PostgreSQL migration (v2.0) | Production scaling for multiple concurrent users |

### Blockers

None

---

## Session Continuity

### Previous Milestone Summary

v1.0 MVP complete with 14 phases, 178 commits, full-featured Gantt editor with AI assistant. SQLite-based single-container deployment working on CapRover.

### Next Session Actions

1. Define requirements for PostgreSQL migration
2. Plan phases for database migration
3. Execute migration implementation

---

*STATE initialized: 2026-02-23*
*Last updated: 2026-03-13 for v2.0 milestone*
