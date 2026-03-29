# Roadmap: gantt-lib MCP Server

**Current milestone:** v4.0 Astro Landing
**Granularity:** Coarse
**Last updated:** 2026-03-29

## Progress Summary

| Milestone | Phases | Status | Completed |
|-----------|--------|--------|-----------|
| v1.0 MVP | 1-14 | Shipped | 2026-03-13 |
| v2.0 PostgreSQL | 15-16 | Shipped | 2026-03-17 |
| v3.0 Hardening | 17-23 | Shipped | 2026-03-22 |
| v4.0 Astro Landing | 24-28 | Active | - |

---

## Phases

- [x] **Phase 24: Astro Site Foundation** - Astro site with hero, navigation, responsive layout
- [ ] **Phase 25: Interactive Preview** - Astro islands with drag-to-edit gantt chart
- [x] **Phase 26: Content & SEO** - Features, FAQ, legal pages, SEO fundamentals (completed 2026-03-29)
- [x] **Phase 27: Domain Separation** - Multi-domain deployment, CORS, share link migration (completed 2026-03-29)
- [x] **Phase 28: Billing** - YooKassa integration, subscription management, plan enforcement (completed 2026-03-27)

---

## Phase Details

### Phase 24: Astro Site Foundation

**Goal:** Users can discover the product through a marketing site with AI demo and conversion CTAs

**Depends on:** Nothing (first phase of milestone)

**Requirements:** SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, HERO-01, HERO-02, HERO-03, HERO-04, HERO-05

**Success Criteria** (what must be TRUE):
1. User can view a marketing site with responsive layout on mobile/desktop (breakpoints 768px/1024px)
2. User can navigate the site through header navigation bar (logo, Features/FAQ links, CTA buttons)
3. User can see footer with page links and copyright
4. User can see hero section with rotating value props ("Из текста/сметы/брифа/ТЗ/письма/таблицы → Гантт за 30 секунд")
5. User can watch AI typing demo animation (text types → gantt generates)
6. User can see social proof (avatars, "★★★★★" rating, "12,000+ teams")
7. User can click "Попробовать бесплатно" CTA → redirects to ai.getgantt.ru
8. User can click "Смотреть демо" CTA → scrolls to demo section (placeholder for Phase 25)
9. User sees custom 404 page with CTA to homepage instead of default error

**Plans:** 3/3 plans executed

- [x] 24-01-PLAN.md — Astro project setup with React + Tailwind integrations, design system foundation
- [x] 24-02-PLAN.md — Header, Footer, Layout components with mobile navigation and 404 page
- [x] 24-03-PLAN.md — Hero section with rotating words, typewriter demo, gantt preview animations

**Completed:** 2026-03-23

**UI hint:** yes

---

### Phase 25: Interactive Preview

**Goal:** Users can interact with a live gantt chart on the marketing page to experience drag-to-edit

**Depends on:** Phase 24 (site foundation exists)

**Requirements:** INTER-01, INTER-02, INTER-03, INTER-04, INTER-05

**Success Criteria** (what must be TRUE):
1. User can view an interactive gantt chart on the homepage (rendered via Astro islands)
2. User can drag tasks on the chart to reschedule them (drag-to-edit via gantt-lib)
3. User can stretch tasks to change duration
4. User can collapse/expand parent tasks
5. Developer can integrate gantt-lib using Astro islands pattern (iframe isolation if needed)

**Plans:** 2 plans

- [ ] 25-01-PLAN.md — Install gantt-lib dependency and create basic interactive GanttPreview component
- [ ] 25-02-PLAN.md — Add hierarchical tasks, collapse/expand, CSS theme overrides, and polish

**UI hint:** yes

---

### Phase 26: Content & SEO

**Goal:** Users can learn about features and find answers; search engines can discover and index the site

**Depends on:** Phase 24 (site structure exists)

**Requirements:** CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05, CONTENT-06, CONTENT-07

**Success Criteria** (what must be TRUE):
1. User can read product feature overview on /features page (6-8 features with descriptions)
2. User can find answers to common questions on /faq page (10 questions: features, pricing, onboarding, data)
3. User can read Privacy Policy on /privacy page
4. User can read Terms of Service on /terms page
5. Search engines can discover all pages through sitemap.xml
6. Search engines understand indexing rules via robots.txt
7. Each page has proper meta title, description, and OG tags for social sharing

**Plans:** 2/2 plans complete

- [x] 26-01-PLAN.md — Features, FAQ, and shared metadata contract
- [x] 26-02-PLAN.md — Privacy, terms, sitemap.xml, and robots.txt

**Completed:** 2026-03-29

**UI hint:** yes

---

### Phase 27: Domain Separation

**Goal:** Marketing and app run on separate domains with independent deployment cycles

**Depends on:** Phase 26 (site content complete)

**Requirements:** DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05

