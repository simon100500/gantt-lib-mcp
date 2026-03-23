# Project Research Summary

**Project:** gantt-lib-mcp v4.0 — Astro Marketing Site + Domain Separation
**Domain:** SaaS marketing site (Astro-based) + multi-domain deployment
**Researched:** 2026-03-23
**Confidence:** MEDIUM

## Executive Summary

GanttAI v4.0 добавляет marketing site на Astro с раздельным деплоем от app. Это SaaS-продукт с AI-first позиционированием, где маркетинг отделяется от приложения для независимых релизов и SEO. Эксперты рекомендуют Astro для статических маркетинговых страниц из-за zero-JS по умолчанию (идеальный Core Web Vitals) и простоты деплоя как static site на Nginx.

Ключевой архитектурный паттерн — разделение доменов: `getgantt.ru` для маркетинга (Astro static build), `ai.getgantt.ru` для приложения (React SPA + Fastify backend). Это позволяет менять маркетинг без перезапуска backend и оптимизирует каждый домен под свою задачу. Основной риск — share links и WebSocket подключения после разделения доменов. Исследование показало, что текущий код использует relative URLs и `Host` header, что хорошо для subdomain миграции, но требует явного CORS настройки для WebSocket.

Рекомендуемый подход: фазовая миграция с нулевым риском для существующего app. Сначала создаём packages/site и деплоим отдельно, затем мигрируем app на ai.getgantt.ru, настраиваем CORS для WebSocket, обновляем share links для работы с subdomain. Все API calls уже используют relative URLs — это плюс, migration будет минимальным.

## Key Findings

### Recommended Stack

**Core technologies:**
- **Astro 5.0** — Static site generator для marketing pages — zero-JS по умолчанию = лучшие Core Web Vitals, content-focused framework
- **@astrojs/react + @astrojs/tailwind** — React integration для islands + переиспользование дизайн-системы — интерактивные компоненты только где нужно, консистентный look & feel с app
- **@astrojs/sitemap + schema-dts** — SEO библиотеки — автоматическая sitemap генерация, типобезопасные JSON-LD структурированные данные

**Deployment:**
- **CapRover multi-domain** — 2 отдельных app: getgantt.ru (static Nginx), ai.getgantt.ru (existing multi-stage Docker) — независимые циклы деплоя, маркетинг не рестартит backend

**Key decision:** Static mode (output: 'static'), NOT SSR — излишняя сложность для маркетинга, статика быстрее и дешевле в хостинге.

### Expected Features

**Must have (table stakes):**
- Hero section с AI demo — пользователи ожидают увидеть продукт в действии, typing → gantt animation уже реализован в gantt-hero.html
- Navigation bar — ориентация на сайте, ссылки Features/Templates/FAQ, CTA кнопки
- Template library (/templates) — SEO goldmine, 8-12 starter templates с категоризацией
- FAQ section — 10 вопросов для обработки возражений (features, pricing, onboarding, data)
- Legal pages — Privacy + Terms требуются app stores/payments processors
- SEO basics — sitemap.xml, robots.txt, meta tags, OG tags для discoverability
- Responsive design — 50%+ трафика с мобильных устройств в 2026

**Should have (competitive):**
- AI-first hero demo — интерактивный typing demo → gantt за 1.4s, дифференциатор от конкурентов (только screenshots)
- Real-time preview — мини gantt chart с анимацией, показывает value prop лучше чем скриншоты
- Russian-first — большинство PM tools English-first, локализация с начала
- Template detail pages (/templates/[slug]) — SEO для long-tail keywords ("маркетинговый план шаблон")
- Social proof — "12,000+ teams", аватары, рейтинг

**Defer (v2+):**
- Blog — требует ongoing редакторскую работу, стартовать с templates/library pages
- Pricing page — нет pricing model, CTA к app позволяет отложить
- Live chat widget — требует staffing, email contact form достаточен для v1
- Multi-language — dilutes focus, Russian-first затем расширение

### Architecture Approach

**Major components:**
1. **packages/site (Astro)** — Marketing/SEO контент, статические страницы, CTA к app — pre-rendered HTML для SEO, zero-JS по умолчанию
2. **packages/web (React)** — Интерактивный редактор, auth, stays on ai.getgantt.ru — unchanged, relative URLs для API/WebSocket
3. **packages/server (Fastify)** — REST API + WebSocket, unchanged — stays coupled с web на ai.getgantt.ru
4. **packages/mcp** — AI integration, unrelated к frontend архитектуре — unchanged

**Key patterns:**
- **Static Site Generator для маркетинга** — pre-render всех страниц на build time, SEO-friendly HTML
- **Same-origin API calls** — frontend и backend на одном домене (ai.getgantt.ru), no CORS needed
- **Subdomain separation** — маркетинг на root domain, app на subdomain, независимые deployment cycles

