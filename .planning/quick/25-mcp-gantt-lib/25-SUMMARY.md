# Quick Task 25 Summary

## Goal
Teach the MCP agent layer to apply gantt-lib nesting requests through real tool calls instead of only describing them textually.

## Completed
- Added explicit hierarchy instructions to `packages/mcp/agent/prompts/system.md` for creating child tasks, nesting existing tasks under a parent, and removing nesting via empty `parentId`.
- Expanded `isMutationIntent` in `packages/server/src/agent.ts` so nesting, subtasks, child-task, hierarchy, indent/outdent, and "move under" phrasing are treated as true mutations.
- Exported the intent helper and added `packages/server/src/agent.test.ts` to lock the hierarchy prompt contract and mutation-intent recognition.

## Verification
- `npx.cmd tsc -p packages/server/tsconfig.json --noEmit`
- `npx.cmd tsc -p packages/server/tsconfig.json --outDir .planning/tmp-server-dist`
- Runtime check via `node --input-type=module` importing `.planning/tmp-server-dist/agent.js` with `JWT_SECRET=test-secret`:
  confirmed Russian and English nesting phrases return `true` in `isMutationIntent`, and prompt file contains `Hierarchy Rules` and `parentId` guidance.

## Notes
- `npm.cmd run build -w packages/server` still failed to write into the existing `packages/server/dist` directory with `EPERM`, so verification used `--noEmit` plus a temporary outDir under `.planning`.
