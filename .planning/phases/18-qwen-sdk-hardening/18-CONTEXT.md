# Phase 18: Qwen SDK Hardening - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning
**Source:** MCP Refactoring Plan (Phase 2)

<domain>
## Phase Boundary

Make the Qwen SDK agent reliable by preventing hangs, infinite loops, and restricting tool access to MCP-only. This is a critical reliability hardening phase.
</domain>

<decisions>
## Implementation Decisions

### Agent Session Limits (LOCKED)
- Maximum session turns: `maxSessionTurns: 20` — agent stops after 20 turns
- Implemented in: `packages/server/src/agent.ts`

### Agent Timeout (LOCKED)
- 2-minute hard timeout via AbortController
- Pattern:
  ```typescript
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 120_000); // 2 мин
  try {
    const result = query({ ..., options: { abortController } });
    // ...
  } finally {
    clearTimeout(timeout);
  }
  ```
- Implemented in: `packages/server/src/agent.ts`

### Tool Exclusion (LOCKED)
- Qwen Code agent MUST NOT access: `'write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'`
- Agent works ONLY through MCP tools
- Implemented via: `excludeTools` configuration
- Implemented in: `packages/server/src/agent.ts`

### Claude's Discretion
- Implementation details of where to inject these configs in the agent initialization
- How to surface timeout/limit violations to the user
- Whether to add logging for when limits are hit
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Documentation
- `.planning/reference/MCP-reafctoring-plan.md` — Full refactoring context with all phases

### Requirements (mapped from Phase 18)
- HARD-01: Max session turns limit
- HARD-02: 2-minute timeout
- HARD-03: Tool exclusion for direct FS/terminal access
</canonical_refs>

<specifics>
## Specific Ideas

### File to Modify
- `packages/server/src/agent.ts` — All changes in this file

### Concrete Code Changes

**1. Add maxSessionTurns:**
```typescript
maxSessionTurns: 20,
```

**2. Add AbortController timeout:**
```typescript
const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 120_000);
try {
  const result = query({ ..., options: { abortController } });
} finally {
  clearTimeout(timeout);
}
```

**3. Exclude tools:**
```typescript
excludeTools: ['write_file', 'edit_file', 'run_terminal_cmd', 'run_python_code'],
```

### Verification (from refactoring plan)
- Launch agent, give it infinite loop → AbortController triggers after 2 minutes
- Agent cannot access file system or terminal directly
</specifics>

<deferred>
## Deferred Ideas

None — Phase 18 is focused purely on hardening the agent.
</deferred>

---

*Phase: 18-qwen-sdk-hardening*
*Context gathered: 2026-03-17 via MCP Refactoring Plan*
