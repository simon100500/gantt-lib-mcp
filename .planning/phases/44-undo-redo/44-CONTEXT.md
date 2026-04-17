# Phase 44: undo-redo - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/reference/history-undo-redo-prd.md)

<domain>
## Phase Boundary

Deliver v1 linear history, undo, and redo for project mutations on top of the existing authoritative command pipeline.

This phase must:
- introduce `MutationGroup` as the user-visible undo unit
- extend `ProjectEvent` with group linkage, ordering, inverse commands, and request/run correlation
- keep `CommandService.commitCommand` as the authoritative mutation boundary
- support undo and redo by creating new groups rather than rewriting history
- expose grouped history through a paginated API
- let one agent turn undo as one user-visible operation
- add a web history panel and hotkeys backed by authoritative server refresh

This phase must not:
- introduce branching history, time travel, checkpoints, arbitrary restore, diff UI, or snapshot-first architecture
- replace `Project.version`, `ProjectEvent`, or the existing command pipeline
- allow partial undo within one group

</domain>

<decisions>
## Implementation Decisions

### History model
- Add a new `MutationGroup` entity with fields `id`, `projectId`, `baseVersion`, `newVersion`, `actorType`, `actorId`, `origin`, `title`, `status`, `undoneByGroupId?`, `redoOfGroupId?`, and `createdAt`.
- Treat `MutationGroup` as the only undo/redo unit in v1; undo/redo never targets raw field patches or individual DB writes.
- Keep history linear in v1: no branches, no merge semantics, no arbitrary time-travel restore.
- Mark a group undoable only when every accepted event in that group has a valid `inverseCommand`.

### ProjectEvent extension
- Extend `ProjectEvent` with `groupId`, `ordinal`, `inverseCommand`, `metadata?`, and `requestContextId?`.
- Require every accepted undoable command to persist a typed `inverseCommand`; undo must not rely on `patches` as the rollback source.
- Use `ordinal` to define the exact order inside a group so undo runs events strictly in reverse order and redo runs them in forward order.
- Persist enough before-context for destructive commands, especially `delete_task` and `delete_tasks`, to recreate deleted tasks, hierarchy, sort order, and dependencies.

### Commit-path integration
- Keep `CommandService.commitCommand` as the main commit path; do not introduce a parallel mutation executor for history.
- Extend commit requests so client, web, and agent flows can pass `groupId` and related history context through the same authoritative pipeline.
- `MutationGroup.baseVersion` must equal the version before the first event in the group; `MutationGroup.newVersion` must equal the version after the last event in the group.
- Group finalization must happen after the last successful command in the group, without breaking existing optimistic concurrency or version conflict behavior.

### Undo and redo semantics
- Undo creates a new `MutationGroup(origin='undo')` that executes inverse commands for the target group in reverse event order.
- Redo creates a new `MutationGroup(origin='redo')` that replays the original commands for an undone group in forward order.
- Undo and redo must append to history; they never delete or mutate existing log rows out of existence.
- Redo is allowed only when history has not diverged after the undo; otherwise the server must return a controlled typed failure such as `redo_not_available`, `history_diverged`, or `target_not_undone`.
- Silent partial undo is forbidden; failures must return controlled errors and leave history consistent.

### Agent integration
- One agent turn must map to one `MutationGroup` for user-visible undo.
- The staged mutation flow, deterministic/hybrid execution, and any remaining full-agent path must propagate one shared `groupId` and `requestContextId` across the whole run.
- Agent-created groups need stable human-readable titles suitable for the history panel, such as "AI — Добавил этапы отделки".
- If an agent run ends in a state that is not safely undoable, that must be explicitly marked rather than silently presented as undoable history.

### History API and frontend behavior
- Expose history as grouped `MutationGroup` records, not raw `ProjectEvent` rows.
- Add paginated history endpoints for list, undo latest, undo specific group, and redo specific group.
- Undo/redo responses must include the authoritative updated snapshot and version, and must preserve current `version_conflict` recovery behavior.
- The web UI must add a history panel showing timestamp, actor, title, status, and undo/redo availability.
- Keyboard shortcuts are fixed for v1: `Ctrl+Z` for undo last undoable group and `Ctrl+Shift+Z` for redo last redoable group.
- The frontend must reconcile from authoritative server state after undo/redo and must not confuse optimistic pending state with persisted history.

