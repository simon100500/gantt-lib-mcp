---
phase: 26-content-seo
plan: "01"
subsystem: site
tags: [seo, content, navigation, astro, russian-copy]
dependency_graph:
  requires: [25-interactive-preview]
  provides: [features-page, faq-page, shared-seo-metadata, updated-navigation]
  affects: [Layout.astro, Header.astro, Footer.astro]
tech_stack:
  added: []
  patterns: [Astro page routes, Layout props pattern, details/summary accordion]
key_files:
  created:
    - packages/site/src/pages/features.astro
    - packages/site/src/pages/faq.astro
  modified:
    - packages/site/src/layouts/Layout.astro
    - packages/site/src/components/Header.astro
    - packages/site/src/components/Footer.astro
decisions:
  - "FAQ uses details/summary accordion — no JS required, native browser support"
  - "features.astro uses array-mapped sections for maintainability over inline repetition"
  - "Footer Компания column replaced with Приложение pointing to ai.getgantt.ru"
metrics:
  duration_seconds: 170
  completed_date: "2026-03-25"
  tasks_completed: 4
  tasks_total: 5
  files_modified: 5
---

# Phase 26 Plan 01: Content Pages and Shared SEO Metadata Summary

**One-liner:** Layout SEO props + /features (5 split sections, AI-first) + /faq (10 accordion Q&A) + nav updated with /features and /faq links.

---

## What Was Built

### Task 1 — Layout SEO metadata contract (commit: ceb7125)

Added `description`, `ogTitle`, `ogDescription` props to `Layout.astro` with safe defaults. Now renders `og:title`, `og:description`, `og:type` (website), `og:locale` (ru_RU), and per-page `<meta name="description">`. Existing font and favicon setup preserved.

### Task 2 — Header and Footer navigation (commit: fd34f6d)

Header now exposes `/features` (label: Возможности) and `/faq` (label: FAQ) in both desktop nav and mobile drawer. Active route highlighted via `currentPage`. Footer dead links (`/about`, `/contact`) removed; `/faq` added to Product column; Company column replaced with Приложение linking to `ai.getgantt.ru`.

### Task 3 — /features product story page (commit: 89ed5f4)

Created `packages/site/src/pages/features.astro` with:
- Page hero with CTA to `ai.getgantt.ru`
- 5 large split sections (alternating left/right): AI chat, interactive editing, dependencies/rescheduling, task hierarchy, share links
- AI-first positioning — first section explicitly about plan-from-text
- Distinct `title`/`description`/OG props passed to Layout
- Uses existing `btn-gradient-shimmer` and design tokens

### Task 4 — /faq page (commit: c639bf2)

Created `packages/site/src/pages/faq.astro` with:
- 10 FAQ entries covering: product overview, AI input, manual editing, dependencies, hierarchy, onboarding speed, pricing status (honest/TBD), data/privacy (routes to /privacy), share links, site vs editor clarification
- Native `<details>/<summary>` accordion — no JavaScript needed
- Page-specific `title`/`description`/OG via Layout props

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

- Visual placeholder areas in `/features` sections are `div` elements with emoji icons and muted background. These are intentional placeholders for screenshots/illustrations to be added in a future phase. The text content and structure are complete. These do not prevent the page's goal.

---

## Self-Check: PASSED

Files exist:
- FOUND: packages/site/src/layouts/Layout.astro
- FOUND: packages/site/src/components/Header.astro
- FOUND: packages/site/src/components/Footer.astro
- FOUND: packages/site/src/pages/features.astro
- FOUND: packages/site/src/pages/faq.astro

Commits exist:
- FOUND: ceb7125 feat(26-01): add page-specific SEO metadata contract to Layout
- FOUND: fd34f6d feat(26-01): add /features and /faq to header and footer navigation
- FOUND: 89ed5f4 feat(26-01): create /features product story page with 5 split sections
- FOUND: c639bf2 feat(26-01): create /faq page with 10 concise product-first Q&A
