# Feature Landscape: Marketing Site

**Domain:** SaaS marketing landing site (Astro-based)
**Researched:** 2026-03-23
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features visitors assume exist. Missing these = site feels unprofessional or abandoned.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Hero section** | First impression, communicate value proposition immediately | LOW | Already designed in gantt-hero.html — rotating words, input demo, gantt preview |
| **Navigation bar** | Users expect to explore product, pricing, FAQ | LOW | Logo, links (Features, Templates, FAQ), CTA buttons (Login, Try) |
| **Social proof** | Trust building — "others use this" | LOW | User count, testimonials, logos, ratings (G2/Capterra style) |
| **Feature overview** | Answer "what does this do?" without signing up | MEDIUM | 3-6 core features with icons/descriptions |
| **CTA to app** | Primary conversion goal — get users to ai.getgantt.ru | LOW | Multiple placement: hero, features, templates, FAQ |
| **FAQ section** | Address objections before they become blockers | MEDIUM | 8-12 questions covering pricing, features, onboarding, data |
| **Legal pages** | Privacy policy + Terms required by app stores/payments | LOW | Privacy, Terms — static content, minimal updates |
| **Responsive design** | 50%+ traffic from mobile in 2026 | MEDIUM | Mobile-first, breakpoints at 768px, 1024px |
| **SEO basics** | Discoverability via search engines | MEDIUM | sitemap.xml, robots.txt, meta titles/descriptions, OG tags |
| **Footer** | Standard navigation, legal links, social proof | LOW | Links to all pages, copyright, contact info |
| **Loading performance** | 40% bounce if load > 3s (Google standard) | LOW | Astro handles by default, just avoid heavy images |
| **404 page** | Broken links happen — graceful fallback | LOW | Custom 404 with CTA to homepage |

### Differentiators (Competitive Advantage)

Features that set GanttAI apart from other project management tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI-first hero demo** | Show, don't tell — typing demo → gantt generation in 1.4s | HIGH | Already in gantt-hero.html, needs Astro port |
| **Template library** | SEO goldmine + fast onboarding ("start from X template") | MEDIUM | /templates page with 8-12 starter templates |
| **Real-time preview** | Interactive demo builds trust more than screenshots | MEDIUM | Mini gantt chart with animated bars (already in hero) |
| **Rotating value props** | Address multiple use cases without clutter | LOW | "Из текста/сметы/брифа/ТЗ/письма/таблицы → Гантт" |
| **Generated badge** | Emphasize AI automation ("5 stages, 12 tasks, 3 people") | LOW | Already in gantt-preview, reinforces AI value |
| **Russian-first** | Most PM tools are English-first, localize from start | MEDIUM | All content in Russian, Cyrillic URLs, .ru domain |
| **Speed emphasis** | "30 seconds" counter — specific, measurable claim | LOW | Timer animation in demo, matches AI value prop |
| **Multi-input format** | PDF, DOCX, Excel, text — broadens appeal | MEDIUM | Input hint in demo, feature detail in /features |
| **Project type tags** | "Software development", "Marketing campaign", etc. | LOW | Template categorization, helps SEO |
| **Integration hints** | Show how this fits into existing workflows | MEDIUM | "Works with Notion, Jira, Slack" — future-proofing |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for marketing sites.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Blog in v1** | "SEO needs content" | Requires ongoing editorial, maintenance | Start with templates/library pages, add blog later |
| **Pricing page** | "SaaS needs pricing" | No pricing model yet, premature commitment | CTA to app, pricing decision inside app after trial |
| **Live chat widget** | "Support is important" | Requires staffing, alerts at 3am | Email contact form, FAQ, app-based support |
| **User authentication on site** | "Personalize experience" | Breaks static model, adds complexity | Site is public, auth only on ai.getgantt.ru |
| **Dynamic routing (SSR)** | "Need real-time data" | Defeats Astro's speed advantage | Pre-render at build time, client-side islands for interactivity |
| **A/B testing platform** | "Optimize conversions" | Overkill for v1, adds cost | Simple analytics (Plausible/Umami), iterate based on data |
| **Multi-language** | "International market" | Dilutes focus, translation debt | Russian-first, expand when RU market validated |
| **Shareable projects on site** | "Public showcase" | Share stays on ai.getgantt.ru by architecture | Template pages with static examples instead |
| **Comparison pages** | "Vs competitors" | Maintenance burden, negative framing | Feature-focused pages showing our strengths |
| **Complex animations** | "Impressive demo" | Performance hit, distract from CTA | Subtle animations (up, growIn) already in hero |

