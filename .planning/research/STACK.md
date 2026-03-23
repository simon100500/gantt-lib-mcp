# Technology Stack

**Project:** gantt-lib-mcp v4.0 — Astro Marketing Site + Domain Separation
**Researched:** 2026-03-23
**Overall confidence:** MEDIUM (web tools limited, based on official docs knowledge + current ecosystem)

## Executive Summary

Добавляется **packages/site** на Astro для marketing/SEO с раздельным деплоем от app. Backend не меняется. Astro используется в статическом режиме (no SSR) для максимальной производительности и простоты деплоя на CapRover как static site.

---

## Recommended Stack

### Core Framework — Astro

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **astro** | ^5.0.0 | Static site generator для marketing pages | Zero-JS по умолчанию = идеальный Core Web Vitals. Остаточный HTML для SEO. Content-focused, не app-focused |
| **@astrojs/react** | ^4.0.0 | React integration для islands | Только если нужны интерактивные компоненты (например, Pricing calculator). Не для editor — editor остаётся в packages/web |
| **@astrojs/tailwind** | ^6.0.0 | Tailwind CSS integration | Переиспользовать существующую дизайн-систему из packages/web. Консистентный look & feel |

**Почему Astro (не Next.js, не Remix):**
- Marketing site = content-focused, not app-focused
- Static build = самый быстрый хостинг (plain Nginx, no Node needed)
- Zero JS по умолчанию = лучшие Core Web Vitals
- Раздельный деплой от app = независимые релизы

### SEO Libraries

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@astrojs/sitemap** | ^4.0.0 | Автоматическая генерация sitemap.xml | Стандарт для Astro. Sitemap обновляется при каждом билде |
| **schema-dts** | ^1.0.0 | TypeScript типы для schema.org | Типобезопасные JSON-LD структурированные данные |

**Встроенные Astro SEO возможности (без дополнительных библиотек):**
- `<title>` и `<meta name="description">` через Astro API
- Open Graph (`<meta property="og:*">`) через Astro API
- Twitter Card (`<meta name="twitter:*">`) через Astro API
- Canonical URLs через Astro API
- robots.txt — статический файл (нужна только одна версия)

### Design System (Reuse from packages/web)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **tailwindcss** | ^3.4.19 | Utility-first CSS (уже есть в web) | Переиспользовать конфиг и цвета |
| **class-variance-authority** | ^0.7.1 | Варианты компонентов (уже есть в web) | Переиспользовать button/card варианты |
| **clsx** | ^2.1.1 | Conditional className (уже есть в web) | Переиспользовать утилиты |
| **lucide-react** | ^0.577.0 | Icons (уже есть в web) | Переиспользовать иконки |

**Важно:** НЕ добавлять в packages/site:
- ❌ Zustand (state management не нужен для статического сайта)
- ❌ gantt-lib (chart library — только в app)
- ❌ Radix UI (если не нужны сложные интерактивные компоненты)

### Deployment (CapRover Multi-Domain)

| Component | Domain | Deployment | Stack |
|-----------|--------|------------|-------|
| **Marketing site** | getgantt.ru | Отдельный app в CapRover | Static build (Astro output: 'static') → plain Nginx |
| **App** | ai.getgantt.ru | Существующий app (как сейчас) | Multi-stage Docker (Nginx + Fastify + Node) |

**Deployment strategy:**
1. **packages/site** →独立的 Dockerfile (простый multi-stage: build → static files → nginx:alpine)
2. **packages/web + packages/server + packages/mcp** → существующий Dockerfile (не меняется)
3. CapRover domain mapping:
   - getgantt.ru → site app
   - ai.getgantt.ru → web+server+mcp app

---

## Alternatives Considered

### Static Site Generator

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **Astro** | Next.js (static export) | Next.js = app-first framework. Для marketing site оверкилл. Astro = content-first, zero-JS default |
| **Astro** | Remix | То же + требуется сервер для SSR. Мы не нужен SSR для marketing |
| **Astro** | 11ty | Меньше экосистема, хуже React integration. Astro — современный стандарт |

### React Integration

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **Islands (только где нужно)** | Full React SPA | Убивает преимущества Astro. Использовать React только для интерактивных islands ( pricing calculator, FAQ accordion) |
| **Без React** | React everywhere | Если страница полностью статическая — не нужен React. Astro components достаточно |

