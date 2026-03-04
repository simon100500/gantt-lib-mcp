---
phase: 08
slug: integrate-gantt-lib-library
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for integrating gantt-lib library into the web package.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual (visual inspection) + npm build |
| **Config file** | packages/web/vite.config.ts (existing) |
| **Quick run command** | `npm run dev:web` |
| **Full suite command** | `npm run build:web` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build:web` to verify TypeScript compilation
- **After every plan wave:** Run `npm run dev:web` and visually inspect
- **Before `/gsd:verify-work`:** Manual smoke test completed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | gantt-lib installed | build | `npm run build:web` | package.json | ⬜ pending |
| 08-01-02 | 01 | 1 | CSS import added | build | `npm run build:web` | main.tsx | ⬜ pending |
| 08-01-03 | 01 | 1 | Component renders | manual | `npm run dev:web` | GanttChart.tsx | ⬜ pending |
| 08-02-01 | 02 | 2 | Tasks display | manual | Visual check | — | ⬜ pending |
| 08-02-02 | 02 | 2 | Drag interactions | manual | Visual check | — | ⬜ pending |
| 08-03-01 | 03 | 3 | Dependency lines | manual | Visual check | — | ⬜ pending |
| 08-03-02 | 03 | 3 | Empty state handling | manual | Visual check | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**Existing infrastructure covers all phase requirements.**

The project already has:
- Vite build system configured
- TypeScript compilation
- React development environment
- WebSocket integration for real-time updates

No new test infrastructure needed for this integration phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gantt chart renders with tasks | Visual rendering | Requires browser inspection | 1. Run `npm run dev:web` 2. Create tasks via chat 3. Verify task bars render correctly |
| Task drag interaction | Drag-and-drop | Requires physical drag | 1. Click and drag task bar 2. Verify task moves 3. Check WebSocket broadcasts change |
| Task resize interaction | Edge resize | Requires physical drag | 1. Drag left/right edge of task 2. Verify date changes 3. Check persistence |
| Empty state display | UX requirement | Visual component | 1. Start with no tasks 2. Verify friendly message displays |
| Dependency lines | Visual rendering | Browser inspection | 1. Create tasks with dependencies 2. Verify connection lines render |
| Real-time updates | WebSocket sync | Multi-client test | 1. Open two browser tabs 2. Modify task in one 3. Verify update in other |
| CSS styling | Visual polish | Browser rendering | 1. Verify grid lines render 2. Verify colors apply 3. Verify today indicator shows |

---

## Validation Sign-Off

- [x] All tasks have verification method (build or manual)
- [x] Sampling continuity: build verification after each task
- [x] Wave 0 requirements covered (existing infrastructure)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (pending verification)

**Approval:** pending

---

*Validation strategy created: 2026-03-04*
*Phase: 08-integrate-gantt-lib-library*