## Feature Dependencies

```
[Hero section]
    ├──requires──> [CTA to app]
    ├──enhances──> [AI demo (typing → gantt)]
    └──enhances──> [Social proof]

[Template library (/templates)]
    ├──requires──> [Individual template pages (/templates/[slug])]
    ├──requires──> [CTA to app with ?template= parameter]
    └──enhances──> [SEO (long-tail keywords)]

[FAQ section]
    ├──requires──> [Legal pages (Privacy, Terms)]
    └──requires──> [Contact/Support link]

[SEO basics]
    ├──requires──> [Sitemap generation]
    ├──requires──> [Meta tags on all pages]
    └──enhances──> [Template library (content depth)]

[Responsive design]
    └──required-by──> [All pages (mobile traffic)]

[Navigation bar]
    └──required-by──> [All pages (user orientation)]
```

### Dependency Notes

- **Hero requires CTA:** Hero without conversion path is wasted attention — every demo must end with "Try this in app"
- **Templates enhance SEO:** Template pages with keyword-rich descriptions rank for long-tail queries ("маркетинговый план шаблон")
- **FAQ requires Legal:** Users expect privacy policy before signing up — link from FAQ
- **SEO enhances everything:** Pre-rendered HTML is Astro's superpower — don't negate with client-only routing
- **Navigation required by all pages:** Users need to know where they are, what's next

## MVP Definition

### Launch With (v4.0 — This Milestone)

Minimum viable marketing site — enough to validate AI-first value prop.

- [x] **Hero section** — Already designed in gantt-hero.html, port to Astro
- [x] **Navigation bar** — Logo, links, CTA buttons (Login → ai.getgantt.ru, Try → ai.getgantt.ru)
- [x] **AI demo** — Typing animation → gantt generation (reuse existing JS)
- [x] **Social proof** — "12,000+ teams", avatars, 5-star rating
- [x] **Feature overview** — 6 core features (AI generation, drag-to-edit, dependencies, templates, real-time sync, export)
- [x] **Template library** — /templates with 8 starter templates (Software, Marketing, Event, Construction, etc.)
- [x] **Template detail pages** — /templates/[slug] with description + CTA
- [x] **FAQ section** — 10 questions covering features, pricing, onboarding, data security
- [x] **Legal pages** — Privacy policy, Terms (static content)
- [x] **Footer** — Links to all pages, copyright
- [x] **Responsive design** — Mobile-first CSS
- [x] **SEO basics** — Sitemap, robots.txt, meta tags, OG tags
- [x] **404 page** — Custom error with CTA

**Page count:** 7 pages (/, /templates, /templates/[slug] × 8, /features, /faq, /privacy, /terms, 404)

### Add After Validation (v4.1+)

Features to add once core site is driving traffic to app.

- [ ] **Blog** — When content marketing becomes acquisition channel
- [ ] **Pricing page** — When pricing model is finalized and tested
- [ ] **Analytics** — Plausible/Umami for traffic analysis
- [ ] **Testimonials carousel** — Real user quotes with photos
- [ ] **Video demo** — 60-second explainer video in hero
- [ ] **Integration showcase** — "Works with Notion, Jira, Slack" logos
- [ ] **Changelog** — /updates page for release notes
- [ ] **Comparison pages** — "GanttAI vs MS Project", "GanttAI vs Asana" (SEO play)

