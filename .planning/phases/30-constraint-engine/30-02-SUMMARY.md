---
phase: 30-constraint-engine
plan: 02
subsystem: constraints
tags: [prisma, server, constraints, usage]
requires:
  - phase: 30-constraint-engine
    provides: shared constraint catalog
provides:
  - Prisma usage counter persistence contract
  - ConstraintService with normalized tracked/unlimited/not_applicable semantics
  - Server-side tests for projects, ai_queries, boolean gates, export access, and unknown limit keys
affects: [30-03, server]
tech-stack:
  added: [usage_counters prisma model]
  patterns: [normalized limit reads, day bucket counters, atomic upsert increments]
key-files:
  created:
    - packages/server/src/services/constraint-service.ts
    - packages/server/src/services/constraint-service.test.ts
  modified:
    - packages/mcp/prisma/schema.prisma
key-decisions:
  - "Tracked AI usage is stored by explicit period buckets: `lifetime` and `day:YYYY-MM-DD`."
  - "Boolean and export limits return normalized `not_applicable` usage instead of fake counters."
patterns-established:
  - "ConstraintService is the single place that translates shared plan metadata into executable checks."
  - "Usage persistence is atomic via Prisma upsert increment."
requirements-completed: [ENG-02, ENG-03, ENG-04]
duration: 35min
completed: 2026-04-03
---

# Phase 30 Plan 02 Summary

**Added Prisma-backed constraint execution with normalized usage and remaining semantics for all canonical limit types.**

## Accomplishments

- Added `UsageCounter` to the Prisma schema with unique `[userId, limitKey, periodBucket]` storage.
- Implemented `ConstraintService` with `checkLimit()`, `getUsage()`, `getRemaining()`, and `incrementUsage()`.
- Covered lifetime, daily, unlimited, boolean, export-access, and unknown-key cases with server tests.

## Verification

- `cmd /c npm exec prisma generate` in `packages/mcp`
- `cmd /c npx tsc -p packages/server/tsconfig.json`
- `cmd /c node --test packages/server/dist/services/constraint-service.test.js packages/server/dist/billing-service.test.js`

## Issues Encountered

- Prisma client generation was initially blocked by a running server process locking `query_engine-windows.dll.node`; once the process was stopped, generation succeeded.

## Self-Check: PASSED

- FOUND: `packages/server/src/services/constraint-service.ts`
- FOUND: `packages/server/src/services/constraint-service.test.ts`
- FOUND: `usage_counters` schema contract in Prisma
