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
- [x] **GATE-03**: Feature gate для export formats — PDF на Старт, PDF+Excel на Команда, PDF+Excel+API на Корпоративный

### Initial Generation Refactor

- [x] **IGR-01**: Empty broad prompts in empty projects route to the dedicated `initial_generation` lifecycle instead of deterministic template bootstrap
- [x] **IGR-02**: Planning uses server-side brief/reference injection with strict `ProjectPlan` validation and at most one quality-gate repair cycle
- [x] **IGR-03**: Approved plans compile deterministically through `commandService` with partial-salvage thresholds and controlled failure when salvage is too weak
- [x] **IGR-04**: Lifecycle logs, regression tests, and manual verification docs reconstruct one full initial-generation run end to end

### MCP Mutation Refactor

- [x] **MMR-01**: Ordinary conversational edits pass through explicit `intent -> resolution -> mutation_plan -> execution -> verification` stages instead of one opaque freeform mutation run
- [x] **MMR-02**: The server resolves task/container anchors for short natural-language edits without requiring the model to invent IDs, parent placement, or schedule dates from scratch
- [x] **MMR-03**: Common ordinary mutations (`add`, `rename`, `move`, `link`, `unlink`, `shift`, `move-to-date`, `metadata update`, `fan-out by groups`, `WBS expansion`) can execute through deterministic or tightly constrained server-side paths with authoritative changed-set verification
- [x] **MMR-04**: User-facing failures for simple mutation intents return typed controlled reasons (`anchor_not_found`, `container_not_resolved`, etc.) instead of the generic “no valid mutation tool call” outcome
- [x] **MMR-05**: Debug logs reconstruct the full mutation lifecycle including intent classification, resolution evidence, plan selection, execution mode, and final verification

### Initial Generation No Runtime Semantics

- [x] **IGNR-01**: Initial-generation intake uses one strict JSON interpretation contract that returns route, request kind, planning mode, scope mode, object profile, project archetype, worklist policy, clarification, and location scope
- [x] **IGNR-02**: Runtime code in the initial-generation interpretation path does not derive semantics from keyword matching, `regexp`, `includes`, or hardcoded lexical marker lists for route, scope, profile, or clarification
- [x] **IGNR-03**: The server validates interpretation output strictly, keeps only technical parsing outside the model, and uses conservative non-semantic fallback when the model output is unavailable or invalid
- [x] **IGNR-04**: Logs and automated regressions cover Russian and English paraphrases, ambiguity, explicit worklists, targeted-edit cases, and model-failure fallback for the initial-generation intake path

### History Undo-Redo

- [x] **HIS-01**: Every authoritative project mutation belongs to a grouped user-visible history record with stable base/new versions and persisted inverse commands where undo is supported
- [x] **HIS-02**: Undo and redo replay through the existing authoritative command pipeline and append new history groups instead of rewriting prior history
- [x] **HIS-03**: Grouped history API returns paginated mutation groups with actor, title, status, command count, undoability, redoability, and authoritative snapshot/version replay payloads
- [x] **HIS-04**: One agent-visible turn maps to one shared mutation group with a human-readable history title
- [x] **HIS-05**: Web UI exposes grouped history, toolbar access, and fixed Ctrl+Z / Ctrl+Shift+Z replay shortcuts while reconciling from authoritative server snapshots

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
| GATE-03 | Phase 34 | Complete |
| IGR-01 | Phase 41 | Complete |
| IGR-02 | Phase 41 | Complete |
| IGR-03 | Phase 41 | Complete |
| IGR-04 | Phase 41 | Complete |
| MMR-01 | Phase 42 | Complete |
| MMR-02 | Phase 42 | Complete |
| MMR-03 | Phase 42 | Complete |
| MMR-04 | Phase 42 | Complete |
| MMR-05 | Phase 42 | Complete |
| IGNR-01 | Phase 43 | Complete |
| IGNR-02 | Phase 43 | Complete |
| IGNR-03 | Phase 43 | Complete |
| IGNR-04 | Phase 43 | Complete |
| HIS-01 | Phase 44 | Complete |
| HIS-02 | Phase 44 | Complete |
| HIS-03 | Phase 44 | Complete |
| HIS-04 | Phase 44 | Complete |
| HIS-05 | Phase 44 | Complete |
| OVR-01 | Phase 38 | Pending |
| OVR-02 | Phase 38 | Pending |
| OVR-03 | Phase 38 | Pending |

**Coverage:**
- v5.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-04-18 after Phase 44 Plan 04 completion*
