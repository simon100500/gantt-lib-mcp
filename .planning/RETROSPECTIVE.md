# Retrospective

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Commits | LOC Delta |
|-----------|--------|-------|------|---------|-----------|
| v1.0 MVP | 14 | 26 | 18 | 178 | +42,493 |
| v2.0 PostgreSQL | 2 | 6 | 4 | 64 | +32,870 |
| v3.0 Hardening | 7 | 13 | 9 | 112 | +28,500 |
| v4.0 Astro Landing | 6 | 13 | 6 | 173 | +21,265/-25,244 |

## Milestone: v4.0 — Astro Landing

**Shipped:** 2026-03-29
**Phases:** 6 | **Plans:** 13

### What Was Built

1. Astro 5.0 marketing site with React + Tailwind, hero with typewriter demo
2. Interactive gantt preview with drag-to-edit, collapse/expand, hierarchical tasks
3. Content pages (Features, FAQ, Pricing, Privacy, Terms) + SEO (sitemap, robots, OG)
4. Multi-domain deployment (getgantt.ru + ai.getgantt.ru) with CORS
5. YooKassa billing with subscription enforcement and AI generation limits
6. Paywall CRO: LimitReachedModal, savings badges, upsell flows

### What Worked

- Astro islands pattern — easy to embed React gantt preview in static site
- YooKassa embedded widget — quick integration with webhook handling
- Incremental phase additions (27-29) — flexible scope expansion without roadmap rewrite
- yolo mode for rapid execution without approval gates

### What Was Inefficient

- Phase 27 (Domain Separation) had no formal plans — completed via config changes without tracking
- Phase 25 plans never checked off in ROADMAP despite being executed
- Many billing UI fix commits (30+) indicating design iteration should have been front-loaded
- ROADMAP/REQUIREMENTS traceability drifted out of sync during execution

### Patterns Established

- Astro marketing site in packages/site with independent deployment
- Billing store pattern (useBillingStore) with YooKassa integration
- Feature gate modal pattern (LimitReachedModal with plan-aware scenarios)
- Multi-domain deployment (site vs app) with CORS and env-based share URLs

### Key Lessons

- Always check off plans in ROADMAP after execution — automation gap
- Infrastructure/deployment phases need at least 1 formal plan for tracking
- Billing UI needs design iteration — don't expect to get it right first time
- Keep ROADMAP and REQUIREMENTS traceability tables in sync

### Cost Observations

- Model mix: balanced profile (sonnet default)
- 173 commits in 6 days — high velocity with yolo mode
- 30+ billing UI fix commits — design iteration overhead

---
