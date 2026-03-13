# Milestones

## v1.0 MVP (Shipped: 2026-03-13)

**Phases:** 1-14 | **Plans:** 26 | **Timeline:** 18 days (2026-02-23 → 2026-03-12)

**Git range:** bd7e0a0 (MCP server foundation) → 24f1c5c (reassess-roadmap)

**Stats:**
- Commits: 178
- Files changed: 258
- Lines added: 42,493
- Total LOC: ~116,000 (TypeScript/JavaScript)

**Key accomplishments:**
1. **MCP Server Foundation** — TypeScript server with stdio transport and @modelcontextprotocol/sdk for Claude Code CLI integration
2. **Task CRUD + Auto-schedule** — Full task management with cascading date recalculation, FS/SS/FF/SF dependencies, cycle detection
3. **Web UI with AI Chat** — React + Fastify + WebSocket monorepo with real-time Gantt editing and AI-driven task creation
4. **gantt-lib Integration** — Interactive drag-to-edit with functional updater pattern and WebSocket sync
5. **Multi-user Auth** — OTP email authentication, JWT tokens, project-scoped data isolation with SQLite
6. **Production Deployment** — Docker multi-stage build with Nginx reverse proxy and CapRover one-click deployment

**Known gaps:**
- Phase 9 Plan 6 (Auth UI) — OTP modal and project switcher not implemented (backend auth complete, UI pending)

---