### Future Consideration (v5.0+)

Features to defer until product-market fit is established.

- [ ] **User accounts on site** — Only if personalization drives significant lift
- [ ] **Multi-language** — Only after Russian market validated
- [ ] **Interactive demo in app** — Full editor preview on site (complexity vs benefit?)
- [ ] **Community forum** — When user base is >10k
- [ ] **API documentation** — /docs for programmatic access
- [ ] **Case studies** — In-depth user success stories
- [ ] **Webinars** — Live demos, on-demand recordings
- [ ] **Referral program** — "Invite a colleague" CTA

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hero section + AI demo | HIGH | LOW (port existing) | P1 |
| CTA to app | HIGH | LOW (absolute URLs) | P1 |
| Template library | HIGH | MEDIUM (content + pages) | P1 |
| FAQ section | MEDIUM | LOW (static content) | P1 |
| Legal pages (Privacy, Terms) | MEDIUM | LOW (boilerplate) | P1 |
| SEO basics (sitemap, meta) | HIGH | LOW (Astro built-in) | P1 |
| Responsive design | HIGH | MEDIUM (CSS work) | P1 |
| Feature overview | MEDIUM | LOW (6 cards) | P1 |
| Social proof | MEDIUM | LOW (reuse from hero) | P1 |
| Navigation bar | MEDIUM | LOW (standard component) | P1 |
| Footer | LOW | LOW (static links) | P1 |
| 404 page | LOW | LOW (one-off) | P1 |
| Blog | MEDIUM | HIGH (ongoing content) | P2 |
| Pricing page | MEDIUM | LOW (static) | P2 |
| Analytics | HIGH | LOW (Plausible) | P2 |
| Testimonials | MEDIUM | MEDIUM (collection + display) | P2 |
| Video demo | MEDIUM | HIGH (production) | P2 |
| Multi-language | LOW | HIGH (translation) | P3 |
| Interactive app demo | LOW | HIGH (React in Astro) | P3 |
| User accounts on site | LOW | HIGH (auth complexity) | P3 |

**Priority key:**
- P1: Must have for v4.0 launch (this milestone)
- P2: Should have, add when possible (v4.1+)
- P3: Nice to have, future consideration (v5.0+)

## Competitor Feature Analysis

| Feature | MS Project | Asana | Monday.com | GanttAI |
|---------|------------|-------|------------|---------|
| AI-first hero demo | ❌ Screenshot only | ❌ Static hero | ❌ Video only | ✅ Interactive typing demo |
| Template library | ✅ 50+ templates | ✅ Templates | ✅ Templates | ✅ 8-12 focused templates (v1) |
| Russian localization | ✅ Full | ✅ Full | ✅ Full | ✅ Russian-first |
| SEO-optimized templates | ❌ Client-side app | ⚠️ Partial | ⚠️ Partial | ✅ Pre-rendered Astro pages |
| Speed emphasis | ❌ "Enterprise" focus | ❌ Feature-heavy | ❌ Complex UI | ✅ "30 seconds" hero |
| Multi-input format | ❌ Manual entry | ❌ Manual entry | ❌ Manual entry | ✅ PDF/DOCX/Excel/text → AI |
| Real-time preview | ❌ None | ❌ None | ❌ None | ✅ Animated gantt generation |
| Pricing transparency | ✅ Pricing page | ✅ Pricing page | ✅ Pricing page | ⚠️ CTA to app (v1), pricing page (v2) |

**Key differentiators:**
1. **Interactive demo** — Not just screenshots, but live typing → gantt generation
2. **AI-first messaging** — Speed, automation, multi-input format
3. **Russian-first** — No "localized from English" feel
4. **Template SEO** — Pre-rendered pages rank for long-tail queries

## Content Patterns for SaaS Marketing

