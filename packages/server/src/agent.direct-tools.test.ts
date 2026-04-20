import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';

import {
  buildDirectToolDefinitions,
  resolveOrdinaryAgentMcpServers,
} from './agent/direct-tools.js';
import { summarizeOrdinaryAgentPathTelemetry } from './agent.js';

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
    const acceptedDirectPath = summarizeOrdinaryAgentPathTelemetry({
      initialCompatibilityMode: 'embedded-direct',
      finalCompatibilityMode: 'embedded-direct',
      toolCallCount: 2,
      firstDirectPassAccepted: true,
      authoritativeVerificationAccepted: true,
      acceptedMutationCalls: [{ toolUseId: 'call-1', toolName: 'update_tasks', status: 'accepted', changedTaskIds: ['task-1'] }],
      actualChangedTaskIds: ['task-1'],
    });
    const legacyFallback = summarizeOrdinaryAgentPathTelemetry({
      initialCompatibilityMode: 'embedded-direct',
      finalCompatibilityMode: 'legacy-subprocess',
      toolCallCount: 3,
      firstDirectPassAccepted: false,
      authoritativeVerificationAccepted: true,
      acceptedMutationCalls: [{ toolUseId: 'call-2', toolName: 'move_tasks', status: 'accepted', changedTaskIds: ['task-2'] }],
      actualChangedTaskIds: ['task-2'],
    });

    assert.equal(acceptedDirectPath.direct_tool_path, true);
    assert.equal(acceptedDirectPath.legacy_subprocess_fallback, false);
    assert.equal(acceptedDirectPath.fallback_rate, 0);
    assert.equal(acceptedDirectPath.first_direct_pass_accepted, true);

    assert.equal(legacyFallback.direct_tool_path, false);
    assert.equal(legacyFallback.legacy_subprocess_fallback, true);
    assert.equal(legacyFallback.fallback_rate, 1);
    assert.equal(legacyFallback.first_direct_pass_accepted, false);
  });

  it('keeps acceptedMutationCalls synchronized with authoritative changed-task verification', () => {
    const telemetry = summarizeOrdinaryAgentPathTelemetry({
      initialCompatibilityMode: 'embedded-direct',
      finalCompatibilityMode: 'embedded-direct',
      toolCallCount: 1,
      firstDirectPassAccepted: true,
      authoritativeVerificationAccepted: true,
      acceptedMutationCalls: [{ toolUseId: 'call-1', toolName: 'create_tasks', status: 'accepted', changedTaskIds: ['task-a', 'task-b'] }],
      actualChangedTaskIds: ['task-a', 'task-b'],
    });

    assert.deepEqual(telemetry.acceptedMutationCalls.map((call) => call.changedTaskIds ?? []), [['task-a', 'task-b']]);
    assert.deepEqual(telemetry.acceptedChangedTaskIds, ['task-a', 'task-b']);
    assert.equal(telemetry.accepted_changed_task_id_mismatch, false);
    assert.equal(telemetry.authoritative_verification_accepted, true);
  });
});
