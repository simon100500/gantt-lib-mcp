# Unified Scheduling Core Remediation Track

## Purpose

This subfolder converts [unified-scheduling-core-remediation-prd.md](D:/Projects/gantt-lib-mcp/.planning/reference/unified-scheduling-core-remediation-prd.md) into an implementation sequence.

This is a corrective track for phase 36, not a replacement for the original phase artifacts.

The point is to get from the current hybrid state to one actually-working mutation model:

- one shared scheduling core
- one authoritative command commit path
- one confirmed frontend truth model

## Why a separate track exists

Phase 36 introduced the right primitives:

- shared core import
- typed commands
- `CommandService`
- versioning
- event log

But the runtime architecture is still hybrid:

- legacy CRUD and batch routes are still active truth-paths
- frontend `confirmed/pending/preview` protocol is incomplete
- command commit can accept without persisting the full semantic edit

This remediation track is the shortest path to correctness.

## Phase Order

1. [R1-versioned-project-load.md](D:/Projects/gantt-lib-mcp/.planning/phases/36-unified-scheduling-core/remediation/R1-versioned-project-load.md)
2. [R2-command-service-correctness.md](D:/Projects/gantt-lib-mcp/.planning/phases/36-unified-scheduling-core/remediation/R2-command-service-correctness.md)
3. [R3-ui-command-cutover.md](D:/Projects/gantt-lib-mcp/.planning/phases/36-unified-scheduling-core/remediation/R3-ui-command-cutover.md)
4. [R4-preview-pending-replay.md](D:/Projects/gantt-lib-mcp/.planning/phases/36-unified-scheduling-core/remediation/R4-preview-pending-replay.md)
5. [R5-legacy-import-isolation.md](D:/Projects/gantt-lib-mcp/.planning/phases/36-unified-scheduling-core/remediation/R5-legacy-import-isolation.md)

## Success condition

The track is successful when normal authenticated editing can be explained in one sentence:

> The UI loads versioned project state, builds a typed command, commits it through `CommandService`, and adopts the server response as truth.

If any normal edit still needs legacy `PATCH/PUT/POST /api/tasks` as the main explanation, the remediation is not done.
