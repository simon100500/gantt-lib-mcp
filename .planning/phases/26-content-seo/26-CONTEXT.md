# Phase 26: Content & SEO - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 26 adds content pages and SEO fundamentals for `packages/site`: `/features`, `/faq`, `/privacy`, `/terms`, `sitemap.xml`, `robots.txt`, and page-level metadata.

This phase defines how the marketing site explains the product and how search engines discover and understand the pages. It does not add new product capabilities, pricing flows, blog content, template library, or auth changes.

</domain>

<decisions>
## Implementation Decisions

### Homepage vs Features Page
- Keep the homepage focused on the wow effect: interactive demo, clear CTA, and only a short teaser of key advantages.
- Move the full feature breakdown to a dedicated `/features` page to avoid making the homepage too heavy.
- Use the homepage to hand off interested users into `/features`, not to fully explain every capability inline.

### Features Page Structure
- `/features` should be built around product capabilities, not industry scenarios.
- Use large Google-style split sections: one strong visual/demo area paired with one strong text block.
- Prefer 5-7 large sections rather than a dense grid of small cards.
- Use a mixed tone: strong product-marketing headline treatment at the top, then calm and practical explanation in the body.
- Put the strongest emphasis first on AI chat and creating a project plan from text, then interactive editing.

### Features Page Content Priorities
- Include AI assistant chat as a first-class feature, not a secondary mention.
- Include plan creation from natural language/text as a core capability.
- Include interactive gantt editing as a core capability.
- Include dependencies and automatic rescheduling as a core capability.
- Include task hierarchy and stages as a core capability.
- Include read-only share links for viewing as a core capability.
- Do not present browser collaboration as a feature yet; current positioning should stay at share-for-reading only.

### FAQ Strategy
- `/faq` should primarily answer product questions, not lead with trust or onboarding concerns.
- Answers should be short and direct, usually 2-4 sentences, not mini-documentation.
- Avoid a dedicated pricing answer for now since pricing is not yet defined as a page or stable content area.
- For data/privacy topics in FAQ, give a brief practical summary and route legal detail to `/privacy`.

### SEO Voice And Metadata
- SEO copy should use a balanced voice: clear for search intent, but still product-led and persuasive.
- Search intent should blend three clusters rather than overcommitting to one: gantt charts, project planning, and AI assistant.
- Meta titles should lead with the user benefit or page promise, then the brand.
- Page descriptions should be distinct per page rather than lightly reusing one product summary everywhere.
- OG copy should match the same balanced positioning as metadata instead of becoming more hype-driven than the page itself.

### Claude's Discretion
- Exact ordering of mid-page feature blocks after the first AI-led section.
- Exact question list inside `/faq`, as long as the page stays product-first and concise.
- Exact wording of meta titles and descriptions page by page.
- Exact visual treatment of section mockups/illustrations for `/features`.

</decisions>

<specifics>
## Specific Ideas

- `/features` should feel like Google's product pages: large visual + text sections, not a cramped feature-card grid.
- The homepage should keep the demo-led wow effect and avoid turning into a long, heavy landing page.
- The product should be described as something you can control both through AI chat and direct gantt editing.
- The share story should stay honest: shareable read-only links, not true collaboration.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/site/src/layouts/Layout.astro`: shared layout already provides the global document shell and is the natural place to evolve shared meta handling.
- `packages/site/src/components/Header.astro`: existing header can expose `/features` and `/faq` once those routes exist.
- `packages/site/src/components/Footer.astro`: existing footer already links to `/features`, `/privacy`, and `/terms`; it can be aligned to the final route set during implementation.
- `packages/site/src/components/DemoSection.tsx`: current homepage already contains the core product story around AI input, demo templates, interactive gantt preview, and CTA.
- `packages/site/src/styles/global.css`: existing site tokens and motion utilities can be reused for large split-section content blocks.

### Established Patterns
- The site is Russian-first, so page copy and metadata should follow that default unless a strong reason appears otherwise.
- Previous phases positioned `ai.getgantt.ru` as the destination for product use; content pages should reinforce that CTA flow rather than invent new conversion paths.
- The current layout has a single shared `title` and `description`, which means Phase 26 should likely introduce page-specific metadata while keeping one shared mechanism.
- The current marketing site already uses bold hero typography and visual storytelling, so `/features` should continue that language instead of switching to a dry documentation style.

### Integration Points
- New Astro routes under `packages/site/src/pages/` will carry the content pages.
- SEO assets such as `sitemap.xml` and `robots.txt` should integrate with the Astro site build/output rather than the app runtime.
- Header, footer, and shared layout need updates so the new content pages are discoverable and metadata is controlled consistently.

</code_context>

<deferred>
## Deferred Ideas

- Dedicated pricing page or stable pricing copy.
- Templates library and template detail pages.
- Blog/editorial content.
- True browser collaboration; current feature story remains read-only sharing.

</deferred>

---

*Phase: 26-content-seo*
*Context gathered: 2026-03-25*
