import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
    const legacyServerPath = ['packages', 'mcp', 'dist', 'index.js'].join('/');
    const servers = resolveOrdinaryAgentMcpServers({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 2,
      projectRoot: process.cwd(),
      compatibilityMode: 'legacy-subprocess',
      mcpServerPath: legacyServerPath,
    });

    assert.ok(isStdioServerConfig(servers.gantt));
    assert.equal(servers.gantt.command, 'node');
    assert.deepEqual(servers.gantt.args, [legacyServerPath]);
  });

  it('locks the ordinary path to the direct path by default with no external MCP subprocess', () => {
    const source = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');

    assert.match(source, /direct_tool_path/);
    assert.match(source, /legacy_subprocess_fallback/);
    assert.match(source, /embedded_tool_call/);
    assert.match(source, /fallback_rate/);
    assert.match(source, /no external MCP subprocess/i);
    assert.match(source, /direct path by default/i);
  });

  it('marks fallback only after the first direct pass is not authoritatively accepted', () => {
    const source = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');

    assert.match(
      source,
      /initialCompatibilityMode === 'embedded-direct'[\s\S]*finalCompatibilityMode === 'legacy-subprocess'[\s\S]*!input\.firstDirectPassAccepted/,
    );
    assert.match(source, /legacy_subprocess_fallback: legacySubprocessFallback/);
    assert.match(source, /fallback_rate: legacySubprocessFallback \? 1 : 0/);
    assert.match(source, /first_direct_pass_accepted: input\.firstDirectPassAccepted/);
  });

  it('keeps acceptedMutationCalls synchronized with authoritative changed-task verification', () => {
    const source = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');

    assert.match(source, /acceptedMutationCalls: input\.acceptedMutationCalls/);
    assert.match(source, /const acceptedChangedTaskIds = uniqueSorted/);
    assert.match(source, /accepted_changed_task_id_mismatch: acceptedChangedTaskIdMismatch/);
    assert.match(source, /authoritative_verification_accepted: input\.authoritativeVerificationAccepted/);
  });
});