### the agent's Discretion
- Exact service/module boundaries for history orchestration, provided the final design preserves the existing authoritative command path.
- Exact API payload shapes beyond the PRD-mandated fields, if typed failure reasons, pagination, and snapshot/version refresh semantics remain explicit.
- Exact UI composition of the history panel, if it remains understandable and consistent with the existing application shell.
- Whether implementation is split into backend/web/agent plans or further refined by data model, execution path, and UI slices, as long as dependencies remain executable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase PRD
- `.planning/reference/history-undo-redo-prd.md` — locked product scope, mutation-group model, inverse-command rules, API/UI behavior, and out-of-scope boundaries.

### Existing command pipeline and event history foundation
- `.planning/reference/unified-scheduling-core-prd.md` — authoritative command pipeline, `Project.version`, `ProjectEvent`, and the original undo/redo foundation constraints from Phase 36.
- `.planning/phases/36-unified-scheduling-core/36-CONTEXT.md` — locked decisions for versioned command commits, event logging, and the snapshot-plus-log model that this phase must extend.
- `packages/mcp/prisma/schema.prisma` — current `Project`, `ProjectEvent`, and related Prisma models that will need history-model evolution.
- `packages/mcp/src/services/command.service.ts` — authoritative command execution, version bumping, event persistence, and the commit boundary that history must wrap instead of bypassing.
- `packages/mcp/src/types.ts` — typed command/request/response/event contracts that history fields and APIs must remain compatible with.

### Agent mutation flow and request grouping context
- `.planning/reference/mcp-mutation-refactor-prd.md` — staged mutation lifecycle and execution-mode constraints for ordinary conversational edits.
- `.planning/phases/42-mcp-mutation-refactor/42-CONTEXT.md` — locked staged-flow decisions and authoritative execution assumptions that agent history grouping must honor.
- `packages/server/src/agent.ts` — main agent orchestration entrypoint that will need request-scoped grouping/title propagation.
- `packages/server/src/mutation` — staged mutation lifecycle code that should carry `groupId` and `requestContextId` across one agent-visible turn.

### Web command commit and state adoption
- `packages/server/src/routes/command-routes.ts` — current command commit HTTP boundary and existing version-conflict contract for web mutations.
- `packages/web/src/hooks/useCommandCommit.ts` — frontend authoritative snapshot adoption after command commits.
- `packages/web/src/hooks/useProjectCommands.ts` — higher-level web mutation callers that likely need history metadata propagation or undo/redo actions.

### Project state and roadmap context
- `.planning/ROADMAP.md` — current Phase 44 entry and upstream phase ordering.
- `.planning/STATE.md` — project decisions/history, especially Phase 36 and Phase 42 command-pipeline decisions.

</canonical_refs>

<specifics>
## Specific Ideas

- Use `MutationGroup` as the user-visible unit for manual edits, batch deletes, AI fan-out, and other multi-command operations.
- Persist inverse commands per event for these v1 commands: `move_task`, `resize_task`, `set_task_start`, `set_task_end`, `change_duration`, `update_task_fields`, `update_tasks_fields_batch`, `create_task`, `create_tasks_batch`, `delete_task`, `delete_tasks`, `create_dependency`, `remove_dependency`, `change_dependency_lag`, `reparent_task`, `reorder_tasks`.
- Add history titles that distinguish actor type: user, AI, or system.
- Ensure undoing an agent turn rolls back all commands produced during that turn in one operation.
- Make redo unavailable when post-undo history diverges, and expose a typed refusal instead of attempting unsafe replay.

</specifics>

<deferred>
## Deferred Ideas

- Checkpoints.
- Restore to arbitrary older group/version.
- Materialized snapshots by version.
- Time-travel preview.
- Branching or scenario history.
- Diff UI and advanced filters.

</deferred>

---

*Phase: 44-undo-redo*
*Context gathered: 2026-04-17 via PRD Express Path*
