План
  Цель: вынести публичный сайт на Astro под getgantt.ru, а текущее приложение оставить отдельным продуктом на
  ai.getgantt.ru, не ломая backend и не смешивая marketing с editor.

  Целевая архитектура

  - getgantt.ru только marketing/SEO
  - ai.getgantt.ru только app
  - backend остаётся рядом с app, а не с сайтом

  Монорепо

  packages/
    site/      # Astro
    web/       # текущий Vite React editor
    server/    # Fastify
    mcp/       # как сейчас

  Этап 1. Разделить зоны ответственности

  - Зафиксировать, что всё публичное уходит в site
  - Зафиксировать, что editor, auth, проекты, chat, ws остаются в web + server
  - Убрать из marketing scope любые продуктовые stateful флоу

  Что входит в site:

  - главная
  - лендинг фич
  - pricing/faq/docs-lite
  - страницы шаблонов
  - SEO-страницы
  - CTA на ai.getgantt.ru

  Что не входит в site:

  - редактор
  - OTP/login
  - проекты
  - chat
  - realtime

  Этап 2. Подготовить домены

  - getgantt.ru -> Astro app
  - www.getgantt.ru -> редирект на getgantt.ru
  - ai.getgantt.ru -> React app
  - backend оставить на том же ai.getgantt.ru
  
  Этап 3. Создать packages/site на Astro

  - Инициализировать Astro как отдельный пакет
  - Подключить базовую дизайн-систему сайта
  - Настроить sitemap, robots, canonical, OG, favicon, analytics
  - Добавить React integration только если реально нужны отдельные интерактивные islands
  - Для деплоя на Caprover для Astro будет отдельный Dockerfile (там можно указывать кастомный путь)

  Важно:

  - не тащить в Astro текущий app UI
  - Astro здесь должен быть лёгким публичным фронтом

  Этап 4. Сделать информационную архитектуру сайта
  Минимальный набор страниц:

  - /
  - /templates
  - /templates/[slug]
  - /features
  - /faq
  - /privacy
  - /terms

  На будущее (потом):

  - /blog
  - /compare/*
  - /use-cases/*

  На всех CTA:

  - кнопка Open app -> https://ai.getgantt.ru

  Этап 5. Шаблоны

  - шаблоны как контентные страницы в Astro
  - каждая страница шаблона индексируется
  - внутри страницы превью, описание, use case, CTA “Use this template in app”

  Этап 6. Подготовить app к жизни на поддомене
  Для packages/web:

  - проверить все абсолютные/относительные URL
  - убедиться, что fetch('/api/...') работает на ai.getgantt.ru
  - убедиться, что WebSocket на /ws работает на ai.getgantt.ru
  - проверить генерацию share links и origin-dependent logic

  Особенно проверить:

  - packages/server/src/routes/auth-routes.ts:259
    Сейчас share URL строится от origin/host запроса. После разделения доменов надо решить:
  - share pages должны вести на getgantt.ru/share/...
  - app links должны вести на ai.getgantt.ru

  Это место почти точно придётся поправить.

  Этап 7. Стратегия для share links
  
  Share остаётся на ai.getgantt.ru. Мы пока не будем выводить графики в публичный доступ.

  Этап 8. Разделить деплой
  Поднять 2 независимых deployment units:

  - site
  - web + server + mcp (как сейчас)

  Тогда:

  - правки лендинга не перезапускают backend
  - правки приложения не затрагивают лендинг

  Этап 9. Настроить CapRover
  Минимально:
  - отдельный дополнительный app для site

  Роутинг по доменам:

  - getgantt.ru -> site
  - ai.getgantt.ru -> web
  - backend за ai.getgantt.ru/api и /ws

  Этап 10. SEO-фундамент
  В site сразу сделать:

  - нормальные title/description на каждой странице
  - OG/Twitter metadata
  - sitemap.xml
  - robots.txt
  - canonical URLs
  - schema.org для landing/template pages
  - человекочитаемые URL для шаблонов

  Этап 12. Миграция без риска
  Порядок внедрения:

  1. Поднять Astro как отдельный пакет
  2. Выкатить пустой/минимальный getgantt.ru
  3. Оставить app как есть на ai.getgantt.ru
  4. Перенести лендинг и template pages
  5. Потом отдельно перевести public share pages, если нужно

  Что не делать

  - не переносить editor в Astro
  - не объединять marketing и product обратно в один контейнер
  - не трогать Fastify ради этого milestone
  - не начинать с переделки auth