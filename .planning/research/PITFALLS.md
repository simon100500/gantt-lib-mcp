# Pitfalls Research

**Domain:** Astro marketing site + domain split для SaaS приложения
**Researched:** 2026-03-23
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Share Links с неверным origin

**What goes wrong:**
После разделения доменов share links будут генерироваться с неправильным origin. Текущий код в `packages/server/src/routes/auth-routes.ts:260-263` использует `req.headers.host` для построения URL:
```typescript
const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
const host = req.headers.host ?? 'localhost:3000';
const origin = req.headers.origin ?? `${proto}://${host}`;
const url = `${origin}/?share=${encodeURIComponent(shareLink.id)}`;
```

Если запрос идёт с `ai.getgantt.ru`, то share link будет `https://ai.getgantt.ru/?share=...`, но для публичного доступа нужен `https://getgantt.ru/?share=...` или наоборот.

**Why it happens:**
Код не учитывает, что после разделения доменов будет два разных origin:
- `getgantt.ru` — маркетинг и публичные share страницы
- `ai.getgantt.ru` — приложение

**How to avoid:**
1. Определить заранее: где будут жить share страницы (в app или на marketing сайте)
2. Хардкодить правильный origin для share links в конфигурации
3. Использовать переменную окружения `PUBLIC_SHARE_URL` вместо динамического определения

**Warning signs:**
- Share links работают внутри app, но не открываются при публикации
- При клике на share link открывается app вместо публичной страницы
- SEO ссылки не индексируются

**Phase to address:**
Phase 2 — до разделения деплоя нужно определить архитектуру share links

---

### Pitfall 2: WebSocket Connection Fails на новом домене

**What goes wrong:**
WebSocket подключение к `/ws` перестанет работать после разделения доменов. Текущая конфигурация в `nginx.conf:18-25` проксирует `/ws` на backend, но нет явной настройки CORS для WebSocket.

**Why it happens:**
При разделении доменов:
- Frontend на `ai.getgantt.ru` подключается к WebSocket
- Astro на `getgantt.ru` может пытаться подключиться к тому же WebSocket
- Браузеры блокируют cross-origin WebSocket если не настроены заголовки

**How to avoid:**
1. Добавить explicit CORS настройки для WebSocket upgrade в nginx
2. Убедиться что WebSocket endpoint доступен только на `ai.getgantt.ru`
3. Не подключаться к WebSocket из Astro (marketing site stateless)

```nginx
# В nginx.conf для ai.getgantt.ru
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    server_name ai.getgantt.ru;

    location /ws {
        # CORS заголовки для WebSocket
        add_header Access-Control-Allow-Origin https://ai.getgantt.ru;
        add_header Access-Control-Allow-Credentials true;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
```

**Warning signs:**
- WebSocket reconnect loops в консоли браузера
- Real-time sync не работает после миграции
- Ошибки "WebSocket connection failed" в devtools

**Phase to address:**
Phase 3 — настройка nginx для раздельных доменов

---

### Pitfall 3: Auth Tokens не работают между доменами

**What goes wrong:**
Пользователь логинится на `ai.getgantt.ru`, но при переходе на `getgantt.ru` его "разлогинивает". JWT токены в `localStorage` не доступны между доменами.

**Why it happens:**
`localStorage` имеет same-origin policy. Токены сохранённые на `ai.getgantt.ru` не доступны на `getgantt.ru`.

**How to avoid:**
1. **Не использовать shared auth между доменами** — это security risk
2. Astro site должен быть полностью stateless (без auth)
3. При клике CTA с getgantt.ru → ai.getgantt.ru перенаправлять без сохранения state
4. Если нужен auth state на marketing site — использовать subdomain cookies с `Domain=.getgantt.ru`

**Неправильно:**
```javascript
// На getgantt.ru
localStorage.getItem('gantt_access_token') // undefined
```

**Правильно:**
```javascript
// Astro site не использует auth
// Все CTA ведут на ai.getgantt.ru где есть auth
<a href="https://ai.getgantt.ru">Open App</a>
```

**Warning signs:**
- Пользователь "вышел из системы" при переходе между доменами
- Auth state теряется после редиректа
- Непонятные UX loops (login → redirect → logout → login)

**Phase to address:**
Phase 1 — архитектурное решение: какой домен главный для auth

---

### Pitfall 4: API Calls с относительными путями ломаются

**What goes wrong:**
После разделения доменов fetch('/api/...') перестанет работать. Текущий код в `App.tsx:161` использует относительные пути:
```typescript
let response = await fetch('/api/chat', {
```

**Why it happens:**
На `getgantt.ru` нет backend — только Astro static files. Запросы к `/api/...` будут возвращать 404.

**How to avoid:**
1. Все API calls должны быть с absolute URL или через proxy
2. Astro site не должен делать API calls к backend
3. Если нужен dynamic content на Astro — использовать SSR или API routes

**Вариант 1: Proxy через nginx**
```nginx
# На getgantt.ru не проксировать /api
# На ai.getgantt.ru проксировать как сейчас
```

**Вариант 2: Absolute URL в app**
```typescript
// В packages/web/src/config.ts
const API_BASE = import.meta.env.VITE_API_URL || '';

// Использовать
fetch(`${API_BASE}/api/chat`, ...)
```

**Warning signs:**
- 404 errors на всех API endpoints после миграции
- CORS errors в консоли
- Application "dead" после деплоя

**Phase to address:**
Phase 3 — настройка nginx для раздельных доменов

---

### Pitfall 5: CORS не настроен для cross-origin requests

**What goes wrong:**
Если Astro или app на одном домене будут пытаться делать запросы к API на другом домене — получат CORS error.

