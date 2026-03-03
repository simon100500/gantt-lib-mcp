---
phase: 6
slug: qwen-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (already used in this project) |
| **Config file** | None — inline `node --test` |
| **Quick run command** | `node --test agent/agent.test.js` |
| **Full suite command** | `npm test && node --test agent/agent.test.js` |
| **Estimated runtime** | ~5 seconds (unit tests only) |

---

## Sampling Rate

- **After every task commit:** Run `node --test agent/agent.test.js`
- **After every plan wave:** Run `npm test && node --test agent/agent.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green + manual E2E run
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | AGENT-01 | unit | `node --test agent/agent.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-01-02 | 01 | 0 | AGENT-02 | unit | `node --test agent/agent.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-01-03 | 01 | 0 | AGENT-06 | unit | `node --test agent/agent.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-01-04 | 01 | 1 | AGENT-03 | integration | manual: `node dist/agent/agent.js "build a house"` | N/A | ⬜ pending |
| 6-01-05 | 01 | 1 | AGENT-04 | integration | manual: run agent with real .env | N/A | ⬜ pending |
| 6-01-06 | 01 | 1 | AGENT-05 | integration | manual: check tasks.json exists after run | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `agent/agent.test.js` — stubs for AGENT-01, AGENT-02, AGENT-06
- [ ] `agent/prompts/system.md` — system prompt file (must exist before tests run)
- [ ] `agent/agent.ts` — main implementation file stub

*No test framework install needed — Node.js built-in test runner already established in this project.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP server connection (dist/index.js spawns) | AGENT-03 | Requires compiled MCP server + subprocess spawn | Run `node dist/agent/agent.js "build a 3-story building"`, check no MCP connection errors in output |
| Z.AI endpoint responds with valid completion | AGENT-04 | Requires live Z.AI credentials in .env | Run agent with real OPENAI_API_KEY/OPENAI_BASE_URL, verify model response in stdout |
| tasks.json written to disk after session | AGENT-05 | Requires full E2E run | After running agent, check `tasks.json` exists and contains valid Gantt JSON array |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
