# Phase 24: Astro Site Foundation - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

## Phase Boundary

Создаём новый маркетинговый сайт на Astro (packages/site) для getgantt.ru. Редактор остаётся на ai.getgantt.ru.

**Deliverables:**
- Astro 5.0 проект в packages/site с React + Tailwind интеграцией
- Hero секция с rotating value props, AI typing demo, CTA кнопки
- Header navigation bar (logo, Features/FAQ ссылки, CTA кнопки)
- Footer с 3 колонками (Product, Company, Legal)
- Custom 404 страница с CTA на главную
- Responsive design (mobile-first, breakpoints 768px/1024px)

**Out of scope:**
- Interactive gantt preview (Phase 25)
- Content pages (/features, /faq, /privacy, /terms) (Phase 26)
- Domain separation и деплой (Phase 27)

## Implementation Decisions

### Hero Layout
- **D-01:** Stacked layout — заголовок сверху по центру, AI demo внизу на всю ширину
- Максимум внимания на AI demo, классический паттерн для продуктовых лендингов

### Hero: Rotating Value Props
- **D-02:** 3 rotating варианта: "Из текста/сметы/ТЗ → Гантт за 30 секунд"
- Typewriter effect анимация для ротации

### Hero: AI Demo Animation
- **D-03:** Typewriter → fade-in паттерн
- Текст печатается letter-by-letter, затем gantt chart появляется с fade-in эффектом
- Простая, понятная анимация без сложной механики

### Hero: Social Proof
- **D-04:** Минимум в hero — только CTA кнопка "Попробовать бесплатно"
- Аватарки, рейтинг и "12,000+ teams" — вынести в отдельный блок ниже или в content phase (26)

### Hero: CTA Buttons
- **D-05:** Primary + secondary стили для чёткого визуального приоритета
- Primary CTA: "Попробовать бесплатно" (indigo, ведет на ai.getgantt.ru)
- Secondary CTA: "Смотреть демо" (outline/ghost, скроллит к demo section placeholder)

### Design System: Colors
- **D-06:** Переиспользовать цветовую схему из packages/web
- Primary: indigo-violet (#6158e0 / hsl(245 70% 60%))
- Neutral: slate (background, foreground, muted)
- Консистентность между app и site

### Design System: Components
- **D-07:** Переиспользовать UI компоненты из packages/web/src/components/ui/
- Button, Card компоненты скопировать и адаптировать для packages/site
- Быстрее, единая дизайн-система

### Navigation: Header Layout
- **D-08:** Центрированный layout: logo слева, links (Features/FAQ) по центру, CTA справа
- Классический SaaS header pattern

### Navigation: Footer Structure
- **D-09:** Простой footer с 3 колонками
- Product: Features link
- Company: About, Contact
- Legal: Privacy, Terms
- Copyright строка внизу

### Responsive Strategy
- **D-10:** Mobile-first подход с Tailwind breakpoints
- Breakpoints: 768px (tablet), 1024px (desktop)
- Стандартный подход для Tailwind проектов

### Mobile Navigation
- **D-11:** Hamburger menu (три полоски) → drawer/sheet справа
- Стандартный mobile pattern для SaaS сайтов

### 404 Page
- **D-12:** Custom 404 страница с CTA кнопку на главную
- Дружелюбный дизайн вместо стандартной ошибки

### Claude's Discretion
- Exact timing для typewriter анимации
- Конкретный text content для rotating value props (формат)
- Drawer/sheet компонент выбор для mobile menu
- Footer spacing и typography детали

## Specific Ideas

- Stacked hero layout позволяет максимально выделить AI demo
- Typewriter → fade-in анимация проста в реализации и понятна пользователям
- Переиспользование colors/components ускоряет разработку и создаёт консистентный branding
- Hamburger menu — привычный pattern для mobile navigation

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Astro Migration Plan
- `.planning/reference/astro-migration-plan.md` — Полный план миграции на Astro, целевая архитектура, этапы

### Requirements
- `.planning/REQUIREMENTS.md` — SITE-01 through SITE-05, HERO-01 through HERO-05

### Design System Reference
- `packages/web/src/index.css` — HSL color переменные, Tailwind конфигурация
- `packages/web/tailwind.config.js` — Tailwind конфигурация для переиспользования
- `packages/web/src/components/ui/button.tsx` — Button компонент паттерн

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, architecture overview

## Existing Code Insights

### Reusable Assets
- **Colors:** `packages/web/src/index.css` — HSL переменные для переиспользования
- **Button:** `packages/web/src/components/ui/button.tsx` — компонент с variants (default, outline, ghost)
- **Tailwind config:** `packages/web/tailwind.config.js` — темы, цвета, breakpoints
- **Typography:** Roboto (body), Cascadia Mono (logo) — шрифты определены

### Established Patterns
- **Design tokens:** HSL format для цветов, CSS переменные в :root
- **Component variants:** class-variance-authority для button variants
- **Radius:** --radius: 0.375rem для консистентности
- **Scrollbar:** Thin scrollbars (5px) — можно переиспользовать

### Integration Points
- **New workspace:** packages/site — новый пакет, не зависит от packages/web runtime
- **CTA links:** Все CTA ведут на ai.getgantt.ru (absolute URLs)
- **Shared dependencies:** Tailwind, React (для islands), shadcn/ui паттерны

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 24-astro-site-foundation*
*Context gathered: 2026-03-23*