**Integration points:**
- CTA links (site → app): Absolute URLs `https://ai.getgantt.ru`, no state sharing
- Share links (app → app): Stay on ai.getgantt.ru, use `Host` header (already implemented)
- API/WebSocket: Relative URLs, subdomain-transparent (already implemented)

### Critical Pitfalls

1. **Share links с неверным origin** — Текущий код генерирует URL из `req.headers.host`, после миграции share links должны быть на ai.getgantt.ru. Решение: Использовать `PUBLIC_SHARE_URL` env variable вместо динамического определения.

2. **WebSocket Connection Fails на новом домене** — Нет explicit CORS настроек для WebSocket upgrade в nginx. Решение: Добавить CORS headers для WebSocket endpoint, убедиться что доступен только на ai.getgantt.ru.

3. **Auth Tokens не работают между доменами** — `localStorage` имеет same-origin policy, токены на ai.getgantt.ru не доступны на getgantt.ru. Решение: Astro site stateless, все CTA ведут на ai.getgantt.ru где есть auth, не пытаться shared auth между доменами.

4. **API Calls с относительными путями** — На getgantt.ru нет backend, запросы к `/api/...` вернут 404. Решение: Astro site не делает API calls, app использует relative URLs (уже реализовано).

5. **SEO дубликаты между доменами** — Google индексирует один контент на двух доменах, duplicate content penalty. Решение: Canonical URLs в Astro, robots.txt на ai.getgantt.ru с `Disallow: /`.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Astro Site Foundation
**Rationale:** Zero-risk phase — создаём marketing site без изменений в существующем app. Позволяет проверить Astro stack и дизайн до миграции доменов.

**Delivers:**
- packages/site с Astro 5.0 + React + Tailwind интеграциями
- Базовые страницы: /, /features, /faq, /privacy, /terms
- Hero section с AI demo (port из gantt-hero.html)
- Navigation bar, footer, responsive layout
- SEO basics: sitemap.xml, robots.txt, meta tags

**Addresses:**
- Table stakes: Hero, Navigation, Feature overview, FAQ, Legal pages, SEO basics, Responsive design
- Differentiators: AI-first hero demo, real-time preview, Russian-first

**Avoids:**
- Pitfall 3 (Auth tokens cross-domain) — Astro site полностью stateless, no auth

**Stack used:** Astro, @astrojs/react, @astrojs/tailwind, @astrojs/sitemap, schema-dts

### Phase 2: Template Library & Content
**Rationale:** SEO goldmine — template pages ранжируют для long-tail keywords. Добавляется после базовой структуры сайта.

**Delivers:**
- /templates страница с 8 starter templates
- /templates/[slug] detail pages с описаниями
- Template cards с preview images
- CTA "Use this template" → ai.getgantt.ru/?template=[slug]

**Addresses:**
- Table stakes: Template library
- Differentiators: Template SEO, multi-input format hints, project type tags

**Avoids:**
- Pitfall 6 (SEO duplicates) — правильные canonical URLs, только на getgantt.ru

**Stack used:** Astro content collections для template data

### Phase 3: Domain Separation & Deployment
**Rationale:** Критическая фаза миграции — разделяем деплой на 2 домена. Требует настройки CORS и nginx.

**Delivers:**
- Dockerfile.site для Astro static build → nginx:alpine
- CapRover app gantt-site для getgantt.ru
- CapRover app gantt-app (existing) для ai.getgantt.ru
- CORS настройки для WebSocket в nginx
- robots.txt на ai.getgantt.ru (Disallow: /)

**Addresses:**
- Architecture: Multi-domain deployment, static site hosting

**Avoids:**
- Pitfall 2 (WebSocket fails) — explicit CORS headers для WebSocket upgrade
- Pitfall 4 (API calls 404) — nginx proxy настроен правильно для каждого домена
- Pitfall 5 (CORS errors) — @fastify/cors с whitelist origins

**Stack used:** nginx, CapRover multi-domain, @fastify/cors

### Phase 4: Share Links Migration
**Rationale:** Share links зависят от домена — нужно обновить генерацию URL после разделения.

**Delivers:**
- PUBLIC_SHARE_URL env variable для share link origin
- Обновление share link generation в packages/server
- Тестирование share links на ai.getgantt.ru
- Обновление тестов для ожидания ai.getgantt.ru в URL

**Addresses:**
- Architecture: Share links stay on app domain

**Avoids:**
- Pitfall 1 (Share links с неверным origin) — хардкодный origin через env variable

**Stack used:** Existing Fastify routes, env variables

### Phase 5: SEO & Analytics Enhancement
**Rationale:** SEO фундамент для индексации marketing site. Добавляется после того как сайт стабилен на проде.

**Delivers:**
- Canonical URLs на всех Astro pages
- JSON-LD структурированные данные (schema.org)
- Google Search Console verification
- Analytics integration (Plausible/Umami)
- Performance monitoring (Core Web Vitals)

