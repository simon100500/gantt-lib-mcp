# Roadmap: gantt-lib MCP Server

**Current milestone:** v5.0 Plan Constraints
**Granularity:** Coarse
**Last updated:** 2026-04-01

## Progress Summary

| Milestone | Phases | Status | Completed |
|-----------|--------|--------|-----------|
| v1.0 MVP | 1-14 | Shipped | 2026-03-13 |
| v2.0 PostgreSQL | 15-16 | Shipped | 2026-03-17 |
| v3.0 Hardening | 17-23 | Shipped | 2026-03-22 |
| v4.0 Astro Landing | 24-29 | Shipped | 2026-03-29 |
| v5.0 Plan Constraints | 30-34 | In progress | - |

---

## Phases

<details>
<summary>v4.0 Astro Landing (Phases 24-29) — SHIPPED 2026-03-29</summary>

- [x] Phase 24: Astro Site Foundation (3/3 plans) — completed 2026-03-23
- [x] Phase 25: Interactive Preview (2/2 plans) — completed 2026-03-24
- [x] Phase 26: Content & SEO (2/2 plans) — completed 2026-03-29
- [x] Phase 27: Domain Separation — completed 2026-03-29
- [x] Phase 28: Billing (4/4 plans) — completed 2026-03-28
- [x] Phase 29: Paywall Enhance (2/2 plans) — completed 2026-03-29

</details>

### v5.0 Plan Constraints (In Progress)

**Milestone Goal:** Enforceable tariff limits — backend guards + frontend UX + upsell flow

- [ ] **Phase 30: Constraint Engine** — Config-driven limit system with Prisma persistence
- [ ] **Phase 31: Usage Tracking** — AI query + project count counters with usage API
- [ ] **Phase 32: Backend Enforcement** — API middleware + MCP tool guards with structured error responses
- [ ] **Phase 33: Frontend Constraints UX** — Usage indicators, limit modals, proactive UI guards
- [ ] **Phase 34: Feature Gates** — Boolean gates for archive, resource pool, export tiers

<details>
<summary>v1.0 MVP (Phases 1-14) — SHIPPED 2026-03-13</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for archived roadmap.

</details>

<details>
<summary>v2.0 PostgreSQL (Phases 15-16) — SHIPPED 2026-03-17</summary>

See `.planning/milestones/v2.0-ROADMAP.md` for archived roadmap.

</details>

<details>
<summary>v3.0 Hardening (Phases 17-23) — SHIPPED 2026-03-22</summary>

See `.planning/milestones/v3.0-ROADMAP.md` for archived roadmap.

</details>

---

## Phase Details

### Phase 30: Constraint Engine
**Goal**: Система проверяет лимиты по тарифу через единый config и ConstraintService с Prisma persistence
**Depends on**: Nothing (first phase of v5.0, builds on existing v4.0 billing infrastructure)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04
**Success Criteria** (what must be TRUE):
  1. Plan config определяет все лимиты для 4 тарифов (Бесплатный, Старт, Команда, Корпоративный) в едином source of truth
  2. ConstraintService.checkLimit() возвращает allow/deny для любого лимита по userId + limitKey
  3. ConstraintService.getRemaining() и getUsage() возвращают корректные значения для типов count, daily, lifetime, boolean
  4. Usage counters хранятся в PostgreSQL через Prisma schema с atomic increment операциями
**Plans**: TBD

### Phase 31: Usage Tracking
**Goal**: Система считает AI запросы и проекты, frontend может получить текущий usage через API
**Depends on**: Phase 30
**Requirements**: TRK-01, TRK-02, TRK-03
**Success Criteria** (what must be TRUE):
  1. AI запросы считаются корректно — daily reset для paid планов (25/50/100), lifetime counter для free (20 навсегда)
  2. Количество активных проектов считается per user и проверяется против тарифного лимита (1/3/7/unlimited)
  3. GET /api/usage возвращает текущий usage для всех лимитов — remaining, used, limit, plan name
**Plans**: TBD

### Phase 32: Backend Enforcement
**Goal**: Ни один API endpoint или MCP tool не позволяет превысить тарифный лимит, с информативными ошибками
**Depends on**: Phase 30, Phase 31
**Requirements**: ENF-01, ENF-02, ENF-03
**Success Criteria** (what must be TRUE):
  1. API middleware блокирует protected endpoints (create project, AI query) при превышении лимита — запрос не обрабатывается
  2. MCP tools блокируют действия сверх лимита — AI не может создать задачу в лимитированном проекте или выполнить AI chat при исчерпанных запросах
  3. Error response содержит структурированную информацию: remaining, plan name, upgrade hint
