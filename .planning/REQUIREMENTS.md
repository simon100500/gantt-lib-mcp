# Requirements: Milestone v4.0 Astro Landing

**Milestone:** v4.0 Astro Landing
**Status:** Active
**Last updated:** 2026-03-23

## Overview

Разделение marketing и app — создание Astro сайта на getgantt.ru с интерактивным preview, оставив редактор на ai.getgantt.ru.

## v4.0 Requirements

### SITE — Site Foundation

Базовая инфраструктура Astro сайта для маркетинга.

- [ ] **SITE-01:** Пользователь может увидеть маркетинговый сайт на Astro с базовыми страницами
- [ ] **SITE-02:** Пользователь может ориентироваться на сайте через navigation bar (logo, ссылки Features/FAQ, CTA кнопки)
- [ ] **SITE-03:** Пользователь может найти footer со ссылками на все страницы и копирайтом
- [ ] **SITE-04:** Пользователь видит кастомную 404 страницу с CTA на главную вместо стандартной ошибки
- [ ] **SITE-05:** Пользователь может пользоваться сайтом на мобильных устройствах (responsive design, breakpoints 768px/1024px)

### HERO — Hero & Conversion

Главная секция с AI demo и конверсией в app.

- [ ] **HERO-01:** Пользователь видит hero section с rotating value props ("Из текста/сметы/брифа/ТЗ/письма/таблицы → Гантт за 30 секунд")
- [ ] **HERO-02:** Пользователь видит AI typing demo с анимацией (текст печатается → gantt генерируется)
- [ ] **HERO-03:** Пользователь видит social proof (аватары, рейтинг "★★★★★", "12,000+ teams")
- [ ] **HERO-04:** Пользователь может нажать CTA кнопку "Попробовать бесплатно" → переходит на ai.getgantt.ru
- [ ] **HERO-05:** Пользователь может нажать CTA кнопку "Смотреть демо" → скроллит к demo секции

### INTER — Interactive Gantt Preview

Интерактивный график на главной через Astro islands с gantt-lib.

- [ ] **INTER-01:** Пользователь может видеть интерактивный gantt chart на главной странице (rendered через Astro islands)
- [ ] **INTER-02:** Пользователь может двигать задачи на графике (drag-to-edit работает через gantt-lib)
- [ ] **INTER-03:** Пользователь может менять длительность задач через растягивание
- [ ] **INTER-04:** Пользователь может сворачивать/разворачивать parent tasks
- [ ] **INTER-05:** Разработчик может использовать gantt-lib через Astro islands (iframe если нужен для изоляции)

### CONTENT — Content & SEO

Контентные страницы и SEO фундамент.

- [ ] **CONTENT-01:** Пользователь может прочитать overview фич продукта на странице /features (6-8 фич с описаниями)
- [ ] **CONTENT-02:** Пользователь может найти ответы на частые вопросы на странице /faq (10 вопросов: features, pricing, onboarding, data)
- [x] **CONTENT-03:** Пользователь может прочитать Privacy Policy на странице /privacy
- [x] **CONTENT-04:** Пользователь может прочитать Terms of Service на странице /terms
- [x] **CONTENT-05:** Поисковые системы могут discover сайт через sitemap.xml
- [x] **CONTENT-06:** Поисковые системы понимают правила индексации через robots.txt
- [ ] **CONTENT-07:** Каждая страница имеет правильные meta title, description, OG tags для соцсетей

### DEPLOY — Deployment & Domains

Раздельный деплой и настройка доменов.

- [ ] **DEPLOY-01:** packages/site собирается в static build для nginx (отдельный Dockerfile.site)
- [ ] **DEPLOY-02:** CapRover деплоит site как отдельный app (getgantt.ru)
- [ ] **DEPLOY-03:** CapRover деплоит app как отдельный app (ai.getgantt.ru)
- [ ] **DEPLOY-04:** WebSocket подключения работают с explicit CORS headers в nginx для ai.getgantt.ru
- [ ] **DEPLOY-05:** Share links генерируются с PUBLIC_SHARE_URL env variable (всегда ai.getgantt.ru)

## Future Requirements (v4.1+)

Требования отложенные на следующие milestones.

### Templates (v4.1+)

- [ ] **TPL-01:** Пользователь может просматривать библиотеку шаблонов на странице /templates (8 starter templates)
- [ ] **TPL-02:** Пользователь может открыть detail page шаблона /templates/[slug] с описанием
- [ ] **TPL-03:** Пользователь может нажать "Use this template" → переходит на ai.getgantt.ru/?template=[slug]
- [ ] **TPL-04:** Поисковые системы индексируют template pages для long-tail keywords

### Analytics (v4.1+)

- [ ] **AN-01:** Владелец может видеть traffic analytics через Plausible/Umami
- [ ] **AN-02:** Владелец может отслеживать Core Web Vitals через Search Console

### Enhanced SEO (v4.1+)

- [ ] **SEO-01:** Каждая страница имеет canonical URL
- [ ] **SEO-02:** Template pages имеют JSON-LD структурированные данные (schema.org)
- [ ] **SEO-03:** robots.txt на ai.getgantt.ru с Disallow: / (только getgantt.ru индексируется)

## Out of Scope

Функционал который не входит в milestone v4.0 с обоснованием.

| Feature | Reason |
|---------|--------|
| Template library (/templates) | Отложено на v4.1+ для фокусировки на интерактивном preview |
| Blog | Требует ongoing контент, стартуем с static pages |
| Pricing page | Нет pricing model, CTA на app позволяет отложить |
| Live chat widget | Требует staffing, email form sufficient для v1 |
| User accounts on site | Astro stateless, auth только на ai.getgantt.ru |
| Multi-language | Russian-first, расширение позже |
| Shareable projects на site | Share остается на ai.getgantt.ru |

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
| HERO-03 | 24 | Pending |
| HERO-04 | 24 | Complete |
| HERO-05 | 24 | Complete |
| INTER-01 | 25 | Pending |
| INTER-02 | 25 | Pending |
| INTER-03 | 25 | Pending |
| INTER-04 | 25 | Pending |
| INTER-05 | 25 | Pending |
| CONTENT-01 | 26 | Complete |
| CONTENT-02 | 26 | Complete |
| CONTENT-03 | 26 | Complete |
| CONTENT-04 | 26 | Complete |
| CONTENT-05 | 26 | Complete |
| CONTENT-06 | 26 | Complete |
| CONTENT-07 | 26 | Complete |
| DEPLOY-01 | 27 | Complete |
| DEPLOY-02 | 27 | Complete |
| DEPLOY-03 | 27 | Complete |
| DEPLOY-04 | 27 | Complete |
| DEPLOY-05 | 27 | Complete |

**Coverage:** 27/27 requirements mapped to phases ✓

---

*Last updated: 2026-03-23*
