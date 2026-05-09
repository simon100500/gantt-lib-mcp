import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GANTT_PI_AGENT_CARD,
  GANTT_PI_AGENT_SYSTEM_PROMPT,
  looksLikeMutatingRequest,
} from './agent/pi-agent-runner.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';

const repoRoot = process.cwd();

describe('initial-generation route selection', () => {
  it('routes empty-project bootstrap prompts into initial_generation', async () => {
    const result = await selectAgentRoute({
      userMessage: 'Построй график',
      taskCount: 0,
      hasHierarchy: false,
    });

    assert.equal(result.route, 'initial_generation');
    assert.equal(result.reason, 'fallback_empty_project_defaults_to_initial_generation');
  });

  it('routes non-empty project requests to the ordinary mutation runtime by fallback', async () => {
    const result = await selectAgentRoute({
      userMessage: 'Покажи задачи по штукатурке',
      taskCount: 8,
      hasHierarchy: true,
    });

    assert.equal(result.route, 'mutation');
    assert.equal(result.reason, 'fallback_non_empty_project_defaults_to_mutation');
  });
});

describe('pi ordinary runtime integration surface', () => {
  it('keeps initial generation but routes ordinary existing-project work to Pi Agent Core', () => {
    const agentSource = readFileSync(join(repoRoot, 'packages/server/src/agent.ts'), 'utf-8');

    assert.match(agentSource, /runInitialGeneration/);
    assert.match(agentSource, /runPiOrdinaryAgent/);
    assert.doesNotMatch(agentSource, /runStagedMutation/);
    assert.doesNotMatch(agentSource, /mutation_staged_fallback_started/);
    assert.doesNotMatch(agentSource, /legacyFallbackAllowed/);
  });

  it('defines an agent card with trigger scope and least-privilege normalized tools', () => {
    assert.equal(GANTT_PI_AGENT_CARD.name, 'gantt-tool-agent');
    assert.equal(GANTT_PI_AGENT_CARD.mode, 'fast autonomous execution');
    assert.deepEqual(GANTT_PI_AGENT_CARD.tools, [
      'get_project_summary',
      'get_schedule_slice',
      'find_tasks',
      'get_task_context',
      'create_tasks',
      'update_tasks',
      'move_tasks',
      'shift_tasks',
      'change_task_duration',
      'delete_tasks',
      'link_tasks',
      'unlink_tasks',
      'recalculate_project',
      'validate_schedule',
    ]);
    assert.match(GANTT_PI_AGENT_CARD.doNotUseFor.join('\n'), /empty-project initial generation/);
  });

  it('locks prompt behavior for core tool-selection examples and unsupported absolute moves', () => {
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /find_tasks: быстрый поиск задач/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /shift_tasks: сдвинуть даты/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /link_tasks: создать predecessor-successor связь/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /validate_schedule: проверить график/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /Абсолютный перенос на дату сейчас не покрыт/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /Не делай validate_schedule после успешного изменения/);
  });

  it('tells the Pi agent to create simple new tasks autonomously when dates are omitted', () => {
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /не дал даты, не задавай уточняющий вопрос/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /get_project_summary/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /top-level задачу длительностью 1 день/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /effectiveDateRange\.endDate/);
  });

  it('locks prompt behavior for dependency creation without deterministic planning', () => {
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /type "project" запрещ/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /реалистичные FS-зависимости/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /стабильные id новым задачам/);
    assert.match(GANTT_PI_AGENT_SYSTEM_PROMPT, /найди обе через find_tasks и вызови link_tasks/);
  });

  it('detects mutating-looking requests only for failure fallback messaging', () => {
    assert.equal(looksLikeMutatingRequest('добавь сдачу технадзору'), true);
    assert.equal(looksLikeMutatingRequest('сдвинь штукатурку на 2 дня'), true);
    assert.equal(looksLikeMutatingRequest('свяжи исполнительную документацию и акт приемки'), true);
    assert.equal(looksLikeMutatingRequest('покажи задачи по штукатурке'), false);
  });
});
