# PRD: MCP Surface API Normalization for Intent-Driven Scheduling

## Status

Proposed

## Purpose

This PRD defines the next corrective step after unified scheduling core remediation.

Phase 36 established the right truth boundary:

- server-side scheduling is authoritative
- `CommandService` is the command commit path
- the frontend adopts canonical server state

But the MCP surface is still too low-level.

Today the agent is often forced to think in:

- absolute dates
- dependency array rewrites
- lag edits
- raw parentId mechanics

That is the wrong abstraction level for an intent-driven scheduling system.

The goal of this PRD is to normalize the MCP surface so the agent expresses domain intent while the backend computes and commits truth.

## Core Product Statement

The MCP server must stop behaving like "hands that drag bars" and start behaving like an intent orchestrator.

The target flow is:

> user or agent expresses change -> MCP resolves context and builds structured intent -> domain backend computes truth -> canonical result is returned and adopted

## Current Diagnosis

The current architecture has the correct truth engine but an incorrect MCP interaction layer.

Current defects:

- simple requests like "shift by 2 days" require the agent to derive absolute dates
- some schedule edits still encourage dependency or lag manipulation instead of semantic movement intent
- server-agent mutation verification depends partly on request-text heuristics
- mutation tools can fail or reject without a strict, typed success boundary
- low-level MCP contracts leak storage-shape concerns into the reasoning layer
- contextual reads are too coarse, encouraging full-graph scans instead of targeted slices

Conclusion:

> The domain truth model is moving in the right direction.  
> The MCP surface contract is not yet aligned with it.

## Product Goal

Normalize the MCP API so that the agent mostly works in domain intentions, not raw schedule patches.

Success means:

- simple scheduling requests do not require manual date arithmetic by the agent
- normal dependency-aware edits go through intent-oriented tools
- mutation success is verified from committed server effects, not from assistant text
- MCP can read targeted project context without loading the whole graph by default
- the domain backend remains the only source of committed schedule truth

## Non-Goals

- no replacement of `CommandService`
- no rewrite of scheduling semantics
- no full planning-template system in the first pass
- no resource optimization engine in this phase
- no direct DB access from MCP
- no free-form project JSON rewriting tools

## Users and Use Cases

### Primary users

- conversational scheduling agent
- MCP-integrated automation flows
- future UI preview/commit orchestrations

### Primary use cases

1. shift a task or a branch by N working or calendar days
2. add new tasks after or under an existing task without fragile ID choreography
3. link or unlink tasks using semantic dependency intent
4. restructure WBS without exposing low-level parent mutation mechanics
5. validate schedule health and explain conflicts

## Product Principles

1. MCP is not the source of truth.
2. MCP must prefer semantic tools over raw field patches.
3. The backend computes dates, cascades, and validations.
4. Every mutation has a typed success or rejection boundary.
5. Context should be sliced to relevance, not dumped wholesale.
6. Preview and commit should converge on the same domain operations.

## Required Functional Changes

## 1. Intent-First Schedule Mutations

The MCP surface must add schedule-intent tools that do not require the agent to compute absolute dates for common edits.

Minimum required capability:

- shift a task by delta days
- shift multiple tasks by delta days
- choose working-day or calendar-day semantics according to project rules or explicit arguments

Examples of desired tool direction:

- `shift_task_by_days`
- `shift_tasks`
- `shift_tasks_relative`

The exact naming may differ, but the semantic requirement is fixed:

> the caller provides the intent delta, not the recomputed final dates

## 2. Intent-First Dependency Operations

The MCP surface must expose dependency operations as semantic actions rather than raw dependency-array rewrites.

Required capability:

- link tasks
- unlink tasks
- optionally change lag via explicit dependency intent

The agent should not need to rebuild an entire dependency array just to create or remove one logical link.

## 3. Intent-First Hierarchy Operations

The MCP surface must expose hierarchy changes as structural actions.

Required capability:

- move task under parent
- indent/outdent
- reorder or reposition in WBS

The agent should not have to think in raw `parentId` mutation as its primary model.

## 4. Contextual Read Surface

The MCP surface must provide targeted reads for reasoning.

Minimum required tools:

- `get_project_summary`
- `get_task_context`
- `get_schedule_slice`

These tools must allow the agent to inspect only the relevant branch, neighborhood, or selected tasks rather than repeatedly reading the full graph.

## 5. Typed Mutation Result Contract

Every mutation tool must return a structured result that clearly distinguishes:

- accepted mutation
- rejected mutation
- validation error
- version conflict

Successful responses must include:

- authoritative changed set
- version/revision after commit
- enough canonical task data to ground the user-visible answer

Rejected responses must include:

- machine-readable reason
- enough context for the agent to retry safely or explain failure truthfully

Text-only "Command rejected" responses are not sufficient as the primary contract.

## 6. Tool-Aware Mutation Verification

Server-agent verification must be driven by actual mutation tool execution and committed effects.

Required behavior:

- if a mutation tool was called or attempted, the run must be treated as mutation-sensitive
- assistant text cannot count as success if no committed change occurred
- retries should be based on actual mutation failure, rejection, timeout, or empty changed set

This is required to stop false-positive success messages after failed or partial mutation flows.

## 7. Operation Batch Direction

The normalized MCP surface must be compatible with a later operation-batch contract.

This phase does not need full preview/commit batching yet, but the design must move toward:

- ordered operations
- `baseVersion`
- client refs for created entities
- one authoritative commit boundary

Single-call tools should be designed so they can later map cleanly to batched operations.

## 8. Preview/Commit Compatibility

The normalized MCP contracts must not block a future preview/commit split.

Specifically:

- mutation payloads should be serializable as reusable operations
- result payloads should be usable in both preview and commit modes
- rejection/conflict structures should be reusable by future preview diff APIs

## Out of Scope for This PRD

- full template-based schedule generation
- dedicated resource planning workflows
- advanced multi-user merge/rebase orchestration
- baseline and fact model redesign
- replacement of the existing frontend command state model

## API Direction

The target direction is to move away from low-level task patch tools as the default path.

Preferred surface:

- semantic schedule tools
- semantic dependency tools
- semantic hierarchy tools
- contextual read tools
- typed validation tools

De-emphasized surface:

- direct date patching as normal edit flow
- whole dependency array rewrites for single-link edits
- full project scans for every edit

## Proposed MVP Surface

The first normalized MCP slice should include:

- `get_project_summary`
- `get_task_context`
- `get_schedule_slice`
- `create_tasks`
- `update_tasks`
- `move_tasks`
- `delete_tasks`
- `link_tasks`
- `unlink_tasks`
- `shift_tasks`
- `recalculate_project`
- `validate_schedule`

Notes:

- existing tools may be reused internally
- naming can stay backward-compatible through wrappers if needed
- the product requirement is the semantic surface, not exact string names

## Technical Requirements

## 1. No Direct DB Ownership in MCP

MCP tools must continue to call application/domain services, not persistence directly.

Required layering:

> MCP tools -> application service / command boundary -> scheduling domain -> persistence

## 2. Shared Truth for Date Math

All date arithmetic, dependency cascade, calendar handling, and range normalization must remain server-side in the domain backend.

The MCP layer may resolve context and choose tools.

It must not become a second scheduling engine.

## 3. Versioned Commit Boundary

All normalized mutation tools must preserve or map to the project versioned commit protocol.

Required invariants:

- no mutation bypass around authoritative scheduling rules
- no silent commit without a versioned result
- no success answer without committed evidence

## 4. Backward Compatibility Strategy

Existing low-level tools may remain temporarily for compatibility, but:

- they should stop being the recommended primary path
- they should wrap or delegate to normalized semantic behavior where possible
- prompt guidance should shift the agent away from low-level usage for normal edits

## Acceptance Criteria

This PRD is complete when all of the following are true:

1. A request like "shift task X by 2 working days" can be completed without the agent computing a final absolute date itself.
2. A request like "link A after B" does not require rebuilding a whole dependency array.
3. A request like "move this task under phase Y" does not require raw hierarchy field reasoning as the primary agent abstraction.
4. Mutation verification is based on actual committed changes, not only on request wording.
5. Rejected mutations produce typed, machine-readable failure output.
6. The agent can fetch targeted project context without defaulting to a whole-project read for every non-trivial edit.
7. The normalized surface can be explained as semantic intent wrappers over the authoritative domain backend.

## Failure Condition

This PRD is not satisfied if normal agent operation still requires the model to do any of the following for simple scheduling edits:

- compute absolute dates manually
- infer or rewrite full dependency arrays for one logical dependency edit
- reason about raw `parentId` mutation as the main hierarchy model
- claim mutation success when no authoritative commit happened

## Success Statement

The normalized MCP surface is successful when simple changes can be explained like this:

> The agent resolved the relevant task context, sent a semantic mutation intent to the backend, and used the authoritative changed set returned by the server.

If we still have to explain simple edits in terms of manual date rewriting, lag hacking, or ad hoc low-level patches, the base MCP API is still not normal.
