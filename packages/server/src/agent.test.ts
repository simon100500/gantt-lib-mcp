import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessMutationOutcome, buildHistoryContext } from './agent.js';
import { resolveModelRoutingDecision } from './initial-generation/model-routing.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';
import { classifyMutationIntent } from './mutation/intent-classifier.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function semanticIntentQueryFor(userMessage: string) {
  const payloads: Record<string, Record<string, unknown>> = {
    'добавь сдачу технадзору': {
      intentType: 'add_single_task',
      confidence: 0.9,
      entitiesMentioned: ['сдача технадзору'],
      taskTitle: 'Сдача технадзору',
      durationDays: 1,
    },
    'добавь техприсоединение': {
      intentType: 'unsupported_or_ambiguous',
      confidence: 0.2,
      entitiesMentioned: [],
    },
    'сдвинь штукатурку на 2 дня': {
      intentType: 'shift_relative',
      confidence: 0.9,
      entitiesMentioned: ['штукатурка'],
      deltaDays: 2,
    },
    'перенеси фундамент на 2026-05-10': {
      intentType: 'move_to_date',
      confidence: 0.9,
      entitiesMentioned: ['фундамент'],
      targetDate: '2026-05-10',
    },
    'добавь покраску обоев на каждый этаж': {
      intentType: 'add_repeated_fragment',
      confidence: 0.9,
      entitiesMentioned: ['покраска обоев'],
      groupScopeHint: 'этаж',
      fragmentPlan: {
        title: 'Покраска обоев',
        nodes: [{ nodeKey: 'paint', title: 'Покраска обоев', durationDays: 2, dependsOnNodeKeys: [] }],
      },
    },
    'свяжи исполнительную документацию и акт приемки': {
      intentType: 'link_tasks',
      confidence: 0.9,
      entitiesMentioned: ['исполнительная документация', 'акт приемки'],
      dependency: { type: 'FS' },
    },
    'убери связь между исполнительной документацией и актом приемки': {
      intentType: 'unlink_tasks',
      confidence: 0.9,
      entitiesMentioned: ['исполнительная документация', 'акт приемки'],
    },
    'переименуй клининг': {
      intentType: 'rename_task',
      confidence: 0.9,
      entitiesMentioned: ['клининг'],
      renamedTitle: 'Клининг',
    },
    'сделай эту задачу красной': {
      intentType: 'update_metadata',
      confidence: 0.9,
      entitiesMentioned: ['эта задача'],
      metadataFields: { color: '#ff4d4f' },
    },
    'удали этап меблировки': {
      intentType: 'delete_task',
      confidence: 0.9,
      entitiesMentioned: ['этап меблировки'],
    },
    'распиши подробнее пункт "Инженерные системы"': {
      intentType: 'expand_wbs',
      confidence: 0.9,
      entitiesMentioned: ['Инженерные системы'],
      fragmentPlan: {
        title: 'Инженерные системы',
        nodes: [{ nodeKey: 'prep', title: 'Подготовка', durationDays: 2, dependsOnNodeKeys: [] }],
      },
    },
  };

  return async () => ({ content: JSON.stringify(payloads[userMessage] ?? { intentType: 'unsupported_or_ambiguous', confidence: 0.2, entitiesMentioned: [] }) });
}

const semanticEnv = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://example.test',
  OPENAI_MODEL: 'gpt-main',
};

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

