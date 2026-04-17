# Deferred Items

## 2026-04-18

- `npm run build -w packages/server` is currently blocked by unrelated type errors in dirty mutation-flow files: `packages/server/src/mutation/execution.test.ts`, `packages/server/src/mutation/orchestrator.test.ts`, and `packages/server/src/split-task.ts` are out of sync with the new required `history` fields in existing staged/working-tree changes outside Plan 44-02 scope.