**Addresses:**
- Table stakes: SEO basics (полностью)
- Differentiators: Template SEO (оптимизация meta descriptions)

**Avoids:**
- Pitfall 6 (SEO duplicates) — canonical tags, robots.txt на app

**Stack used:** schema-dts, Astro SEO API, analytics script

### Phase Ordering Rationale

- **Phase 1 → Phase 2:** Широкая воронка — сначала базовый сайт, затем SEO-контент. Templates зависят от base structure (navigation, layout).
- **Phase 2 → Phase 3:** Контент готов → деплой на отдельный домен. Нельзя деплоить на домен без контента.
- **Phase 3 → Phase 4:** Домены разделены → share links обновляются. Share links зависят от финального домена app.
- **Phase 3 → Phase 5:** Сайт на проде → SEO оптимизация. Canonical URLs и verification требуют live домена.

**Grouping based on architecture:**
- Phases 1-2: Content-focused (packages/site только)
- Phase 3-4: Infrastructure-focused (CapRover, nginx, CORS)
- Phase 5: Optimization-focused (SEO, analytics)

**Pitfall avoidance:**
- Auth cross-domain (Pitfall 3) — Phase 1 явно делает Astro stateless
- WebSocket CORS (Pitfall 2) — Phase 3 добавляет explicit nginx конфигурацию
- Share origin (Pitfall 1) — Phase 4 вводит env variable до поломки
- SEO duplicates (Pitfall 6) — Phase 5 добавляет canonical после индексации

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** CapRover-specific nginx конфигурация для WebSocket CORS — стандартные паттерны, но needs verification с actual CapRover setup
- **Phase 4:** Share link generation точное поведение с `Host` header — текущий код выглядит правильно, но needs staging тест с реальными доменами

Phases with standard patterns (skip research-phase):
- **Phase 1:** Astro setup, React/Tailwind integration — well-documented, boilerplate
- **Phase 2:** Astro content collections, template pages — стандартный pattern
- **Phase 5:** SEO basics, canonical URLs, schema.org — установленные практики

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Astro 5.x ecosystem проверенный, но web search был rate-limited — версии верифицированы через knowledge, не через npm view |
| Features | HIGH | Table stakes основаны на стандартных SaaS паттернах, differentiators подтверждены gantt-hero.html (production-ready дизайн) |
| Architecture | HIGH | Multi-domain separation стандартный паттерн, relative URLs уже реализованы в коде — migration будет минимальной |
| Pitfalls | MEDIUM | CORS/WebSocket/Same-origin анализ точный (основан на коде), но CapRover-specific настройки не верифицированы на практике |

**Overall confidence:** MEDIUM

Stack verification ограничен rate limits, но архитектурные решения подтверждены анализом текущего кода. Feature set основан на production-ready дизайне (gantt-hero.html) и стандартных SaaS паттернах.

### Gaps to Address

- **Real user testimonials:** Social proof использует placeholder "12,000+ teams" — нужны реальные цитаты для production
- **Actual template screenshots:** Template descriptions есть, но preview images требуются для cards
- **Pricing model undefined:** CTA к app позволяет отложить, но pricing page (v4.1+) требует бизнес-решение
- **CapRover nginx verification:** CORS настройки для WebSocket standard, но needs тест на actual CapRover instance
- **Integration roadmap:** Notion/Jira/Slack упомянуты как "coming soon", но нет timeline

**Как handles during planning/execution:**
- Templates/Tests: Создать placeholder screenshots для v1, заменить на реальные после первых users
- Pricing: Defer до v4.1+, использовать trial period в app
- CapRover: Phase 3 включает staging тест с реальными доменами перед production cut-over

## Sources

### Primary (HIGH confidence)
- **Current codebase analysis** — packages/web (relative URLs), packages/server (share link generation), nginx.conf (WebSocket proxy)
- **gantt-hero.html** — Production-ready hero design с typing demo, rotating words, social proof
- **Astro documentation (knowledge)** — Official API, content collections, SEO capabilities, integration patterns
- **astro-migration-plan.md** — `.planning/reference/astro-migration-plan.md` (confirms site-only scope, CTA strategy)

### Secondary (MEDIUM confidence)
- **SaaS marketing patterns (2024-2025)** — NNGroup landing page research, ProductHunt launch patterns, standard SaaS feature sets
- **CapRover multi-domain deployment** — Standard Docker container deployment patterns, not verified with actual CapRover docs (rate-limited)
- **Astro 5.x ecosystem** — Version compatibility inferred from late 2025 release knowledge

### Tertiary (LOW confidence)
- **CORS/WebSocket/Same-origin policy** — General browser security knowledge, not verified with official MDN/Web standards docs (rate-limited)
- **SEO best practices** — Google Search Central guidelines (2025) inferred knowledge, needs verification для actual implementation

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
