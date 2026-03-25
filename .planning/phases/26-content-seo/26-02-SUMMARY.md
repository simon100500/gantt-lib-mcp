---
phase: 26-content-seo
plan: 02
subsystem: ui
tags: [astro, seo, content, legal, sitemap, robots]
requires:
  - phase: 26-01
    provides: Shared Astro layout metadata contract plus published /features and /faq routes
provides:
  - Russian-first /privacy and /terms legal pages with route-specific metadata
  - sitemap.xml covering the shipped marketing routes only
  - robots.txt allowing indexing and advertising the sitemap URL
affects: [27-domain-separation, site-content, search-discovery]
tech-stack:
  added: []
  patterns: [Static Astro crawl assets generated from explicit route lists, legal content pages reuse the shared Layout metadata contract]
key-files:
  created: [packages/site/src/pages/privacy.astro, packages/site/src/pages/terms.astro, packages/site/src/pages/sitemap.xml.ts, packages/site/public/robots.txt]
  modified: []
key-decisions:
  - "Kept legal copy practical and scope-honest, avoiding invented billing, compliance, or certification claims."
  - "Restricted sitemap.xml to the currently shipped marketing routes instead of anticipating future pages."
patterns-established:
  - "Legal page SEO pattern: static Astro pages pass distinct title, description, ogTitle, and ogDescription through Layout."
  - "Crawler asset pattern: packages/site owns robots.txt and sitemap.xml for the public marketing domain only."
requirements-completed: [CONTENT-03, CONTENT-04, CONTENT-05, CONTENT-06, CONTENT-07]
duration: 5 min
completed: 2026-03-25
---

# Phase 26 Plan 02: Legal and Crawl Assets Summary

**Russian-first legal pages with distinct metadata, plus sitemap.xml and robots.txt for the shipped GetGantt marketing routes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T20:29:05+03:00
- **Completed:** 2026-03-25T20:34:24+03:00
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- Published `/privacy` with practical data-handling copy, contact guidance, and page-specific metadata.
- Published `/terms` with plain-language usage rules, user responsibility boundaries, and page-specific metadata.
- Verified static crawl assets in a clean Astro build: `/sitemap.xml` lists only `/`, `/features`, `/faq`, `/privacy`, and `/terms`, and `/robots.txt` allows indexing with the sitemap URL.

## Task Commits

Each implementation task was committed atomically where code changes were required:

1. **Task 1: Create a clear /privacy page** - `0858163` (feat)
2. **Task 2: Create a clear /terms page** - `2bbe23e` (feat)
3. **Task 3: Generate sitemap.xml from the actual marketing routes** - `79c1605` (feat)
4. **Task 4: Add robots.txt for indexable marketing pages** - `708b09f` (feat)
5. **Task 5: Verify legal pages and crawl assets in a built site** - completed via approved human-verify checkpoint plus fresh local build/output validation

## Files Created/Modified
- `packages/site/src/pages/privacy.astro` - structured Russian-first privacy policy covering submitted content, auth basics, and contact path
- `packages/site/src/pages/terms.astro` - readable terms covering acceptable use, responsibility boundaries, service availability, and support/legal contact
- `packages/site/src/pages/sitemap.xml.ts` - static XML endpoint enumerating only the shipped marketing routes on `https://getgantt.ru`
- `packages/site/public/robots.txt` - minimal crawl rules allowing indexing and pointing bots to the sitemap

## Decisions Made
- Kept the legal language product-specific and direct instead of adding generic boilerplate for subscriptions or legal processes not present in the repo.
- Treated the approved checkpoint as sufficient human UX signoff, then closed the task only after a fresh `npm.cmd run build -w packages/site` confirmed the generated artifacts and metadata in `dist/`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 now has all planned content and SEO fundamentals in place for the marketing site.
- Ready for Phase 27 domain-separation work.

## Self-Check

PASSED

- FOUND: `.planning/phases/26-content-seo/26-02-SUMMARY.md`
- FOUND: `0858163`
- FOUND: `2bbe23e`
- FOUND: `79c1605`
- FOUND: `708b09f`

---
*Phase: 26-content-seo*
*Completed: 2026-03-25*
