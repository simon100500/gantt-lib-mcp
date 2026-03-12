# gantt-lib MCP Server

## What This Is

Проект вырос из TypeScript MCP-сервера для работы с диаграммами Ганта в полноценное AI-управляемое приложение для планирования работ. Сейчас это monorepo с тремя основными частями:

- `packages/mcp` — MCP-сервер и доменная логика задач/зависимостей
- `packages/server` — Fastify API, WebSocket-стриминг, auth и запуск AI-агента
- `packages/web` — React web UI с gantt-lib, чатом и интерактивным редактированием

## Core Value

Пользователь может описывать план работ на естественном языке, а система создаёт и обновляет диаграмму Ганта, хранит задачи в SQLite, синхронизирует изменения в реальном времени и поддерживает ручное редактирование через web UI.

## Current State

Проект уже не ограничивается in-memory MCP-сценарием. В текущем состоянии реализованы:

- MCP tools для CRUD операций с задачами и зависимостями
- Auto-schedule и валидация зависимостей
- Batch task creation
- qwen-based agent integration
- npm workspaces monorepo (`packages/mcp`, `packages/server`, `packages/web`)
- SQLite persistence через `@libsql/client`
- Fastify + WebSocket backend
- React frontend с интеграцией `gantt-lib`
- real-time обновление графика из AI-чата
- OTP/JWT auth foundation и project-scoped session model
- стабилизационные фиксы для auth/session/chat/task sync

## Active Work

Текущий активный slice — `S09: Session Control`.
Текущий активный task — `T06: Authentication UI and project switching`.

Это означает, что backend-часть auth/session-control в основном уже проложена, а основной незавершённый кусок мигрированного плана — довести UI-аутентификацию и переключение проектов до завершённого пользовательского потока.

## Constraints

- TypeScript across the stack
- gantt task model must stay compatible with `gantt-lib`
- SQLite remains the shared persistence layer for MCP/server/web flows
- project scoping matters: auth/session logic must not leak tasks or chat history across projects/users
- AI responses in chat should stay human-readable, not raw task JSON dumps

## Out of Scope

- Enterprise multi-tenant platform concerns beyond current project/session isolation
- Heavy infra/orchestration beyond the existing monorepo + container deployment path
- Non-web clients as a primary product surface

## Notes

The migrated `.gsd` plan reflects a project that evolved significantly beyond the original MCP-only scope. Roadmap and requirements should be treated as the current source of truth for remaining work, while older `.planning` materials serve as historical context only.
