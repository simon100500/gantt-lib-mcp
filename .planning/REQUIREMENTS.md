# Requirements: gantt-lib MCP Server

**Defined:** 2026-03-29
**Core Value:** AI может программно управлять диаграммами Ганта с enforceable тарифными лимитами

## v5.0 Requirements

Requirements for Plan Constraints milestone. Each maps to roadmap phases.

### Constraint Engine

- [x] **ENG-01**: Plan config определяет лимиты для каждого тарифа в едином source of truth (4 тарифа: Бесплатный, Старт, Команда, Корпоративный)
- [x] **ENG-02**: ConstraintService предоставляет checkLimit(), getRemaining(), getUsage() для любого лимита
- [x] **ENG-03**: Система поддерживает типы лимитов: count (проекты), daily (AI запросы paid), lifetime (AI запросы free), boolean (feature gates)
- [x] **ENG-04**: Usage counters хранятся в PostgreSQL с Prisma schema для persistence и atomic increments

### Backend Enforcement

- [x] **ENF-01**: API middleware проверяет лимиты перед обработкой protected endpoints (create project, AI query)
- [x] **ENF-02**: MCP tools проверяют лимиты — AI не может превысить лимит через tool call (create_task внутри лимитированного проекта, AI chat при исчерпанных запросах)
- [x] **ENF-03**: Error response содержит limit info (remaining, plan name, upgrade hint) в структурированном формате

### Usage Tracking

- [x] **TRK-01**: AI query counter — daily reset для paid планов (25/50/100), lifetime counter для free (20 навсегда)
- [x] **TRK-02**: Active project count tracking per user (1/3/7/unlimited по тарифу)
- [x] **TRK-03**: GET /api/usage возвращает текущий usage для всех лимитов — frontend может показать remaining

### Frontend Constraints UX

- [x] **FUX-01**: Usage indicators показывают remaining/used рядом с ключевыми действиями (projects, AI chat)
- [x] **FUX-02**: LimitReachedModal обновлён с контекстной информацией — какой лимит, текущий тариф, сколько стоит апгрейд
- [x] **FUX-03**: Proactive UI guards — кнопки создания/disabled при достижении лимита, tooltip объясняет почему

### Feature Gates

- [x] **GATE-01**: Feature gate для archive — доступно на Старт+ (бесплатный видит upsell)
- [x] **GATE-02**: Feature gate для resource pool — доступно на Старт+ (бесплатный видит upsell)
- [ ] **GATE-03**: Feature gate для export formats — PDF на Старт, PDF+Excel на Команда, PDF+Excel+API на Корпоративный

## Future Requirements

### Deferred to future milestones

- **MEMBER-01**: Member count enforcement (1/1/5/20) — когда командные функции будут реализованы
- **GUEST-01**: Guest link management — безлимит для всех, без enforcement нужен
- **DASH-01**: Usage dashboard page — детальный обзор использования в settings
- **TRIAL-01**: Trial period для paid планов — 14 дней trial
- **OVR-01**: Система поддерживает per-user override для любого `limitKey`, а не только для отдельных спецкейсов вроде `projects`
- **OVR-02**: `ConstraintService` вычисляет effective limit как `user override -> plan default`, сохраняя единое поведение для API, MCP и frontend consumers
- **OVR-03**: Админка позволяет выставлять, сбрасывать и просматривать overrides, включая `null = follow plan` и effective limit preview

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rate limiting (per-second) | Это не тарифные лимиты — separate concern |
| Admin panel для plan management | Plans hardcoded в config, admin panel позже |
| Custom plans | Только 4 предустановленных тарифа |
| Plan downgrade flow | Downgrade требует data migration — отдельная задача |
| Granular permissions | Тарифы управляют лимитами, не permissions |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 30 | Complete |
| ENG-02 | Phase 30 | Complete |
| ENG-03 | Phase 30 | Complete |
| ENG-04 | Phase 30 | Complete |
| TRK-01 | Phase 31 | Complete |
| TRK-02 | Phase 31 | Complete |
| TRK-03 | Phase 31 | Complete |
| ENF-01 | Phase 32 | Complete |
| ENF-02 | Phase 32 | Complete |
| ENF-03 | Phase 32 | Complete |
| FUX-01 | Phase 33 | Complete |
| FUX-02 | Phase 33 | Complete |
| FUX-03 | Phase 33 | Complete |
| GATE-01 | Phase 34 | Complete |
| GATE-02 | Phase 34 | Complete |
| GATE-03 | Phase 34 | Pending |
| OVR-01 | Phase 38 | Pending |
| OVR-02 | Phase 38 | Pending |
| OVR-03 | Phase 38 | Pending |

**Coverage:**
- v5.0 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-04-04 after Phase 33 completion*