**Plans**: TBD

### Phase 33: Frontend Constraints UX
**Goal**: Пользователь видит свои лимиты в интерфейсе и получает понятную обратную связь при их достижении
**Depends on**: Phase 32
**Requirements**: FUX-01, FUX-02, FUX-03
**Success Criteria** (what must be TRUE):
  1. Usage indicators показывают remaining/used рядом с ключевыми действиями (projects list, AI chat)
  2. LimitReachedModal показывает контекстную информацию — какой лимит достигнут, текущий тариф, сколько стоит апгрейд
  3. Кнопки создания/disabled при достижении лимита с tooltip объясняющим причину
**Plans**: TBD
**UI hint**: yes

### Phase 34: Feature Gates
**Goal**: Фичи архив, resource pool и export разделены по тарифам — бесплатный видит upsell, платные получают доступ
**Depends on**: Phase 30 (boolean limit type из ConstraintService)
**Requirements**: GATE-01, GATE-02, GATE-03
**Success Criteria** (what must be TRUE):
  1. Archive доступен на Старт и выше — бесплатный тариф видит upsell modal вместо функционала
  2. Resource pool доступен на Старт и выше — бесплатный тариф видит upsell modal
  3. Export formats разделены по тарифам — PDF на Старт, PDF+Excel на Команда, PDF+Excel+API на Корпоративный
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 30. Constraint Engine | v5.0 | 0/? | Not started | - |
| 31. Usage Tracking | v5.0 | 0/? | Not started | - |
| 32. Backend Enforcement | v5.0 | 0/? | Not started | - |
| 33. Frontend Constraints UX | v5.0 | 0/? | Not started | - |
| 34. Feature Gates | v5.0 | 0/? | Not started | - |
| 35. Scheduling Core Adoption | Scheduling | 3/3 | Complete | 2026-03-31 |
| 36. Unified Scheduling Core | Scheduling | 1/7 | In Progress|  |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | 30 | Pending |
| ENG-02 | 30 | Pending |
| ENG-03 | 30 | Pending |
| ENG-04 | 30 | Pending |
| TRK-01 | 31 | Pending |
| TRK-02 | 31 | Pending |
| TRK-03 | 31 | Pending |
| ENF-01 | 32 | Pending |
| ENF-02 | 32 | Pending |
| ENF-03 | 32 | Pending |
| FUX-01 | 33 | Pending |
| FUX-02 | 33 | Pending |
| FUX-03 | 33 | Pending |
| GATE-01 | 34 | Pending |
| GATE-02 | 34 | Pending |
| GATE-03 | 34 | Pending |

### Phase 35: Scheduling Core Adoption

**Goal:** Сервер выполняет schedule mutations теми же правилами, что и актуальный gantt-lib core, и возвращает authoritative changed-set для agent/web persistence
**Requirements**: PRD-only (`.planning/reference/scheduling-core-adoption-prd.md`)
**Depends on:** Phase 08, Phase 16, Phase 19, Phase 21, Phase 22
**Plans:** 3/3 plans complete

Plans:
- [x] 35-01 — Headless scheduling core + regression parity
- [x] 35-02 — TaskService + MCP schedule command integration
- [x] 35-03 — Agent/web authoritative scheduling adoption — completed 2026-03-31, verified passed

### Phase 36: Unified Scheduling Core

**Goal:** Единая scheduling authority: все изменения через typed commands, один gantt-lib/core/scheduling, server как единственный источник истины, deterministic/explainable/versioned результаты
**Requirements**: PRD-only (`.planning/reference/unified-scheduling-core-prd.md`)
**Depends on:** Phase 35
**Plans:** 1/7 plans executed

Plans:
- [x] 36-01 — Fix gantt-lib core/scheduling subpath export (DTS + dependency)
- [ ] 36-02 — Define typed command model + Prisma schema (contracts)
- [ ] 36-03 — Replace local scheduler with gantt-lib adapter + regression tests
- [ ] 36-04 — Command commit endpoint (CommandService + POST /api/commands/commit)
- [ ] 36-05 — Frontend three-layer state model + command commit flow
- [ ] 36-06 — MCP/API channel parity (all mutations through command commit)
- [ ] 36-07 — Parity + concurrency + patch reason tests (TDD)

---
*Last updated: 2026-03-31 — 36-01 complete (gantt-lib subpath export fix)*
