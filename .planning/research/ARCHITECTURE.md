# Architecture Research

**Domain:** Marketing site + App domain split with Astro
**Researched:** 2026-03-23
**Confidence:** HIGH

## Current Architecture

### Single-Domain Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    CapRover: getgantt.ru                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Nginx (Port 80)                    │    │
│  │  ├─ / → React SPA (packages/web/dist)               │    │
│  │  ├─ /api/* → Fastify (127.0.0.1:3000)               │    │
│  │  ├─ /ws → WebSocket (127.0.0.1:3000)                │    │
│  │  └─ /admin/* → Fastify (127.0.0.1:3000)             │    │
│  └─────────────────────────────────────────────────────┘    │
│                              ↓                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Node.js Runtime (Port 3000)               │    │
│  │  ├─ Fastify Server (packages/server/dist)           │    │
│  │  ├─ MCP Server (packages/mcp/dist)                  │    │
│  │  └─ Prisma Client → PostgreSQL                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Nginx | Reverse proxy + static serving | Single config for all routes |
| React SPA | Interactive editor + auth | Vite build, served as static |
| Fastify | REST API + WebSocket | Express-like routing, /api prefix |
| MCP Server | AI tool integration | stdio transport, child process |
| Prisma | Database ORM | PostgreSQL connection pooling |

## Target Architecture

### Dual-Domain Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                  CapRover: 2 Apps                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         App 1: getgantt.ru (Astro Site)             │    │
│  │  ├─ Nginx (alpine)                                  │    │
│  │  ├─ Static build (packages/site/dist)               │    │
│  │  └─ Routes: /, /templates, /features, /faq, etc.    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │      App 2: ai.getgantt.ru (Web + Server + MCP)      │    │
│  │  ├─ Nginx (Port 80)                                 │    │
│  │  │  ├─ / → React SPA (packages/web/dist)            │    │
│  │  │  ├─ /api/* → Fastify (127.0.0.1:3000)            │    │
│  │  │  ├─ /ws → WebSocket (127.0.0.1:3000)             │    │
│  │  │  └─ /admin/* → Fastify (127.0.0.1:3000)          │    │
│  │  └─ Node.js Runtime (Port 3000)                     │    │
│  │     ├─ Fastify Server (packages/server/dist)        │    │
│  │     ├─ MCP Server (packages/mcp/dist)               │    │
│  │     └─ Prisma Client → PostgreSQL                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Domain Routing Strategy

| Domain | Purpose | Deployment | Content |
|--------|---------|------------|---------|
| getgantt.ru | Marketing/SEO | packages/site | Astro static build |
| www.getgantt.ru | Redirect | → getgantt.ru | 301 permanent redirect |
| ai.getgantt.ru | App | packages/web + server + mcp | React SPA + API + WS |
| api.getgantt.ru | Reserved | — | Future API documentation |

## Integration Points

### 1. CTA Links (Site → App)

**Pattern:** Absolute URLs to app domain

```typescript
// packages/site/src/components/OpenAppButton.astro
---
const APP_URL = 'https://ai.getgantt.ru';
---
<a href={`${APP_URL}${pathname}`} class="cta-button">
  Open in App
</a>
```

**Usage:**
- Hero section: → https://ai.getgantt.ru
- Template pages: → https://ai.getgantt.ru/?template=marketing
- Features: → https://ai.getgantt.ru (no deep linking needed)

**No changes required** in app — app continues to work on subdomain.

### 2. Share Links (App → App)

**Current behavior:** Share links use `origin` from request

```typescript
// packages/server/src/routes/auth-routes.ts:260-263
const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
const host = req.headers.host ?? 'localhost:3000';
const origin = req.headers.origin ?? `${proto}://${host}`;
const url = `${origin}/?share=${encodeURIComponent(shareLink.id)}`;
```

**After migration:** Share links stay on ai.getgantt.ru

**Required change:** Ensure `host` header is `ai.getgantt.ru` when CapRover routes requests

**Verification:**
```bash
# Test after migration
curl -H "Host: ai.getgantt.ru" https://ai.getgantt.ru/api/projects/:id/share
# Should return: { url: "https://ai.getgantt.ru/?share=..." }
```

**NO CODE CHANGE REQUIRED** — CapRover preserves Host header when routing to app container.

### 3. API Access Patterns

**Current:** Relative URLs in web app

```typescript
// packages/web/src/stores/useAuthStore.ts:167
const response = await fetch('/api/projects', { ... });
```

**After migration:** No changes — web app still on same origin as API

**WebSocket:** Also uses relative origin

```typescript
// packages/web/src/hooks/useWebSocket.ts:58
const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
```

**Result:** All API/WebSocket calls continue working without modification.

## Recommended Project Structure

### Monorepo After Migration

```
packages/
├── site/              # NEW: Astro marketing site
│   ├── src/
│   │   ├── pages/     # Astro file-based routing
│   │   │   ├── index.astro
│   │   │   ├── templates/
│   │   │   │   └── [slug].astro
│   │   │   ├── features.astro
│   │   │   ├── faq.astro
│   │   │   ├── privacy.astro
│   │   │   └── terms.astro
│   │   ├── components/
│   │   │   ├── Hero.astro
│   │   │   ├── FeatureCard.astro
│   │   │   ├── TemplateCard.astro
│   │   │   └── OpenAppButton.astro  # CTA to ai.getgantt.ru
│   │   └── layouts/
│   │       └── Layout.astro
│   ├── public/        # Static assets
│   ├── astro.config.mjs
│   └── package.json
│
├── web/               # UNCHANGED: React app
│   ├── src/
│   │   ├── components/
│   │   ├── stores/
│   │   ├── hooks/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── server/            # UNCHANGED: Fastify backend
│   ├── src/
│   │   ├── routes/
│   │   │   └── auth-routes.ts  # Share link generation (no change)
│   │   ├── index.ts
│   │   └── bootstrap.ts
│   └── package.json
│
└── mcp/               # UNCHANGED: MCP server
    ├── src/
    ├── agent/
    └── package.json
```

### Structure Rationale

- **packages/site/:** Isolated marketing concern, independent deployment cycle
- **packages/web/:** App concern, stays coupled with server (same origin)
- **packages/server/:** Backend logic, no changes for domain split
- **packages/mcp/:** AI integration, unrelated to frontend architecture

## Deployment Architecture

### Dockerfile Strategy

#### App Container (Existing - No Change)

```dockerfile
# packages/web + server + mcp (same Dockerfile)
# Build web → Build server → Runtime (Nginx + Node)
```

**Target:** ai.getgantt.ru
**CapRover App:** gantt-app
**Container Port:** 80
**Domains:** ai.getgantt.ru

#### Site Container (New - Astro)

```dockerfile
# packages/site/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Target:** getgantt.ru
**CapRover App:** gantt-site
**Container Port:** 80
**Domains:** getgantt.ru, www.getgantt.ru

### CapRover Configuration

#### App 1: gantt-site

```
Container HTTP Port: 80
Custom Domains:
  - getgantt.ru
  - www.getgantt.ru (redirect to getgantt.ru)
Environment Variables: (none - static site)
```

#### App 2: gantt-app

```
Container HTTP Port: 80
Custom Domains:
  - ai.getgantt.ru
Environment Variables:
  - DATABASE_URL
  - JWT_SECRET
  - OPENAI_API_KEY
  - OPENAI_BASE_URL
  - OPENAI_MODEL
```

## Data Flow

### User Journey: Site → App

```
[User lands on getgantt.ru]
    ↓
[Astro renders marketing page]
    ↓
[User clicks "Open App" CTA]
    ↓
[Navigate to https://ai.getgantt.ru]
    ↓
[React SPA loads, authenticates]
    ↓
[User creates project, shares link]
    ↓
[Share URL: https://ai.getgantt.ru/?share=xyz123]
```

### User Journey: Direct App Access

```
[User navigates to ai.getgantt.ru]
    ↓
[React SPA loads from same origin]
    ↓
[fetch('/api/...') → Nginx → Fastify]
    ↓
[WebSocket connects to /ws]
    ↓
[Real-time sync works]
```

### Share Link Flow

```
[User clicks "Share" in app]
    ↓
[POST /api/projects/:id/share to ai.getgantt.ru]
    ↓
[Fastify generates share token]
    ↓
[Host header = ai.getgantt.ru]
    ↓
[Share URL = https://ai.getgantt.ru/?share=xyz123]
    ↓
[Recipient opens link]
    ↓
[React SPA loads on ai.getgantt.ru]
    ↓
[fetch('/api/share?token=xyz123')]
    ↓
[Shared project loads in read-only mode]
```

## Architectural Patterns

### Pattern 1: Static Site Generator for Marketing

**What:** Pre-render all marketing pages at build time
**When to use:** Content-heavy pages with SEO requirements
**Trade-offs:**
- ✅ Fast page loads, no JS required
- ✅ SEO-friendly (HTML in response)
- ✅ Simple deployment (static files)
- ❌ No dynamic content without client-side JS

**Implementation:**
```typescript
// packages/site/src/pages/templates/[slug].astro
---
const { slug } = Astro.params;
const template = await getTemplateBySlug(slug);
---
<Layout title={template.title}>
  <h1>{template.title}</h1>
  <OpenAppButton href={`https://ai.getgantt.ru/?template=${slug}`} />
</Layout>
```

### Pattern 2: Same-Origin API Calls

**What:** Frontend and backend on same domain
**When to use:** When you control both frontend and backend
**Trade-offs:**
- ✅ No CORS configuration needed
- ✅ Simpler authentication (cookies work)
- ✅ Relative URLs work everywhere
- ❌ Tight coupling between frontend and backend domains

**Implementation:**
```typescript
// packages/web - NO CHANGES NEEDED
fetch('/api/projects') // Works on both localhost and ai.getgantt.ru
```

### Pattern 3: Subdomain Separation

**What:** Marketing on root domain, app on subdomain
**When to use:** Clear separation of concerns, independent deployment
**Trade-offs:**
- ✅ Independent deployment cycles
- ✅ Marketing changes don't restart backend
- ✅ Clear user mental model (site vs app)
- ❌ Need to manage two deployments
- ❌ Cross-domain tracking (analytics)

## Anti-Patterns

### Anti-Pattern 1: Putting App Logic in Astro

**What people do:** Try to run React editor inside Astro
**Why it's wrong:** Defeats the purpose — adds complexity without benefit
**Do this instead:** Keep editor in packages/web, only marketing content in Astro

### Anti-Pattern 2: Sharing State Between Domains

**What people do:** Try to share auth/session across getgantt.ru and ai.getgantt.ru
**Why it's wrong:** Cookies are domain-scoped, requires complex JWT passing
**Do this instead:** Auth happens only on ai.getgantt.ru, site is public

### Anti-Pattern 3: Relative URLs to App from Site

**What people do:** Use `/app` or relative links expecting them to reach ai.getgantt.ru
**Why it's wrong:** Different domains — relative links stay on same domain
**Do this instead:** Always use absolute URLs: `https://ai.getgantt.ru/path`

### Anti-Pattern 4: Rewriting Share Links to Root Domain

**What people do:** Move share pages to getgantt.ru/share/* for "SEO"
**Why it's wrong:** Share pages are app state, not public content
**Do this instead:** Keep share on ai.getgantt.ru, site links to templates

## Migration Strategy

### Phase 1: Create Astro Site (Zero Risk)

**Goal:** Build packages/site without touching existing app

**Steps:**
1. Create `packages/site` with Astro
2. Build basic pages (/, /features, /faq, /privacy, /terms)
3. Add CTA buttons → https://ai.getgantt.ru
4. Test locally: `npm run dev --workspace=packages/site`
5. Create separate Dockerfile for site
6. Deploy to CapRover as `gantt-site` app
7. Configure domain: getgantt.ru → gantt-site

**Risk:** None — existing app untouched

### Phase 2: Migrate App to Subdomain (Low Risk)

**Goal:** Move app from getgantt.ru to ai.getgantt.ru

**Steps:**
1. Verify all API/WebSocket calls use relative URLs (✓ already true)
2. Verify share link generation uses `Host` header (✓ already true)
3. Add ai.getgantt.ru domain to existing `gantt-app` in CapRover
4. Test: https://ai.getgantt.ru works identically to current app
5. Update hard-coded getgantt.ru references in app (if any)
6. Remove getgantt.ru from app container
7. Confirm getgantt.ru now shows Astro site

**Risk:** Low — app already uses relative URLs, just domain change

### Phase 3: Clean Up (Zero Risk)

**Goal:** Remove old routing, finalize split

**Steps:**
1. Add www.getgantt.ru → getgantt.ru redirect in site Nginx
2. Update documentation with new domain structure
3. Monitor analytics for broken links
4. Update share link tests to expect ai.getgantt.ru

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Current dual-deployment is overkill — single domain works |
| 1k-10k users | Dual deployment optimal — marketing changes don't restart app |
| 10k-100k users | Add CDN for static assets, consider separate database for read-only share links |
| 100k+ users | Consider microservices: separate API server from app server |

### Scaling Priorities

1. **First bottleneck:** PostgreSQL connection pooling (already implemented in v2.0)
2. **Second bottleneck:** Nginx static file caching — add CDN for Astro assets
3. **Third bottleneck:** WebSocket connections — consider Redis pub/sub for multi-instance scaling

## Integration Points Summary

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL | Prisma ORM (unchanged) | Connection pooling already configured |
| OpenAI API | HTTP via server (unchanged) | API key in CapRover env vars |
| Email (OTP) | Nodemailer via server (unchanged) | SMTP config in CapRover env vars |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| site → app | Absolute URLs (CTA links) | No state sharing needed |
| web → server | Relative URLs (fetch, WebSocket) | Same origin, no CORS |
| server → mcp | stdio transport (unchanged) | Child process communication |
| All → PostgreSQL | Prisma connection pool (unchanged) | Single database shared |

## Testing Strategy

### Pre-Migration Tests

```bash
# 1. Verify API calls work on localhost
cd packages/web
npm run dev
# Test: fetch('/api/projects') works

# 2. Verify WebSocket connects
# Test: ws://localhost:5173/ws connects

# 3. Verify share links work locally
# Test: Create share link, verify URL format
```

### Post-Migration Tests

```bash
# 1. Test Astro site locally
cd packages/site
npm run dev
# Test: http://localhost:4321 loads

# 2. Test app on subdomain locally
# Edit /etc/hosts: 127.0.0.1 ai.getgantt.ru
cd packages/web
npm run dev
# Test: http://ai.getgantt.ru:5173 loads, API works

# 3. Test production deployment
# Test: https://getgantt.ru shows Astro
# Test: https://ai.getgantt.ru shows app
# Test: Share links work on ai.getgantt.ru
```

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Domain routing | HIGH | Standard CapRover pattern, no code changes needed |
| API/WebSocket compatibility | HIGH | Relative URLs already used, subdomain-transparent |
| Share link generation | HIGH | Uses Host header, works on any domain |
| Astro deployment | MEDIUM | Standard static site, but CapRover-specific config untested |
| Migration safety | HIGH | Phased approach, zero-risk first step |

## Sources

- **Migration plan:** `.planning/reference/astro-migration-plan.md`
- **Current architecture:** `Dockerfile`, `nginx.conf`, `package.json`
- **API patterns:** `packages/web/src/stores/useAuthStore.ts`, `packages/web/src/hooks/useWebSocket.ts`
- **Share link logic:** `packages/server/src/routes/auth-routes.ts:250-270`
- **Vite config:** `packages/web/vite.config.ts`
- **Project context:** `.planning/PROJECT.md`

**Limitations:** Web search unavailable due to rate limits — recommendations based on current codebase analysis and standard deployment patterns. Astro-specific CapRover patterns inferred from general static site deployment practices.

---
*Architecture research for: Marketing site + App domain split*
*Researched: 2026-03-23*