### Hero Section Pattern (from gantt-hero.html)

**Structure:**
```
1. Tag line (green dot + "Новый способ планировать")
2. Headline (rotating words + value prop)
3. Subheadline (supporting copy, bold key benefits)
4. CTA buttons (primary: "Попробовать", secondary: "Смотреть демо")
5. Social proof (avatars + stars + user count)
6. Interactive demo (typing → gantt preview)
```

**Why it works:**
- **Tag** → Credibility ("new way" not "old tool")
- **Rotating words** → Multiple use cases without clutter
- **Specific numbers** → "30 seconds", "12,000+ teams" (measurable claims)
- **Live demo** → Shows product in action, builds trust
- **Social proof** → FOMO + validation

### Feature Card Pattern

**Structure:**
```
1. Icon (emoji or SVG)
2. Title (short, benefit-focused)
3. Description (1-2 sentences, clear value)
4. Optional: Screenshot or mini-demo
```

**Example:**
```
[🤖 AI-генерация]
Из любого документа — текст, смета, ТЗ, письмо.
Получите готовый график за 30 секунд вместо 3 часов.
```

### Template Card Pattern

**Structure:**
```
1. Preview image (mini gantt chart)
2. Title ("Маркетинговая кампания")
3. Tags (industry, complexity, duration)
4. Description (2-3 sentences, use case)
5. CTA button ("Use this template" → ai.getgantt.ru/?template=marketing)
```

### FAQ Pattern

**Categories:**
1. **Features** — "Что умеет AI?", "Какие форматы поддерживает?"
2. **Onboarding** — "Как начать?", "Нужна ли регистрация?"
3. **Pricing** — "Сколько стоит?", "Есть ли бесплатная версия?"
4. **Data** — "Где хранятся данные?", "Можно ли экспортировать?"
5. **Integrations** — "Работает ли с Notion/Jira/Slack?"

**Format:** Accordion or simple list — 10 questions max for MVP

### CTA Strategies

**Primary CTA:** "Попробовать бесплатно" → https://ai.getgantt.ru
- **Placement:** Hero (after demo), Features (after benefits), Templates (after preview)
- **Style:** Blue background, white text, arrow icon
- **Copy:** Action-oriented, no commitment ("free", "no credit card")

**Secondary CTA:** "Смотреть демо" → anchor to #demo section
- **Placement:** Hero (next to primary)
- **Style:** White background, border, hover effect
- **Copy:** Low-friction alternative

**Template CTA:** "Use this template" → https://ai.getgantt.ru/?template=[slug]
- **Placement:** Template cards, template detail pages
- **Style:** Same as primary but contextual
- **Copy:** Specific to template ("Use marketing template")

**Navigation CTA:** "Войти" / "Попробовать"
- **Placement:** Top-right nav
- **Style:** Outline (Login), Solid (Try)
- **Copy:** Clear distinction between existing vs new users

## Page-by-Page Breakdown

### Homepage (/)

**Sections:**
1. **Hero** — AI demo + CTA (already designed)
2. **Social proof** — Logos, testimonials, user count
3. **Feature highlights** — 6 key features (cards)
4. **Template preview** — 3-4 featured templates with CTA
5. **How it works** — 3-step process (Upload → AI generates → Edit)
6. **FAQ preview** — 3 top questions with "See all FAQ" link
7. **Final CTA** — "Ready to try?" hero-style CTA
8. **Footer** — Links to all pages

**Word count:** ~500-700 words (scannable, not overwhelming)

### Templates (/templates)

**Sections:**
1. **Hero** — "Шаблоны для любого проекта"
2. **Filters** — Industry, complexity, duration (client-side JS)
3. **Template grid** — 8-12 cards
4. **CTA** — "Need custom template? Build with AI" → app

**Word count:** ~200 words + 50-80 per template card

