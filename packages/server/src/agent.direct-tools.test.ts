import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';

import {
  buildDirectToolDefinitions,
  resolveOrdinaryAgentMcpServers,
} from './agent/direct-tools.js';

function isSdkServerConfig(server: unknown): server is { type: 'sdk'; name: string } {
  return typeof server === 'object' && server !== null && 'type' in server && (server as { type?: unknown }).type === 'sdk';
}

function isStdioServerConfig(server: unknown): server is { type?: undefined; command: string; args: string[] } {
  return typeof server === 'object' && server !== null && 'command' in server;
}

describe('agent direct tool path', () => {
  it('builds embedded SDK tools from the shared normalized catalog', () => {
    const definitions = buildDirectToolDefinitions({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 1,
    });

    assert.equal(definitions.length, NORMALIZED_TOOL_CATALOG.length);
    assert.deepEqual(
      definitions.map((definition) => definition.name),
      NORMALIZED_TOOL_CATALOG.map((tool) => tool.name),
    );
  });

  it('uses the embedded direct path by default', () => {
    const servers = resolveOrdinaryAgentMcpServers({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 1,
      projectRoot: process.cwd(),
    });

    assert.ok(isSdkServerConfig(servers.gantt));
    assert.equal(servers.gantt.type, 'sdk');
    assert.equal(servers.gantt.name, 'gantt');
    assert.ok(!('command' in servers.gantt));
  });

  it('keeps the subprocess path behind an explicit compatibility flag', () => {
    const servers = resolveOrdinaryAgentMcpServers({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 2,
      projectRoot: process.cwd(),
      compatibilityMode: 'legacy-subprocess',
      mcpServerPath: 'packages/mcp/dist/index.js',
    });

    assert.ok(isStdioServerConfig(servers.gantt));
    assert.equal(servers.gantt.command, 'node');
    assert.deepEqual(servers.gantt.args, ['packages/mcp/dist/index.js']);
  });
});
