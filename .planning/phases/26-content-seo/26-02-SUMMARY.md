---
phase: 26-content-seo
plan: 02
subsystem: seo, content
tags: [astro, sitemap, robots-txt, legal-pages, privacy, terms]

# Dependency graph
requires:
  - phase: 26-01
    provides: content pages (/features, /faq), shared metadata contract, Layout with OG tags
provides:
  - /privacy page with Russian-first privacy copy
  - /terms page with plain-language service terms
  - sitemap.xml endpoint listing all marketing routes
  - robots.txt allowing indexing with sitemap declaration
affects: [phase-27-domain-separation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static sitemap via Astro endpoint with explicit route array"
    - "robots.txt in public/ as static asset with sitemap pointer"

key-files:
  created:
    - packages/site/src/pages/privacy.astro
    - packages/site/src/pages/terms.astro
    - packages/site/src/pages/sitemap.xml.ts
    - packages/site/public/robots.txt
  modified: []

key-decisions: []

requirements-completed: [CONTENT-03, CONTENT-04, CONTENT-05, CONTENT-06]

# Metrics
duration: 0min
completed: 2026-03-29
---

# Phase 26 Plan 02: Legal Pages & Crawl Assets Summary

**Privacy and terms pages in Russian, sitemap.xml for 5 marketing routes, robots.txt with full crawl allowance**

## Performance

- **Duration:** pre-existing (checkpoint-approved)
- **Started:** 2026-03-29T10:33:20Z
- **Completed:** 2026-03-29T10:33:20Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- /privacy page with honest, structured privacy copy covering data processing, analytics, and contact path
- /terms page with plain-language service terms covering acceptable use, limitations, and contact
- sitemap.xml endpoint enumerating /, /features, /faq, /privacy, /terms with https://getgantt.ru base URL
- robots.txt allowing full indexing with Sitemap declaration pointing to sitemap.xml
- All pages use shared Layout metadata contract for distinct title/description/OG tags

## Task Commits

Each task was committed atomically:

1. **Task 1: Create a clear /privacy page** - pre-existing (privacy.astro already existed)
2. **Task 2: Create a clear /terms page** - pre-existing (terms.astro already existed)
3. **Task 3: Generate sitemap.xml from actual marketing routes** - `0f59819` (feat)
4. **Task 4: Add robots.txt for indexable marketing pages** - `666a981` (feat)
5. **Task 5: Verify legal pages and crawl assets** - approved by user (checkpoint)

**Note:** Privacy and terms pages were created as part of earlier phase 26 work (commit `a308433`). Sitemap and robots.txt were new deliverables in this plan.

## Files Created/Modified
- `packages/site/src/pages/privacy.astro` - Privacy Policy page with Russian-first structured copy
- `packages/site/src/pages/terms.astro` - Terms of Service page with plain-language terms
- `packages/site/src/pages/sitemap.xml.ts` - Sitemap endpoint generating XML for 5 marketing routes
- `packages/site/public/robots.txt` - Crawl rules allowing indexing with sitemap pointer

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 26 content and SEO fundamentals complete
- Legal pages and crawl assets ready for Phase 27 domain separation
- No blockers for deployment configuration

---
*Phase: 26-content-seo*
*Completed: 2026-03-29*
