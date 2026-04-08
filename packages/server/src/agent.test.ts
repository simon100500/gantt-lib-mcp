import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessMutationOutcome, buildHistoryContext, isMutationIntent, isSimpleMutationRequest, parseFastShiftIntent, resolveTasksByName } from './agent.js';
import { resolveModelRoutingDecision } from './initial-generation/model-routing.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('agent hierarchy mutation intent', () => {
  it('treats Russian nesting requests as mutations', () => {
    assert.equal(
      isMutationIntent('\u0421\u0434\u0435\u043b\u0430\u0439 \u0432\u043b\u043e\u0436\u0435\u043d\u043d\u043e\u0441\u0442\u044c: \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 "\u042d\u043b\u0435\u043a\u0442\u0440\u0438\u043a\u0430" \u0432\u043d\u0443\u0442\u0440\u044c "\u042d\u0442\u0430\u0436 2"'),
      true,
    );
    assert.equal(
      isMutationIntent('\u0421\u0434\u0435\u043b\u0430\u0439 "\u042d\u043b\u0435\u043a\u0442\u0440\u0438\u043a\u0430" \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0435\u0439 \u0434\u043b\u044f "\u042d\u0442\u0430\u0436 2"'),
      true,
    );
  });

  it('treats English hierarchy requests as mutations', () => {
    assert.equal(isMutationIntent('Nest Plumbing under Floor 2'), true);
    assert.equal(isMutationIntent('Move Finishing under Phase B as a child task'), true);
  });

  it('treats Russian relative shift requests as mutations', () => {
    assert.equal(isMutationIntent('сдвинь штукатурку на 2 дня'), true);
    assert.equal(isMutationIntent('перенеси штукатурку на 2 дня вперед'), true);
  });

  it('treats broad construction schedule bootstrap requests as mutations', () => {
    assert.equal(isMutationIntent('Построй типичный график строительства'), true);
    assert.equal(isMutationIntent('Составь примерный план строительства дома'), true);
    assert.equal(isMutationIntent('Построй график'), true);
  });
});

describe('agent system prompt hierarchy guidance', () => {
  it('documents structural move workflow for nesting', () => {
    const promptPath = join(__dirname, '../../mcp/agent/prompts/system.md');
    const prompt = readFileSync(promptPath, 'utf-8');

    assert.match(prompt, /Hierarchy Rules/);
    assert.match(prompt, /move_tasks/);
    assert.match(prompt, /real nesting|child work structurally|under a parent/i);
    assert.doesNotMatch(prompt, /\bparentId\b/);
  });

  it('documents container-first planning and validation', () => {
    const promptPath = join(__dirname, '../../mcp/agent/prompts/system.md');
    const prompt = readFileSync(promptPath, 'utf-8');

    assert.match(prompt, /Find the container/i);
    assert.match(prompt, /small intentional fragment|small meaningful fragment/i);
    assert.match(prompt, /Validate the authoritative result before answering/i);
    assert.match(prompt, /Avoid duplicates/i);
  });

  it('documents normalized dependency and shift tools', () => {
    const promptPath = join(__dirname, '../../mcp/agent/prompts/system.md');
    const prompt = readFileSync(promptPath, 'utf-8');

    assert.match(prompt, /link_tasks/i);
    assert.match(prompt, /unlink_tasks/i);
    assert.match(prompt, /shift_tasks/i);
    assert.match(prompt, /Do not invent task IDs/i);
    assert.doesNotMatch(prompt, /`set_dependency`|`remove_dependency`|`resize_task`|`recalculate_schedule`/);
  });
});

describe('agent simple mutation heuristic', () => {
  it('detects short add-task requests as simple mutations', () => {
    assert.equal(isSimpleMutationRequest('добавь задачи по штукатурке'), true);
    assert.equal(isSimpleMutationRequest('add plaster tasks'), true);
    assert.equal(isSimpleMutationRequest('добавь отдельным блоком сантехнику'), true);
    assert.equal(isSimpleMutationRequest('add separate block for plumbing'), true);
  });

  it('treats broad planning requests as non-simple', () => {
    assert.equal(isSimpleMutationRequest('Создай график строительства с этапами и зависимостями'), false);
    assert.equal(isSimpleMutationRequest('add tasks for all floors with dependencies'), false);
  });
});

describe('initial-generation route selection', () => {
  it('routes broad empty-project prompts into initial_generation', () => {
    assert.deepEqual(selectAgentRoute({
      userMessage: 'Построй типичный график строительства',
      taskCount: 0,
      hasHierarchy: false,
    }), {
      route: 'initial_generation',
      reason: 'empty_project_broad_generation_request',
      isEmptyProject: true,
      requestClass: 'broad_generation',
      hasHierarchy: false,
      taskCount: 0,
    });
  });

  it('treats vague bootstrap prompts as initial generation, not clarification', () => {
    assert.equal(selectAgentRoute({
      userMessage: 'Построй график',
      taskCount: 0,
      hasHierarchy: false,
    }).route, 'initial_generation');
  });

  it('keeps ordinary edit prompts on mutation flow', () => {
    assert.equal(selectAgentRoute({
      userMessage: 'Сдвинь фундамент на 3 дня',
      taskCount: 4,
      hasHierarchy: true,
    }).route, 'mutation');
  });
});

