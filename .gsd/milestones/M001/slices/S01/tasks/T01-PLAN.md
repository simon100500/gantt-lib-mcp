# T01: 01-mcp-server-foundation 01

**Slice:** S01 — **Milestone:** M001

## Description

Initialize a working TypeScript MCP server that communicates via stdio transport.

Purpose: Establish the foundation for AI-assisted Gantt chart management by creating a functional MCP server that can be connected to Claude Code CLI.

Output: Executable MCP server with stdio transport, TypeScript compilation setup, and at least one registered tool.

## Must-Haves

- [ ] "MCP server starts without errors via stdio transport"
- [ ] "Server registers at least one tool visible to MCP client"
- [ ] "Server responds to tool calls with proper MCP response format"
- [ ] "TypeScript compiles to executable JavaScript"
- [ ] "Dependencies are correctly installed (@modelcontextprotocol/sdk)"

## Files

- `package.json`
- `tsconfig.json`
- `src/index.ts`