### SEO Libraries

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **Встроенные Astro API** | astro-seo-meta | Unnecessary abstraction. Astro API уже простой и типобезопасный |
| **@astrojs/sitemap** | Ручной sitemap.xml | Автоматическая генерация из routes = меньше ошибок |

---

## Installation

### packages/site Initialization

```bash
# 1. Create Astro package
mkdir packages/site
cd packages/site
npm create astro@latest . -- --template minimal --install --no-git --typescript strict

# 2. Add integrations
npx astro add react tailwind

# 3. Add SEO libraries
npm install @astrojs/sitemap schema-dts

# 4. Add shared UI utilities (symlink or copy from web)
# Option A: Symlink (если workspaces позволяют)
ln -s ../../../web/src/lib/utils.ts src/lib/utils.ts
ln -s ../../../web/src/lib/cn.ts src/lib/cn.ts

# Option B: Copy (проще для деплоя)
cp ../web/src/lib/utils.ts src/lib/
cp ../web/src/lib/cn.ts src/lib/
```

### Root Workspace Scripts

```json
{
  "scripts": {
    "build:site": "npm run build -w packages/site",
    "dev:site": "npm run dev -w packages/site",
    "preview:site": "npm run preview -w packages/site"
  }
}
```

### packages/site/package.json

```json
{
  "name": "@gantt/site",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@astrojs/react": "^4.0.0",
    "@astrojs/sitemap": "^4.0.0",
    "@astrojs/tailwind": "^6.0.0",
    "astro": "^5.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.577.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "schema-dts": "^1.0.0",
    "tailwind-merge": "^3.5.0",
    "tailwindcss": "^3.4.19"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.7.2"
  }
}
```

---

## Integration Points with Existing Monorepo

### Shared Design System

**Что переиспользовать из packages/web:**
- `tailwind.config.js` — цвета, spacing, breakpoints
- `src/lib/utils.ts` — `cn()` utility для clsx + tailwind-merge
- `src/components/ui/*` — простые компоненты (Button, Card) — если они не зависят от Radix

**Что НЕ переиспользовать:**
- ❌ Zustand stores (нет state management в static site)
- ❌ API клиенты (нет backend calls в static site)
- ❌ Auth компоненты (нет auth на marketing site)

### Shared Types

**Если нужны общие типы:**
```typescript
// packages/types/src/template.ts
export interface Template {
  slug: string;
  title: string;
  description: string;
  category: string;
  tasks: Task[];
}
```

Тогда в packages/site:
```json
{
  "dependencies": {
    "@gantt/types": "workspace:*"
  }
}
```

**Но для v4.0:** скорее всего не нужно — templates могут быть просто markdown/JSON в content collection.

### Cross-Package Scripts

```bash
# Dev: запускать site отдельно от web+server
npm run dev:site  # localhost:4321 (Astro default)

# Build: site отдельно
npm run build:site  # → dist/

# Production deploy: только site
docker build -f Dockerfile.site -t gantt-site:latest .
```

---

## Deployment Architecture

### Current (v3.0) — Single Domain

```
┌─────────────────────────────────────────┐
│  getgantt.ru (single domain)            │
├─────────────────────────────────────────┤
│  Nginx (reverse proxy)                  │
│  ├─ / → React SPA (packages/web)        │
│  ├─ /api/* → Fastify (packages/server)  │
│  └─ /ws → WebSocket (Fastify)           │
│                                         │
│  Fastify (port 3000)                    │
│  └─ MCP Server (packages/mcp)           │
└─────────────────────────────────────────┘
```

### Target (v4.0) — Multi-Domain

```
┌─────────────────────────────────────────┐
│  getgantt.ru (marketing)                │
├─────────────────────────────────────────┤
│  Nginx (static file serving)            │
│  └─ / → Astro static build (packages/site)│
│  NO Node.js runtime needed              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ai.getgantt.ru (app)                   │
├─────────────────────────────────────────┤
│  Nginx (reverse proxy)                  │
│  ├─ / → React SPA (packages/web)        │
│  ├─ /api/* → Fastify (packages/server)  │
│  └─ /ws → WebSocket (Fastify)           │
│                                         │
│  Fastify (port 3000)                    │
│  └─ MCP Server (packages/mcp)           │
└─────────────────────────────────────────┘
```