describe('initial-generation model routing', () => {
  it('uses the strong model for initial generation', () => {
    assert.deepEqual(resolveModelRoutingDecision({
      route: 'initial_generation',
      env: {
        OPENAI_MODEL: 'gpt-strong',
      },
    }), {
      route: 'initial_generation',
      tier: 'strong',
      selectedModel: 'gpt-strong',
      reason: 'initial_generation_requires_strong_model',
    });
  });

  it('uses the cheap model for mutation when configured', () => {
    assert.deepEqual(resolveModelRoutingDecision({
      route: 'mutation',
      env: {
        OPENAI_MODEL: 'gpt-strong',
        OPENAI_CHEAP_MODEL: 'gpt-cheap',
      },
    }), {
      route: 'mutation',
      tier: 'cheap',
      selectedModel: 'gpt-cheap',
      reason: 'mutation_prefers_cheap_model',
    });
  });

  it('falls back deterministically to the main model when the cheap model is missing', () => {
    assert.deepEqual(resolveModelRoutingDecision({
      route: 'mutation',
      env: {
        OPENAI_MODEL: 'gpt-strong',
      },
    }), {
      route: 'mutation',
      tier: 'main_fallback',
      selectedModel: 'gpt-strong',
      reason: 'cheap_model_missing_fallback_to_main',
    });
  });
});

describe('agent initial-generation integration surface', () => {
  it('removes the legacy template fast path from agent.ts', () => {
    const source = readFileSync(join(__dirname, 'agent.ts'), 'utf-8');

    assert.doesNotMatch(source, /parseInitialScheduleTemplateIntent/);
    assert.doesNotMatch(source, /tryInitialScheduleTemplateFastPath/);
    assert.doesNotMatch(source, /buildTypicalConstructionTemplate/);
  });

  it('logs route and model routing decisions before SDK execution', () => {
    const source = readFileSync(join(__dirname, 'agent.ts'), 'utf-8');

    assert.match(source, /route_selection/);
    assert.match(source, /model_routing_decision/);
    assert.match(source, /runInitialGeneration/);
    assert.match(source, /OPENAI_CHEAP_MODEL|cheap_model/);
  });
});

describe('agent fast shift parsing', () => {
  it('parses direct Russian shift commands for the cheap path', () => {
    assert.deepEqual(parseFastShiftIntent('сдвинь штукатурку потолка на 2 дня'), {
      taskName: 'штукатурку потолка',
      delta: 2,
      mode: 'project_default',
    });
    assert.deepEqual(parseFastShiftIntent('сдвинь "Штукатурка потолка" на 3 рабочих дня'), {
      taskName: 'Штукатурка потолка',
      delta: 3,
      mode: 'working',
    });
    assert.deepEqual(parseFastShiftIntent('сдвинь штукатурку стен на неделю'), {
      taskName: 'штукатурку стен',
      delta: 7,
      mode: 'project_default',
    });
    assert.deepEqual(parseFastShiftIntent('сдвинь штукатурку стен на 2 недели'), {
      taskName: 'штукатурку стен',
      delta: 14,
      mode: 'project_default',
    });
  });

  it('does not parse vague natural-language drift as a direct cheap-path shift', () => {
    assert.equal(parseFastShiftIntent('опаздываем с штукатуркой на 2 дня'), null);
    assert.equal(parseFastShiftIntent('надо бы штукатурку чуть подвинуть'), null);
  });
});

describe('agent fast shift task resolution', () => {
  it('resolves duplicate exact-name matches as a multi-task target', () => {
    const result = resolveTasksByName([
      { id: '1', name: 'Штукатурка стен', startDate: '2026-04-01', endDate: '2026-04-03' },
      { id: '2', name: 'Штукатурка стен', startDate: '2026-04-05', endDate: '2026-04-07' },
      { id: '3', name: 'Штукатурка потолка', startDate: '2026-04-02', endDate: '2026-04-04' },
    ], 'штукатурку стен');

    assert.equal(result.kind, 'exact');
    assert.deepEqual(result.matches.map((task) => task.id), ['1', '2']);
  });
});

describe('agent history context', () => {
  it('trims mutation history aggressively', () => {
    const history = buildHistoryContext(
      Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message-${index}-${'x'.repeat(200)}`,
      })),
      true,
    );

    assert.ok(history.length <= 1700, `expected compact history, got ${history.length} chars`);
    assert.doesNotMatch(history, /message-0-/);
    assert.doesNotMatch(history, /message-3-/);
    assert.match(history, /message-4-/);
  });
});

describe('agent mutation verification assessment', () => {
  it('detects mismatch between accepted changedTaskIds and actual snapshot diff', () => {
    const result = assessMutationOutcome(
      [
        {
          toolUseId: 'tool-1',
          toolName: 'shift_tasks',
          status: 'accepted',
          changedTaskIds: ['A'],
        },
      ],
      ['A', 'B'],
    );

    assert.equal(result.mutationAttempted, true);
    assert.equal(result.acceptedMutationCalls.length, 1);
    assert.equal(result.acceptedChangedTaskIdMismatch, true);
  });

  it('accepts matching authoritative changedTaskIds', () => {
    const result = assessMutationOutcome(
      [
        {
          toolUseId: 'tool-1',
          toolName: 'move_tasks',
          status: 'accepted',
          changedTaskIds: ['B', 'A'],
        },
      ],
      ['A', 'B'],
    );

    assert.equal(result.acceptedChangedTaskIdMismatch, false);
    assert.deepEqual(result.acceptedChangedTaskIds, ['A', 'B']);
  });

  it('infers accepted mutation when tool call is observed and snapshot changed', () => {
    const result = assessMutationOutcome(
      [
        {
          toolUseId: 'tool-1',
          toolName: 'create_tasks',
        },
      ],
      ['A'],
    );

    assert.equal(result.mutationAttempted, true);
    assert.equal(result.acceptedMutationCalls.length, 1);
    assert.equal(result.acceptedMutationCalls[0]?.status, 'accepted');
    assert.deepEqual(result.acceptedChangedTaskIds, ['A']);
    assert.equal(result.acceptedChangedTaskIdMismatch, false);
  });
});