**Templates to launch:**
1. Software development (8 weeks, dev team)
2. Marketing campaign (4 weeks, marketing team)
3. Event planning (2 weeks, organizers)
4. Construction project (12 weeks, contractors)
5. Content calendar (4 weeks, content team)
6. Product launch (6 weeks, cross-functional)
7. Research project (10 weeks, academic)
8. HR onboarding (2 weeks, HR + new hire)

### Template Detail (/templates/[slug])

**Sections:**
1. **Hero** — Title + preview image
2. **Description** — 2-3 paragraphs (use case, benefits)
3. **What's included** — Task breakdown (bullet list)
4. **Who it's for** — Target audience, industries
5. **Timeline** — Duration, milestones
6. **Customization** — "Edit with AI, add tasks, adjust dates"
7. **CTA** — "Use this template" → ai.getgantt.ru/?template=[slug]
8. **Related templates** — 2-3 similar templates

**Word count:** ~300-400 words

### Features (/features)

**Sections:**
1. **Hero** — "Все возможности GanttAI"
2. **Core features** — 6-8 detailed features
   - AI generation
   - Drag-to-edit editor
   - Dependencies (FS, SS, FF, SF)
   - Templates library
   - Real-time sync
   - Export/share
3. **For teams** — Multi-user, collaboration
4. **For individuals** — Personal projects
5. **Integrations** — "Coming soon: Notion, Jira, Slack"
6. **CTA** — "Explore features in app" → ai.getgantt.ru

**Word count:** ~600-800 words

### FAQ (/faq)

**Sections:**
1. **Hero** — "Частые вопросы"
2. **Questions** — 10-12 accordion items
3. **Still have questions?** — Contact form or email link
4. **CTA** — "Try it yourself" → ai.getgantt.ru

**Questions (launch set):**
1. Что умеет AI-ассистент?
2. Какие форматы файлов поддерживает?
3. Как начать работу?
4. Нужна ли регистрация?
5. Сколько стоит использование?
6. Где хранятся мои данные?
7. Можно ли экспортировать диаграмму?
8. Работает ли на мобильных устройствах?
9. Можно ли делиться проектами с командой?
10. Есть ли ограничения на бесплатной версии?

**Word count:** ~800-1000 words

### Privacy (/privacy) + Terms (/terms)

**Standard boilerplate** with GanttAI-specifics:
- Data collection (email, projects)
- AI processing (OpenAI API usage)
- Data storage (PostgreSQL, retention)
- User rights (export, delete)
- Cookie policy (analytics only)

**Word count:** ~1500-2000 words total (use template, customize minimally)

## Sources

- **Hero design:** `.planning/reference/gantt-hero.html` (proven pattern with rotating words, typing demo, gantt preview)
- **Migration plan:** `.planning/reference/astro-migration-plan.md` (confirms site-only scope, CTA to app)
- **Project context:** `.planning/PROJECT.md` (AI-first value prop, existing features)
- **Architecture research:** `.planning/research/ARCHITECTURE.md` (domain split: getgantt.ru → site, ai.getgantt.ru → app)
- **SaaS landing patterns:** Industry standards (NNGroup, ProductHunt launches, 2024-2025 SaaS sites)
- **SEO best practices:** Astro documentation, Google Search Central guidelines (2025)

**Confidence notes:**
- HIGH confidence on table stakes (standard SaaS marketing patterns)
- HIGH confidence on differentiators (gantt-hero.html proven in production)
- MEDIUM confidence on template count (8-12 is typical for v1, may need adjustment)
- LOW confidence on pricing page timing (depends on business model, deferred to v4.1)

**Gaps to address:**
- Real user testimonials needed (social proof currently uses placeholder "12,000+ teams")
- Actual template screenshots required (placeholder descriptions in research)
- Pricing model undefined (CTA to app allows deferral)
- Integration roadmap undefined (mentions Notion/Jira/Slack as future)

---
*Feature research for: Marketing landing site (Astro-based)*
*Researched: 2026-03-23*