**Why it happens:**
Fastify не имеет CORS middleware. Текущий код в `packages/server` не настраивает CORS headers.

**How to avoid:**
1. Добавить `@fastify/cors` в Fastify
2. Настроить whitelist origins:
   - `https://ai.getgantt.ru` для app
   - `https://getgantt.ru` для share links (если нужно)

```typescript
// packages/server/src/server.ts
import cors from '@fastify/cors';

await fastify.register(cors, {
  origin: [
    'https://ai.getgantt.ru',
    'https://getgantt.ru', // если нужен cross-origin
  ],
  credentials: true,
});
```

**Warning signs:**
- "Access-Control-Allow-Origin missing" в консоли
- Preflight OPTIONS requests падают
- CORS error в devtools

**Phase to address:**
Phase 3 — настройка CORS перед разделением доменов

---

### Pitfall 6: SEO и канонические URL дублируются

**What goes wrong:**
После миграции Google будет индексировать один и тот же контент на двух доменах. Duplicate content penalty.

**Why it happens:**
- `getgantt.ru/templates/...` — маркетинг
- `ai.getgantt.ru/templates/...` — может быть редирект или копия

**How to avoid:**
1. Настроить canonical URLs в Astro
2. Использовать `<link rel="canonical">` на всех страницах
3. Не индексировать `ai.getgantt.ru` (robots.txt)

```astro
---
// packages/site/src/pages/templates/[slug].astro
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---

<link rel="canonical" href={canonicalURL} />
```

```txt
# ai.getgantt.ru/robots.txt
User-agent: *
Disallow: /
```

**Warning signs:**
- Дублирование страниц в Google Search Console
- Падение organic traffic после миграции
- "Duplicate without user-selected canonical" warnings

**Phase to address:**
Phase 5 — SEO фундамент для Astro

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Share links с динамическим origin | Быстрый старт | Поломка после миграции на разные домены | Только для single-domain setup |
| Относительные URL для API | Простой код | Невозможность разделить домены | Никогда — заранее архитектить |
| localStorage для auth | Простая реализация | Нет shared auth между доменами | Только если не нужен cross-domain auth |
| Хардкод доменов в коде | Быстрый деплой | Сложно переименовать/мигрировать | Использовать env variables |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Astro → React App | Inline React components в Astro | Отдельные деплои, редиректы |
| Share Links | Генерация URL из request headers | Конфигурация через env variables |
| WebSocket | Один endpoint для всех доменов | Разные endpoints, explicit CORS |
| Authentication | Попытка shared state между доменами | Auth только на app домене |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Too many Astro islands | Медленная загрузка маркетинга | Минимизировать React islands, использовать static HTML | При >5 islands на страницу |
| Unoptimized images на Astro | Low Core Web Vitals | Использовать `<Image>` из Astro | Сразу после запуска |
| WebSocket leaks в app | Падение backend при многих пользователях | Proper cleanup on unmount | При >100 concurrent connections |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shared auth cookies между доменами | XSS на marketing site компрометирует app | Auth только на app domain, HTTP-only cookies |
| CORS * для всех origins | Атаки CSRF | Whitelist origins |
| Отсутствие CSP headers | XSS атаки | Добавить Content-Security-Policy в nginx |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Редирект getgantt.ru → ai.getgantt.ru без объяснения | Пользователи теряются, думают что сайт сломан | Явный CTA "Open App" с объяснением |
| Share links на ai.getgantt.ru вместо getgantt.ru | SEO не работает, нельзя делиться публично | Share pages на marketing domain |
| Login modal на marketing site | Пользователи пытаются логиниться не там | Ясное разделение: маркетинг vs app |

## "Looks Done But Isn't" Checklist

- [ ] **Astro deployment:** Часто забывают про static asset path — verify все изображения и CSS загружаются
- [ ] **Share links:** Работают в dev но не в prod из-за origin — verify на staging с реальными доменами
- [ ] **WebSocket:** Работает в dev но не через SSL — verify с HTTPS/WSS
- [ ] **Auth redirects:** Работают на одном домене но не после split — verify с двумя доменами
- [ ] **SEO:** Meta tags есть но не индексируется — verify через Google Search Console

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Share links с неверным origin | LOW | Добавить env variable `PUBLIC_SHARE_URL`, redeploy server |
| WebSocket не работает | MEDIUM | Добавить CORS headers в nginx, reload config |
| Auth токены не работают | HIGH | Архитектурное решение: какой домен для auth, редиректы |
| API calls 404 | MEDIUM | Настроить nginx proxy или absolute URLs |
| SEO дубликаты | MEDIUM | Добавить canonical, robots.txt, sitemap |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Share links origin | Phase 1 — архитектура share links | Тест на staging с реальными доменами |
| WebSocket CORS | Phase 3 — nginx конфигурация | Проверить connection из browser devtools |
| Auth tokens cross-domain | Phase 1 — решение какой домен для auth | Тест login flow между доменами |
| API relative paths | Phase 3 — nginx proxy или absolute URLs | Проверить все API calls в network tab |
| CORS headers | Phase 3 — Fastify CORS middleware | Preflight OPTIONS request проверка |
| SEO duplicates | Phase 5 — Astro SEO фундамент | Google Search Console проверка |

## Sources

- MEDIUM CONFIDENCE: Анализ текущего кода (auth-routes.ts:260-263, App.tsx, nginx.conf)
- MEDIUM CONFIDENCE: Astro migration plan из .planning/reference/astro-migration-plan.md
- LOW CONFIDENCE: Общие знания о CORS, WebSocket, same-origin policy (не верифицировано с официальными источниками из-за limit на external API calls)

---
*Pitfalls research for: Astro marketing site + domain split migration*
*Researched: 2026-03-23*