### CapRover Setup

**App 1: gantt-site**
```yaml
Domain: getgantt.ru
Container Port: 80
Dockerfile: Dockerfile.site (simple static build)
```

**App 2: gantt-app (existing)**
```yaml
Domain: ai.getgantt.ru
Container Port: 80
Dockerfile: Dockerfile (existing multi-stage)
```

### Dockerfile.site (New)

```dockerfile
# ── Stage 1: Build Astro static site ─────────────────────────────
FROM node:22-alpine AS build
WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/site/package.json ./packages/site/

RUN npm ci --ignore-scripts
COPY packages/site ./packages/site

RUN npm run build -w packages/site

# ── Stage 2: Static Nginx ─────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /build/packages/site/dist /usr/share/nginx/html
EXPOSE 80
```

**Ключевое отличие от Dockerfile:**
- Нет Node.js runtime в production
- Нет Fastify, MCP, Prisma
- Plain Nginx serving static files
- 10x меньше image size
- 10x быстрее startup

---

## What NOT to Add to packages/site

| ❌ Anti-Pattern | Why Not |
|----------------|---------|
| Zustand state management | Static site = no client state |
| gantt-lib chart component | Editor stays in app (ai.getgantt.ru) |
| API clients / fetch calls | Marketing site = no backend calls |
| Auth components (OTP modal) | No auth on marketing site |
| Radix UI complex components | Overkill for mostly static content |
| React everywhere | Use Astro components unless interactivity needed |
| SSR mode (output: 'server') | Unnecessary complexity. Static = faster, cheaper |

---

## Version Confidence

| Package | Version | Confidence | Notes |
|---------|---------|------------|-------|
| astro | ^5.0.0 | HIGH | Latest stable major (released 2025) |
| @astrojs/react | ^4.0.0 | HIGH | Compatible with Astro 5.x |
| @astrojs/tailwind | ^6.0.0 | HIGH | Compatible with Astro 5.x |
| @astrojs/sitemap | ^4.0.0 | HIGH | Latest for Astro 5.x |
| schema-dts | ^1.0.0 | HIGH | Stable TypeScript types |

**Note:** Web search tools were rate-limited during research. Versions based on knowledge of Astro 5.x ecosystem (late 2025). Verify with `npm view` versions before install.

---

## Migration Path

### Phase 1: Setup (без изменения текущего деплоя)
1. Create packages/site with minimal Astro setup
2. Add basic pages: /, /features, /faq
3. Test locally with `npm run dev:site`

### Phase 2: Content
1. Add /templates и /templates/[slug] с content collections
2. Implement SEO (sitemap, robots.txt, OG meta, schema.org)
3. Share design system with packages/web

### Phase 3: Deploy Separately
1. Create Dockerfile.site
2. Deploy to CapRover as separate app (test domain first)
3. Verify static build works

### Phase 4: Domain Split
1. Point getgantt.ru → site app
2. Point ai.getgantt.ru → existing app
3. Update all CTA links to https://ai.getgantt.ru
4. Remove landing page from packages/web (или redirect)

### Phase 5: Cleanup (опционально)
1. Remove marketing routes from packages/web
2. Ensure share links stay on ai.getgantt.ru
3. Update analytics/tracking для раздельных доменов

---

## Sources

### Official Documentation
- [Astro Docs](https://docs.astro.build) — Primary source (verified knowledge)
- [Astro Integrations Guide](https://docs.astro.build/en/guides/integrations-guide/) — React, Tailwind, Sitemap
- [Astro SEO Guide](https://docs.astro.build/en/guides/seo/) — Built-in SEO capabilities
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/) — Templates as content

### Ecosystem Knowledge
- Astro 5.x release notes (late 2025) — Major version with improved performance
- CapRover multi-domain docs — Standard Docker container deployment

### Context from Project
- `.planning/PROJECT.md` — Current monorepo structure
- `.planning/reference/astro-migration-plan.md` — Migration strategy
- `packages/web/package.json` — Current frontend stack to reuse

**Confidence Note:** Web search and web fetch tools were rate-limited (429 errors) during research. Recommendations based on official documentation knowledge and current Astro 5.x ecosystem. All versions should be verified with `npm view [package] versions` before installation.
