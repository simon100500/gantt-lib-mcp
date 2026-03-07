---
phase: 10
slug: work-stability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (manual E2E testing — no jest/vitest in web/server packages) |
| **Config file** | none |
| **Quick run command** | Manual browser test |
| **Full suite command** | Manual browser test suite (all 6 bugs) |
| **Estimated runtime** | ~10 minutes for full suite |

---

## Sampling Rate

- **After every task commit:** Verify the specific bug scenario in browser
- **After every plan wave:** Run full manual test suite (all 6 bug scenarios)
- **Before `/gsd:verify-work`:** All 6 bug scenarios must pass manually
- **Max feedback latency:** Manual — verify within same dev session

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Bug | Test Type | Manual Procedure | Status |
|---------|------|------|-----|-----------|-----------------|--------|
| 10-01-01 | 01 | 1 | Bug 3a | manual | Ask AI to add task → verify Gantt updates without reload | ⬜ pending |
| 10-01-02 | 01 | 1 | Bug 3b | manual | AI creates task → check DB project_id is not NULL | ⬜ pending |
| 10-01-03 | 01 | 1 | Bug 3c | manual | AI creates task → Gantt updates in real-time | ⬜ pending |
| 10-01-04 | 01 | 1 | Bug 5 | manual | AI responds to task create → 1-2 sentence reply, no JSON | ⬜ pending |
| 10-01-05 | 01 | 1 | Bug 4 | manual | Send chat message → response appears exactly once | ⬜ pending |
| 10-02-01 | 02 | 2 | Bug 1 | manual | Reload page after 15+ min → tasks load, no 401 error | ⬜ pending |
| 10-02-02 | 02 | 2 | Bug 2 | manual | Fresh OTP login → WS shows "connected" without reload | ⬜ pending |
| 10-02-03 | 02 | 2 | Bug 6 | manual | Send messages → reload → history preserved | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No test infrastructure to create — this is a bug-fix phase with manual validation only.
No automated test framework exists for packages/web or packages/server.

*Existing infrastructure covers all phase requirements (manual only).*

---

## Manual-Only Verifications

| Behavior | Bug | Why Manual | Test Instructions |
|----------|-----|------------|-------------------|
| No 401 on page reload | Bug 1 | Token expiry requires 15+ min wait | Open app after 15+ min; verify tasks load without error banner |
| WS connected after OTP (no reload) | Bug 2 | Requires auth flow observation | Fresh login via OTP; check WS status indicator = "connected" |
| Gantt updates after AI command | Bug 3 | Requires running AI + WS + Gantt | Ask AI to add task; Gantt chart updates without page reload |
| Single message per AI response | Bug 4 | Requires visual chat inspection | Send chat message; count AI response bubbles (must be 1) |
| AI responds with brief text | Bug 5 | Requires running AI | Ask AI to add task; response must be 1-2 sentences, no JSON blocks |
| Chat history on reload | Bug 6 | Requires DB + API + UI | Send 3+ messages; reload page; all messages visible |

---

## Validation Sign-Off

- [ ] All tasks have manual verify procedure documented
- [ ] Sampling continuity: each wave ends with manual verification run
- [ ] Wave 0 covers all MISSING references (N/A — no automated tests)
- [ ] No watch-mode flags
- [ ] Feedback latency: manual per task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
