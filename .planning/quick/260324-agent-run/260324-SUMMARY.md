# Quick Task 260324 Summary

## Result

Снижение стоимости agent-run для коротких структурных запросов проведено через prompt/runtime, без изменения MCP API.

- Запросы вида `добавь отдельным блоком сантехнику` теперь попадают в simple mutation path вместо broad structural path.
- Prompt и runtime теперь явно требуют использовать `create_task.dependencies`, если predecessor новой задачи уже известен.
- `set_dependency` оставлен как fallback для связей, которые нельзя определить заранее, или для линковки существующих задач.
- `packages/server/src/agent.ts` больше не подтягивает Prisma-зависимости на import-уровне, поэтому unit-тест на эвристики и prompt работает без поднятого DB env.

## Verification

- `cmd /c npx tsc -p packages\server\tsconfig.json --noEmit`
- `cmd /c npx tsc -p packages\mcp\tsconfig.json --noEmit`
- `cmd /c npx tsc -p packages\mcp\agent\tsconfig.json --noEmit`
- `node --test packages\server\dist\agent.test.js`

## Changed Files

- `packages/mcp/agent/prompts/system.md`
- `packages/server/src/agent.ts`
- `packages/server/src/agent.test.ts`