describe('initial-generation route selection', () => {
  it('routes broad empty-project prompts into initial_generation', async () => {
    assert.deepEqual(await selectAgentRoute({
      userMessage: 'Построй типичный график строительства',
      taskCount: 0,
      hasHierarchy: false,
      model: 'gpt-route',
      routeDecisionQuery: async () => JSON.stringify({
        route: 'initial_generation',
        confidence: 0.96,
        reason: 'empty_project_broad_schedule_creation',
        signals: ['empty_project', 'user_requests_new_schedule', 'request_scope_is_broad'],
      }),
    }), {
      route: 'initial_generation',
      confidence: 0.96,
      reason: 'empty_project_broad_schedule_creation',
      signals: ['empty_project', 'user_requests_new_schedule', 'request_scope_is_broad'],
      isEmptyProject: true,
      hasHierarchy: false,
      taskCount: 0,
      projectStateSummary: 'empty_project=true, task_count=0, has_hierarchy=false',
      usedModelDecision: true,
    });
  });

  it('treats vague bootstrap prompts as initial generation, not clarification', async () => {
    assert.equal((await selectAgentRoute({
      userMessage: 'Построй график',
      taskCount: 0,
      hasHierarchy: false,
    })).route, 'initial_generation');
  });

  it('keeps ordinary edit prompts on mutation flow', async () => {
    assert.equal((await selectAgentRoute({
      userMessage: 'Сдвинь фундамент на 3 дня',
      taskCount: 4,
      hasHierarchy: true,
    })).route, 'mutation');
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
    const source = readFileSync(join(__dirname, '../src/agent.ts'), 'utf-8');

    assert.doesNotMatch(source, /parseInitialScheduleTemplateIntent/);
    assert.doesNotMatch(source, /tryInitialScheduleTemplateFastPath/);
    assert.doesNotMatch(source, /buildTypicalConstructionTemplate/);
  });

  it('logs route and model routing decisions before SDK execution', () => {
    const source = readFileSync(join(__dirname, '../src/agent.ts'), 'utf-8');

    assert.match(source, /route_selection/);
    assert.match(source, /route_decision_evidence/);
    assert.match(source, /model_routing_decision/);
    assert.match(source, /runInitialGeneration/);
    assert.match(source, /OPENAI_CHEAP_MODEL|cheap_model/);
  });

  it('removes lexical mutation routing shortcuts from agent.ts', () => {
    const source = readFileSync(join(__dirname, '../src/agent.ts'), 'utf-8');

    assert.doesNotMatch(source, /isMutationIntent/);
    assert.doesNotMatch(source, /isSimpleMutationRequest/);
    assert.doesNotMatch(source, /tryDirectShiftFastPath/);
    assert.doesNotMatch(source, /parseFastShiftIntent/);
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

describe('agent staged mutation lifecycle integration', () => {
  it('locks the classifier outputs for the core Russian mutation prompts', async () => {
    assert.equal((await classifyMutationIntent({ userMessage: 'добавь сдачу технадзору', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('добавь сдачу технадзору') })).intentType, 'add_single_task');
    assert.equal((await classifyMutationIntent({ userMessage: 'добавь техприсоединение', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('добавь техприсоединение') })).intentType, 'unsupported_or_ambiguous');
    assert.equal((await classifyMutationIntent({ userMessage: 'сдвинь штукатурку на 2 дня', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('сдвинь штукатурку на 2 дня') })).intentType, 'shift_relative');
    assert.equal((await classifyMutationIntent({ userMessage: 'перенеси фундамент на 2026-05-10', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('перенеси фундамент на 2026-05-10') })).intentType, 'move_to_date');
    assert.equal((await classifyMutationIntent({ userMessage: 'добавь покраску обоев на каждый этаж', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('добавь покраску обоев на каждый этаж') })).intentType, 'add_repeated_fragment');
    assert.equal((await classifyMutationIntent({ userMessage: 'свяжи исполнительную документацию и акт приемки', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('свяжи исполнительную документацию и акт приемки') })).intentType, 'link_tasks');
    assert.equal((await classifyMutationIntent({ userMessage: 'убери связь между исполнительной документацией и актом приемки', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('убери связь между исполнительной документацией и актом приемки') })).intentType, 'unlink_tasks');
    assert.equal((await classifyMutationIntent({ userMessage: 'переименуй клининг', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('переименуй клининг') })).intentType, 'rename_task');
    assert.equal((await classifyMutationIntent({ userMessage: 'сделай эту задачу красной', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('сделай эту задачу красной') })).intentType, 'update_metadata');
    assert.equal((await classifyMutationIntent({ userMessage: 'удали этап меблировки', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('удали этап меблировки') })).intentType, 'delete_task');
    assert.equal((await classifyMutationIntent({ userMessage: 'распиши подробнее пункт "Инженерные системы"', env: semanticEnv, semanticIntentQuery: semanticIntentQueryFor('распиши подробнее пункт "Инженерные системы"') })).intentType, 'expand_wbs');
  });

  it('hands ordinary edits into the staged shell before the legacy mutation attempt', () => {
    const source = readFileSync(join(__dirname, '../src/agent.ts'), 'utf-8');

    assert.match(source, /runStagedMutation/);
    assert.match(source, /mutation_lifecycle_started/);
    assert.match(source, /intent_classified/);
    assert.match(source, /execution_mode_selected/);
    assert.match(source, /legacyFallbackAllowed/);
    assert.match(source, /deferred_to_legacy/);

    const stagedIndex = source.indexOf('runStagedMutation({');
    const legacyIndex = source.indexOf('attemptResult = await executeAgentAttempt(');
    assert.notEqual(stagedIndex, -1);
    assert.notEqual(legacyIndex, -1);
    assert.ok(stagedIndex < legacyIndex, 'expected staged mutation handoff before legacy mutation attempt');
  });

  it('keeps the generic no-valid-tool-call message only in the legacy fallback branch', () => {
    const source = readFileSync(join(__dirname, '../src/agent.ts'), 'utf-8');
    const matches = source.match(/не выполнила ни одного валидного mutation tool call/g) ?? [];

    assert.equal(matches.length, 1);
    assert.match(source, /function buildNoMutationMessage\(\)/);
    assert.doesNotMatch(source, /staged.*не выполнила ни одного валидного mutation tool call/i);
  });

  it('locks the full_agent prompt to server-provided staged mutation context', () => {
    const prompt = readFileSync(join(__dirname, '../../mcp/agent/prompts/system.md'), 'utf-8');

    assert.match(prompt, /ResolvedMutationContext/);
    assert.match(prompt, /MutationPlan/);
    assert.match(prompt, /Do not invent task IDs/i);
    assert.match(prompt, /Do not invent dates/i);
    assert.match(prompt, /full_agent/);
  });
});
