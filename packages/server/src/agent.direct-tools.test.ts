import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NORMALIZED_TOOL_CATALOG } from '@gantt/runtime-core/tool-core/catalog';

import {
  buildDirectToolDefinitions,
  resolveOrdinaryAgentToolRuntime,
} from './agent/direct-tools.js';

const agentSourcePath = join(process.cwd(), 'packages/server/src/agent.ts');

describe('agent direct tool path', () => {
  it('builds OpenAI Agents JS tools from the shared normalized catalog', () => {
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
    const runtime = resolveOrdinaryAgentToolRuntime({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 1,
      projectRoot: process.cwd(),
    });

    assert.equal(runtime.tools.length, NORMALIZED_TOOL_CATALOG.length);
    assert.equal(runtime.mcpServers.length, 0);
  });

  it('keeps the subprocess path behind an explicit compatibility flag', () => {
    const legacyServerPath = ['packages', 'mcp', 'dist', 'index.js'].join('/');
    const runtime = resolveOrdinaryAgentToolRuntime({
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      attempt: 2,
      projectRoot: process.cwd(),
      compatibilityMode: 'legacy-subprocess',
      mcpServerPath: legacyServerPath,
    });

    assert.equal(runtime.tools.length, 0);
    assert.equal(runtime.mcpServers.length, 1);
  });

  it('locks the ordinary path to the direct path by default with no external MCP subprocess', () => {
    const source = readFileSync(agentSourcePath, 'utf8');

    assert.match(source, /direct_tool_path/);
    assert.match(source, /legacy_subprocess_fallback/);
    assert.match(source, /embedded_tool_call/);
    assert.match(source, /fallback_rate/);
    assert.match(source, /no external MCP subprocess/i);
    assert.match(source, /direct path by default/i);
  });

  it('marks fallback only after the first direct pass is not authoritatively accepted', () => {
    const source = readFileSync(agentSourcePath, 'utf8');

    assert.match(
      source,
      /initialCompatibilityMode === 'embedded-direct'[\s\S]*finalCompatibilityMode === 'legacy-subprocess'[\s\S]*!input\.firstDirectPassAccepted/,
    );
    assert.match(source, /legacy_subprocess_fallback: legacySubprocessFallback/);
    assert.match(source, /fallback_rate: legacySubprocessFallback \? 1 : 0/);
    assert.match(source, /first_direct_pass_accepted: input\.firstDirectPassAccepted/);
  });

  it('keeps acceptedMutationCalls synchronized with authoritative changed-task verification', () => {
    const source = readFileSync(agentSourcePath, 'utf8');

    assert.match(source, /acceptedMutationCalls: input\.acceptedMutationCalls/);
    assert.match(source, /const acceptedChangedTaskIds = uniqueSorted/);
    assert.match(source, /accepted_changed_task_id_mismatch: acceptedChangedTaskIdMismatch/);
    assert.match(source, /authoritative_verification_accepted: input\.authoritativeVerificationAccepted/);
  });
});
