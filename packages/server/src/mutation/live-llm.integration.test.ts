import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import dotenv from 'dotenv';

import { classifyMutationIntent } from './intent-classifier.js';
import { runStagedMutation } from './orchestrator.js';

dotenv.config({ path: join(process.cwd(), '.env') });

const liveEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/',
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
  OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
};

const hasLiveLlmConfig = Boolean(liveEnv.OPENAI_API_KEY && liveEnv.OPENAI_BASE_URL && liveEnv.OPENAI_MODEL);

const liveDescribe = hasLiveLlmConfig ? describe : describe.skip;

liveDescribe('live LLM mutation integration', () => {
  it('classifies duration-change language as change_duration instead of shift', { timeout: 45_000 }, async () => {
    const intent = await classifyMutationIntent({
      userMessage: 'увеличь срок штукатурки в 2 раза',
      env: liveEnv,
    });

    assert.equal(intent.intentType, 'change_duration');
    assert.notEqual(intent.intentType, 'shift_relative');
    assert.ok((intent.durationMultiplier ?? 0) > 1);
  });

  it('classifies additive duration language as a duration delta, not an absolute duration', { timeout: 45_000 }, async () => {
    const intent = await classifyMutationIntent({
      userMessage: 'увеличь Покраска стен в МОП на 20 дней',
      env: liveEnv,
    });

    assert.equal(intent.intentType, 'change_duration');
    assert.equal(intent.durationDeltaDays, 20);
    assert.equal(intent.durationDays, undefined);
  });

  it('uses the live LLM and staged path to create a closeout task with dependency semantics', { timeout: 45_000 }, async () => {
    const committedCommands: Array<Record<string, unknown>> = [];

    const result = await runStagedMutation({
      userMessage: 'Добавь сдачу ГАСН в конце работ',
      projectId: 'project-live-test',
      projectVersion: 32,
      sessionId: 'session-live-test',
      runId: 'run-live-test-closeout',
      tasksBefore: [
        {
          id: 'container-closeout',
          name: 'Благоустройство и сдача',
          startDate: '2027-04-01',
          endDate: '2027-05-04',
        },
        {
          id: 'task-landscaping',
          name: 'Озеленение',
          parentId: 'container-closeout',
          startDate: '2027-04-01',
          endDate: '2027-04-10',
        },
        {
          id: 'task-permit',
          name: 'Получение разрешения на ввод объекта в эксплуатацию',
          parentId: 'container-closeout',
          startDate: '2027-04-29',
          endDate: '2027-05-04',
        },
      ],
      env: liveEnv,
      messageService: {
        add: async () => undefined,
      },
      taskService: {
        list: async () => ({
          tasks: [
            {
              id: 'container-closeout',
              name: 'Благоустройство и сдача',
              startDate: '2027-04-01',
              endDate: '2027-05-05',
            },
            {
              id: 'task-landscaping',
              name: 'Озеленение',
              parentId: 'container-closeout',
              startDate: '2027-04-01',
              endDate: '2027-04-10',
            },
            {
              id: 'task-permit',
              name: 'Получение разрешения на ввод объекта в эксплуатацию',
              parentId: 'container-closeout',
              startDate: '2027-04-29',
              endDate: '2027-05-04',
            },
            {
              id: 'task-permit:sdacha-gasn',
              name: 'Сдача ГАСН',
              parentId: 'container-closeout',
              startDate: '2027-05-05',
              endDate: '2027-05-05',
              dependencies: [{ taskId: 'task-permit', type: 'FS' }],
            },
          ],
        }),
        findTasksByName: async () => [],
        findContainerCandidates: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
            endDate: '2027-05-04',
            matchType: 'includes',
            score: 0.72,
          },
        ]),
        listBranchTasks: async () => ([
          {
            taskId: 'container-closeout',
            name: 'Благоустройство и сдача',
            parentId: null,
            path: ['Благоустройство и сдача'],
            startDate: '2027-04-01',
            endDate: '2027-05-04',
            matchType: 'exact',
            score: 1,
          },
          {
            taskId: 'task-landscaping',
            name: 'Озеленение',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Озеленение'],
            startDate: '2027-04-01',
            endDate: '2027-04-10',
            matchType: 'includes',
            score: 0.8,
          },
          {
            taskId: 'task-permit',
            name: 'Получение разрешения на ввод объекта в эксплуатацию',
            parentId: 'container-closeout',
            path: ['Благоустройство и сдача', 'Получение разрешения на ввод объекта в эксплуатацию'],
            startDate: '2027-04-29',
            endDate: '2027-05-04',
            matchType: 'includes',
            score: 0.82,
          },
        ]),
        findGroupScopes: async () => [],
      },
      commandService: {
        commitCommand: async (request: Record<string, any>) => {
          committedCommands.push(request.command);
          return {
            accepted: true,
            clientRequestId: request.clientRequestId,
            baseVersion: request.baseVersion,
            newVersion: request.baseVersion + 1,
            result: {
              snapshot: { tasks: [], dependencies: [] },
              changedTaskIds: ['task-permit:sdacha-gasn'],
              changedDependencyIds: [],
              conflicts: [],
              patches: [],
            },
            snapshot: { tasks: [], dependencies: [] },
          };
        },
      },
      broadcastToSession: () => undefined,
      logger: {
        debug: () => undefined,
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(committedCommands[0]?.type, 'create_task');
    assert.deepEqual((committedCommands[0]?.task as { dependencies?: Array<{ taskId: string; type: string }> } | undefined)?.dependencies, [{ taskId: 'task-permit', type: 'FS' }]);
  });
});
