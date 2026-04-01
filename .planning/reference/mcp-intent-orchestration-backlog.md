# MCP Intent Orchestration Backlog

## Status

Proposed

## Purpose

This document converts the current MCP architecture note into an actionable backlog.

It is not a phase plan and not a replacement for an implementation PRD.

Its purpose is to capture the target direction for the MCP layer:

> user or agent expresses intent -> MCP resolves context and orchestrates -> domain server computes truth -> frontend adopts canonical result

## Architectural Direction

The MCP layer should evolve toward:

- intent orchestration, not raw schedule editing
- domain-tool usage, not project JSON rewriting
- contextual reads, not full-graph loading by default
- operation batches, not ad hoc CRUD sequences
- preview and commit semantics, not blind immediate writes

## Backlog Themes

## Theme 1: Intent-First Mutation Surface

### B1. Add relative schedule intent tools

Problem:

- current tools force the agent to reason in absolute dates
- simple user requests like "shift by 2 days" require manual date arithmetic

Desired outcome:

- MCP exposes tools like `shift_tasks`
- caller provides delta or semantic anchor, not recomputed dates

Candidate scope:

- `shift_tasks`
- `shift_task_by_days`
- `shift_task_to_successor_gap`
- server-side support for working-day vs calendar-day delta semantics

### B2. Add explicit dependency-intent tools

Problem:

- dependency edits are still expressed too close to storage shape
- agent sometimes has to think in lag arrays instead of planning intent

Desired outcome:

- MCP exposes `link_tasks`, `unlink_tasks`, `change_dependency_lag`
- tool contracts speak in predecessor/successor language

### B3. Add hierarchy-intent tools

Problem:

- hierarchy updates still leak low-level `parentId` mechanics

Desired outcome:

- MCP exposes `move_tasks`, `indent_tasks`, `outdent_tasks`
- task reparenting is expressed as structural intent

## Theme 2: Contextual Read Model

### B4. Introduce project summary read tool

Desired outcome:

- `get_project_summary` returns revision, calendar mode, date range, task count, major phases, and high-level health signals

### B5. Introduce task-centric context reads

Desired outcome:

- `get_task_context` returns task, parents, children, neighbors, predecessors, successors, and relevant resource context

### B6. Introduce graph-slice read tool

Desired outcome:

- `get_schedule_slice` returns only the relevant branch, date window, or filtered subset
- agent no longer depends on full `get_tasks` scans for every non-trivial operation

### B7. Introduce calendar and resource context reads

Desired outcome:

- `get_calendar_context`
- `get_resource_context`
- `check_resource_conflicts`

## Theme 3: Operation-Based Contract

### B8. Replace scattered CRUD orchestration with operation batches

Problem:

- multi-step changes currently require many tool calls with intermediate client-side state assumptions

Desired outcome:

- domain-facing contract accepts ordered operations with `baseVersion`
- client refs can be resolved server-side inside one transaction

Example direction:

- `preview_operations`
- `commit_operations`

### B9. Add client reference resolution for multi-create flows

Desired outcome:

- batch creation can create task A and link task B to A without leaking intermediate UUID handling to the agent

### B10. Standardize mutation result payload

Desired outcome:

- every mutation returns:
  - accepted/rejected status
  - rejection reason
  - authoritative changed set
  - new revision/version
  - optional snapshot or diff payload

## Theme 4: Preview / Commit Protocol

### B11. Add preview-only mutation path

Desired outcome:

- MCP can ask the domain layer for a preview diff without persisting
- frontend and agent can inspect the cascade footprint before commit

### B12. Add commit against base revision

Desired outcome:

- commit requires `baseVersion`
- stale previews are rejected or rebased explicitly

### B13. Add conflict presentation model

Desired outcome:

- MCP receives structured validation/conflict output
- agent can explain why a commit was rejected without guessing

## Theme 5: Validation and Safety

### B14. Expose explicit schedule validation

Desired outcome:

- `validate_schedule` returns:
  - cycles
  - orphan or unlinked tasks
  - invalid dates
  - conflicting constraints
  - calendar inconsistencies

### B15. Make mutation verification tool-aware

Problem:

- server-agent currently decides mutation verification partly from text heuristics

Desired outcome:

- verification is triggered by actual mutation tool usage or attempted mutation operations
- text-only success messages cannot pass if no mutation was committed

### B16. Make rejection paths explicit and machine-readable

Desired outcome:

- no silent or text-only "success" after failed mutation
- all mutation tools produce typed rejection output

## Theme 6: Planning / Generation Layer

### B17. Add high-level generation from brief

Desired outcome:

- `generate_schedule_from_brief`
- uses planning recipes/templates, then commits through domain operations

### B18. Add decomposition tools

Desired outcome:

- `expand_task_into_subtasks`
- `suggest_dependencies`
- `suggest_resources`

### B19. Separate planning knowledge from prompt text

Desired outcome:

- recipes/templates live in services or retrievable assets
- prompt contains stable rules only

## Theme 7: Resource and Execution Model

### B20. Add resource assignment tools

Desired outcome:

- `assign_resources`
- `unassign_resources`
- `check_resource_conflicts`

### B21. Add execution-state tools

Desired outcome:

- `update_progress`
- `update_quantity`
- fact/progress updates route through the same authoritative mutation path

## Theme 8: Surface API Cleanup

### B22. Deprecate raw low-level task patching as primary MCP path

Desired outcome:

- `update_task(startDate/endDate/dependencies)` stops being the preferred tool for normal schedule edits
- intent tools become the default contract

### B23. Remove direct graph rewrite concepts from MCP design

Desired outcome:

- no `replace_task_list`
- no `patch_project_json`
- no direct DB editing from MCP

### B24. Align MCP surface with authoritative backend route model

Desired outcome:

- MCP tool catalog is a thin semantic facade over domain application services
- frontend, MCP, and imports converge on one mutation architecture

## Suggested Delivery Order

### Wave 1: Base correctness

1. intent-first shift tools
2. typed rejection/result model
3. tool-aware mutation verification
4. standardized changed-set response

### Wave 2: Better context and structure

1. `get_project_summary`
2. `get_task_context`
3. `get_schedule_slice`
4. hierarchy-intent tools

### Wave 3: Preview / commit operations

1. `preview_operations`
2. `commit_operations`
3. clientRef resolution
4. conflict model

### Wave 4: Generation and recipes

1. planning templates/recipes
2. `generate_schedule_from_brief`
3. `expand_task_into_subtasks`
4. `suggest_dependencies`

### Wave 5: Resources and execution

1. resource assignments
2. conflict checks
3. progress/fact updates

## Immediate Priority Items

These items should be treated as near-term, because they directly block the intended MCP role:

1. relative shift intent support
2. operation/result contract cleanup
3. mutation verification based on actual tool effects
4. removal of low-level date arithmetic from normal agent flows
5. contextual read tools so the agent stops scanning the whole graph by default

## Success Condition

This backlog is successful when simple schedule edits can be explained in one sentence:

> The agent resolved the target task, sent a semantic intent to the domain backend, and adopted the authoritative changed set returned by the server.

If a simple edit still requires the agent to manually compute dates, infer lag mechanics, or mentally simulate neighboring task movement, the MCP layer is still too low-level.
