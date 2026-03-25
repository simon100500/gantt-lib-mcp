---
phase: quick
plan: 260325-vu7
subsystem: site/pages
tags: [cleanup, accessibility, astro, visual]
key-files:
  modified:
    - packages/site/src/pages/features.astro
    - packages/site/src/pages/faq.astro
    - packages/site/src/pages/privacy.astro
    - packages/site/src/pages/terms.astro
decisions:
  - Убраны все fake visual panels из feature bands — страница стала однocolumn с max-width: 48rem на copy
  - DOM-порядок в faq hero приведён в соответствие визуальному (aside первым)
  - Убраны decorative cards на privacy и terms — страницы стали document-style
metrics:
  duration: 8min
  completed: "2026-03-25"
  tasks: 3
  files: 4
---

# Quick Task 260325-vu7: Redesign Content Pages Summary

**One-liner:** Удалены fake visual panels, decorative cards и stamp со всех контентных страниц — features, faq, privacy, terms стали чистыми документ-стилевыми страницами без декоративного мусора.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Clean up features.astro — remove fake visual column | `3f59aec` | features.astro |
| 2 | Clean up faq.astro — fix DOM order and aria | `283b679` | faq.astro |
| 3 | Clean up privacy.astro and terms.astro | `88be51b` | privacy.astro, terms.astro |

## Changes Made

### features.astro
- Удалён `.feature-band__visual` div из JSX-цикла (fake decorative panel с "Focus: {eyebrow}" и quote)
- Убрана логика `feature-band--reverse` и `index % 2 === 1` из class:list
- Убран 2-column grid (`grid-template-columns`) из `.feature-band__shell` в `@media (min-width: 900px)`
- Добавлен `max-width: 48rem` к `.feature-band__copy`
- Удалён весь CSS: `.feature-band__visual`, `.feature-band__visual-inner`, `.feature-band__line`, `.feature-band__metric`, `.feature-band__metric strong`, `.feature-band__quote`, `.feature-band--reverse` order rules
- Убран `.feature-band__metric span` из сгруппированного CSS-селектора
- В hero frame: `<i>` заменён на `<span>` для прогресс-баров (семантически корректно)

### faq.astro
- Поменян DOM-порядок в hero: `.faq-hero__aside` теперь первым, `.faq-hero__copy` вторым (соответствует визуальному порядку на desktop)
- Убраны `grid-column` overrides для `.faq-hero__copy` и `.faq-hero__aside` в `@media (min-width: 960px)` — больше не нужны
- Добавлен `aria-label="Навигация по разделам"` к `aside.faq-nav`

### privacy.astro
- Удалён `.privacy-hero__note` div (Scope card) из hero
- Убран радиальный gradient из `.privacy-hero` background — оставлен чистый linear-gradient
- Убран `.privacy-hero__note span` из сгруппированного CSS-селектора
- Удалены CSS блоки: `.privacy-hero__note`, `.privacy-hero__note strong`
- Убран `@media (min-width: 920px)` 2-column grid для hero
- Убрана `.privacy-hero__note p` из сгруппированного p-селектора

### terms.astro
- Удалён `.legal-hero__stamp` параграф ("GetGantt legal overview") из `.legal-hero__meta`
- Убран `.legal-hero__stamp` из сгруппированного CSS-селектора
- Упрощён `.legal-hero__meta`: убраны `display: flex` и `justify-content: space-between`

## Deviations from Plan

None - план выполнен точно как написан.

## Verification

- `astro build` прошёл без ошибок
- Все 6 страниц сгенерированы (404, faq, features, privacy, sitemap, terms, index)
- Сборка завершена за 7.55s

## Self-Check: PASSED

- `3f59aec` — feat(quick-260325-vu7): убрать fake visual column из feature bands
- `283b679` — feat(quick-260325-vu7): исправить DOM-порядок и добавить aria-label в faq.astro
- `88be51b` — feat(quick-260325-vu7): убрать декоративные элементы из privacy и terms
