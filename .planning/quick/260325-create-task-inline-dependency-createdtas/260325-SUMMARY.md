# Quick Task 260325 Summary

## Result

Закрыт failure mode, из-за которого агент мог сделать лишний `create_task`, если терял ID предыдущей только что созданной подзадачи.

- Prompt теперь требует брать dependency `taskId` только из точного `createdTaskId`, возвращённого предыдущим `create_task`.
- Runtime prompt и retry protocol прямо запрещают выдумывать или синтезировать UUID для `dependencies.taskId`.
- При потере predecessor ID агенту теперь предписан safe fallback вместо speculative `create_task` с сомнительной dependency.

## Verification

- `cmd /c npx tsc -p packages\server\tsconfig.json --noEmit`
- `cmd /c npx tsc -p packages\mcp\tsconfig.json --noEmit`
- `cmd /c npx tsc -p packages\mcp\agent\tsconfig.json --noEmit`
- `node --test packages\server\dist\agent.test.js`

## Changed Files

- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`
- `packages/server/src/agent.test.ts`
