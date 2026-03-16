# Phase 15: Prisma Setup - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

PostgreSQL база данных с Prisma ORM готова для разработки. Замена @libsql/client на Prisma client, схема определена для всех существующих таблиц, миграции работают.

**Что входит:**
- Prisma schema для 10 таблиц (users, projects, sessions, otp_codes, tasks, dependencies, messages, share_links, task_revisions, task_mutations)
- Prisma client генерируется и доступен из packages/mcp и packages/server
- DATABASE_URL для PostgreSQL с connection pooling
- Prisma migrations запускаются успешно

**Не входит:**
- Services layer (Phase 16)
- Интеграция с существующим кодом (Phase 17)
- Деплой настройки (Phase 18)

</domain>

<decisions>
## Implementation Decisions

### Организация Prisma схемы
- **Один schema.prisma** в `packages/mcp/prisma/schema.prisma` (пакет, где сейчас db.ts)
- Все таблицы в одной схеме — проще для миграций и отладки
- Prisma client генерируется в `packages/mcp/dist/prisma-client`
- Экспорт клиента из `packages/mcp`: `"./prisma": "./dist/prisma-client.js"`
- packages/server использует клиент из packages/mcp (сохраняя текущий паттерн singleton)

### Connection pooling конфигурация
- **connection_limit = 10** (стандарт для одного контейнера)
- **pool_timeout = 20 секунд** (время ожидания свободного соединения)
- **connect_timeout = 10 секунд** (таймаут подключения к PostgreSQL)
- Connection limit в DATABASE_URL: `postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=10`
- Graceful shutdown: `prisma.$disconnect()` при SIGTERM

### Стратегия первой миграции
- **Prisma Migrate** для создания схемы (не db push — нужна история миграций)
- `npx prisma migrate dev --name init` — создаёт первую миграцию
- DROP + CREATE при необходимости (чистый старт per v2.0 решения)
- Без seed данных для production (чистая база)
- Опционально: скрипт `scripts/seed-dev-db.ts` для локальной разработки (создаёт тестовый проект)

### Рабочий процесс разработки
- **Только Prisma Migrate** — `db push` запрещён (без истории миграций ломается production)
- Изменения в schema.prisma → `npx prisma migrate dev --name describe_change`
- После каждой миграции: `npx prisma generate` для обновления Prisma Client
- Сгенерированный client коммитится в репозиторий (стабильность сборки)

### Размещение в monorepo
- `packages/mcp/prisma/` — директория с schema.prisma и migrations/
- `packages/mcp/prisma/schema.prisma` — схема
- `packages/mcp/prisma/migrations/` — миграции
- `packages/mcp/prisma/migrations/migration_lock.toml` — lock file Prisma
- Добавить `.prisma/` в `.gitignore` (локальные кэши)

### PostgreSQL для локальной разработки
- **DATABASE_URL в .env** указывает на локальный PostgreSQL
- Docker Compose для локального PostgreSQL (опционально, для удобства)
- Дилемма SQLite vs PostgreSQL для локалки: PostgreSQL (соответствие production)
- Один и тот же Prisma schema для локалки и production

### Claude's Discretion
- Точное расположение schema.prisma в packages/mcp (может быть в корне пакета или в prisma/)
- Названия миграций (принудительный стандарт: `verb_noun` например `add_tasks_index`)
- Нужно ли Docker Compose для локального PostgreSQL (предлагаю опционально)
- Формат seed данных (если понадобится)

</decisions>

<specifics>
## Specific Ideas

**Current tables from packages/mcp/src/db.ts:**
```sql
users (id, email, created_at)
projects (id, user_id, name, created_at) -- FK to users
sessions (id, user_id, project_id, access_token, refresh_token, expires_at, created_at) -- FK to users, projects
otp_codes (id, email, code, expires_at, used)
tasks (id, project_id, name, start_date, end_date, color, progress, parent_id, sort_order) -- FK to projects, self
dependencies (id, task_id, dep_task_id, type, lag) -- FK to tasks
messages (id, project_id, role, content, created_at) -- FK to projects
share_links (id, project_id, created_at) -- FK to projects
task_revisions (project_id, revision, updated_at) -- PK project_id
task_mutations (id, project_id, run_id, session_id, source, mutation_type, task_id, created_at)
```

**Prisma schema mapping (PostgreSQL types):**
- TEXT → String (Prisma)
- REAL → Float (Prisma)
- INTEGER → Int (Prisma)
- CHECK constraints → @check (Prisma поддерживает enum-like validation)

**DATABASE_URL format for connection pooling:**
```
postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=20&connect_timeout=10
```

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp/src/db.ts`: Singleton getDb() pattern — заменить на Prisma Client singleton
- `packages/server/src/db.ts`: Re-export getDb — заменить на re-export Prisma Client
- Таблицы уже определены в SQL — нужно транслировать в Prisma schema syntax

### Established Patterns
- Монорепо с npm workspaces: packages/mcp и packages/server делят код через exports
- DB client lives in packages/mcp, packages/server его импортирует
- DB_PATH через env var для пути к SQLite — заменить на DATABASE_URL

### Integration Points
- `packages/mcp/src/store.ts`: Использует getDb() → будет использовать Prisma Client
- `packages/mcp/src/auth-store.ts`: Использует getDb() → будет использовать Prisma Client
- `packages/server/src/agent.ts`: Использует getDb() косвенно через store → изменений не нужно
- `packages/server/src/index.ts`: Импортирует getDb из @gantt/mcp/db → будет импортировать Prisma Client

### Что менять в Phase 15
- Добавить `@prisma/client` и `prisma` в devDependencies packages/mcp
- Создать `packages/mcp/prisma/schema.prisma` с 10 моделями
- Запустить `npx prisma migrate dev --name init`
- Создать `packages/mcp/src/prisma.ts` для singleton Prisma Client
- Обновить `packages/mcp/src/db.ts` на backward compatible wrapper (или удалить в Phase 17)

### Что НЕ менять в Phase 15
- Не трогать store.ts и auth-store.ts (это Phase 16 — Services Layer)
- Не трогать server/* (это Phase 17 — Integration)
- Не обновлять Dockerfile (это Phase 18 — Deployment)

</code_context>

<deferred>
## Deferred Ideas

- Seed data для production — нет требований, отложено
- Database backups/recovery — не входит в v2.0 scope
- Read replicas — нет требований, масштабирование не нужно
- Prisma Accelerate — нет требований, простой PostgreSQL достаточен

</deferred>

---

*Phase: 15-prisma-setup*
*Context gathered: 2026-03-13*