**Success Criteria** (what must be TRUE):
1. packages/site builds to static assets for nginx (Dockerfile.site)
2. CapRover deploys site as separate app on getgantt.ru
3. CapRover deploys app as separate app on ai.getgantt.ru
4. WebSocket connections work with explicit CORS headers in nginx for ai.getgantt.ru
5. Share links generate with PUBLIC_SHARE_URL env variable (always ai.getgantt.ru)

**Plans:** TBD

---

### Phase 28: Billing

**Goal:** Users can purchase subscription plans via YooKassa, with plan enforcement limiting features based on active subscription

**Depends on:** Phase 27

**Requirements:** BILL-DB, BILL-BACKEND, BILL-YOOKASSA, BILL-ENFORCE, BILL-UI, BILL-CTA, BILL-NAV

**Success Criteria** (what must be TRUE):
1. Database has payments and subscriptions tables for tracking billing state
2. Backend creates YooKassa embedded widget payments and handles webhooks with idempotency
3. POST /api/chat enforces AI generation limits (403 when limit reached)
4. User sees billing page with current plan, usage limits, and payment history
5. User can start YooKassa embedded payment from billing page
6. Pricing page CTAs redirect to billing page with correct plan pre-selected
7. Enterprise plan shows "contact us" instead of payment flow
8. Subscription expiry triggers read-only mode

**Plans:** 4/4 plans complete

- [x] 28-01-PLAN.md — Database schema, plan config, billing backend with YooKassa integration
- [x] 28-02-PLAN.md — Subscription enforcement middleware, billing frontend store and page
- [x] 28-03-PLAN.md — Pricing CTA integration, in-app billing navigation, visual verification

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 24. Astro Site Foundation | 3/3 | Complete | 2026-03-23 |
| 25. Interactive Preview | 0/2 | Not started | - |
| 26. Content & SEO | 2/2 | Complete    | 2026-03-29 |
| 27. Domain Separation | -/3 | Complete | 2026-03-29 |
| 28. Billing | 4/4 | Complete    | 2026-03-28 |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SITE-01 | 24 | Complete |
| SITE-02 | 24 | Complete |
| SITE-03 | 24 | Complete |
| SITE-04 | 24 | Complete |
| SITE-05 | 24 | Complete |
| HERO-01 | 24 | Complete |
| HERO-02 | 24 | Complete |
| HERO-03 | 24 | Deferred |
| HERO-04 | 24 | Complete |
| HERO-05 | 24 | Complete |
| INTER-01 | 25 | Pending |
| INTER-02 | 25 | Pending |
| INTER-03 | 25 | Pending |
| INTER-04 | 25 | Pending |
| INTER-05 | 25 | Pending |
| CONTENT-01 | 26 | Pending |
| CONTENT-02 | 26 | Pending |
| CONTENT-03 | 26 | Complete |
| CONTENT-04 | 26 | Complete |
| CONTENT-05 | 26 | Complete |
| CONTENT-06 | 26 | Complete |
| CONTENT-07 | 26 | Pending |
| DEPLOY-01 | 27 | Complete |
| DEPLOY-02 | 27 | Complete |
| DEPLOY-03 | 27 | Complete |
| DEPLOY-04 | 27 | Complete |
| DEPLOY-05 | 27 | Complete |
| BILL-DB | 28 | Pending |
| BILL-BACKEND | 28 | Pending |
| BILL-YOOKASSA | 28 | Pending |
| BILL-ENFORCE | 28 | Pending |
| BILL-UI | 28 | Pending |
| BILL-CTA | 28 | Pending |
| BILL-NAV | 28 | Pending |

**Coverage:** 34/34 requirements mapped

---

## Completed Phases Archive

### v1.0 MVP (Phases 1-14)

See `.planning/milestones/v1.0-ROADMAP.md` for archived roadmap.

### v2.0 PostgreSQL (Phases 15-16)

See `.planning/milestones/v2.0-ROADMAP.md` for archived roadmap.

### v3.0 Hardening (Phases 17-23)

Phases completed:
- Phase 17: Token Economy (compact mode, pagination)
- Phase 18: Agent Hardening (max turns, timeout)
- Phase 19: Task Hierarchy (parentId support)
- Phase 20: Conversation History
- Phase 21: Tool Quality (descriptions, errors)
- Phase 22: Zustand Refactor
- Phase 23: Task Filtering UI

### Phase 29: paywall-enhance

**Goal:** Sync billing with v5 pricing grid + CRO improvements for upgrade flow
**Requirements**: (no formal REQ-IDs — driven by CONTEXT.md decisions A1-B7)
**Depends on:** Phase 28
**Plans:** 2/2 plans complete

Plans:
- [x] 29-01-PLAN.md — v5 prices/features sync, PurchasePage CRO (savings, social proof, text fixes), AccountBillingPage upsell
- [x] 29-02-PLAN.md — Feature gate modal (LimitReachedModal) + integration in AI/project creation flow

---
*Last updated:* 2026-03-29
