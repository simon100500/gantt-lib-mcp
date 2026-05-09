import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';

import { getPrisma } from '@gantt/runtime-core/prisma';
import { projectService, taskService, historyService } from '@gantt/mcp/services';

import { runPiOrdinaryAgent } from './agent/pi-agent-runner.js';
import { selectAgentRoute } from './initial-generation/route-selection.js';

dotenv.config({ path: join(process.cwd(), '.env') });

const liveEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
};

const hasLiveLlmConfig = Boolean(liveEnv.OPENAI_API_KEY && liveEnv.OPENAI_BASE_URL && liveEnv.OPENAI_MODEL);
const liveDescribe = hasLiveLlmConfig ? describe : describe.skip;

type SeedTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  parentId?: string;
  sortOrder: number;
};

type SeedDependency = {
  id: string;
  taskId: string;
  depTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
};

const RENOVATION_TASKS: SeedTask[] = [
  { id: 'root-renovation', name: 'Ремонт квартиры', startDate: '2027-01-01', endDate: '2027-03-31', sortOrder: 0 },
  { id: 'root-prep', name: 'Подготовительные работы', startDate: '2027-01-01', endDate: '2027-01-07', parentId: 'root-renovation', sortOrder: 1 },
  { id: 'temporary-fence', name: 'Временное ограждение', startDate: '2027-01-01', endDate: '2027-01-02', parentId: 'root-prep', sortOrder: 2 },
  { id: 'root-finishing', name: 'Отделка МОП', startDate: '2027-01-08', endDate: '2027-03-20', parentId: 'root-renovation', sortOrder: 3 },
  { id: 'plaster', name: 'Штукатурные работы', startDate: '2027-01-08', endDate: '2027-01-17', parentId: 'root-finishing', sortOrder: 4 },
  { id: 'paint', name: 'Покраска стен в МОП', startDate: '2027-01-20', endDate: '2027-01-25', parentId: 'root-finishing', sortOrder: 5 },
  { id: 'electrical', name: 'Электромонтаж', startDate: '2027-01-08', endDate: '2027-01-14', parentId: 'root-renovation', sortOrder: 6 },
  { id: 'rough-electrical', name: 'Черновой электромонтаж', startDate: '2027-01-08', endDate: '2027-01-12', parentId: 'electrical', sortOrder: 7 },
  { id: 'tile', name: 'Укладка керамогранита', startDate: '2027-01-26', endDate: '2027-01-31', parentId: 'root-finishing', sortOrder: 8 },
  { id: 'acceptance', name: 'Приемка', startDate: '2027-03-21', endDate: '2027-03-22', parentId: 'root-renovation', sortOrder: 9 },
];

const RENOVATION_DEPENDENCIES: SeedDependency[] = [
  { id: 'dep-plaster-paint', taskId: 'paint', depTaskId: 'plaster', type: 'FS' },
  { id: 'dep-paint-tile', taskId: 'tile', depTaskId: 'paint', type: 'FS' },
];

async function ensureOwnerContext() {
  const prisma = getPrisma();
  const email = process.env.AGENT_E2E_USER_EMAIL ?? 'agent-e2e@gantt.local';

  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
      },
      select: { id: true },
    });
  }

  const group = await projectService.ensureDefaultGroup(user.id);
  return { userId: user.id, groupId: group.id };
}

async function createRenovationProject() {
  const prisma = getPrisma();
  const owner = await ensureOwnerContext();
  const project = await projectService.create(owner.userId, `AI Live Shift E2E ${randomUUID()}`, owner.groupId);

  await prisma.task.createMany({
    data: RENOVATION_TASKS.map((task) => ({
      id: task.id,
      projectId: project.id,
      name: task.name,
      startDate: new Date(`${task.startDate}T00:00:00Z`),
      endDate: new Date(`${task.endDate}T00:00:00Z`),
      type: 'task',
      status: 'not_started',
      color: null,
      progress: 0,
      workVolume: null,
      workUnit: null,
      completedVolume: 0,
      parentId: task.parentId ?? null,
      sortOrder: task.sortOrder,
    })),
  });

  await prisma.dependency.createMany({
    data: RENOVATION_DEPENDENCIES.map((dependency) => ({
      id: dependency.id,
      taskId: dependency.taskId,
      depTaskId: dependency.depTaskId,
      type: dependency.type,
      lag: 0,
    })),
  });

  return {
    owner,
    projectId: project.id,
  };
}

function isoDate(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : new Date(value).toISOString()).slice(0, 10);
}

function diffDays(startBefore: string, startAfter: string): number {
  const before = new Date(`${startBefore}T00:00:00Z`).getTime();
  const after = new Date(`${startAfter}T00:00:00Z`).getTime();
  return Math.round((after - before) / 86_400_000);
}

liveDescribe('pi ordinary agent live e2e', () => {
  it('calls tools and shifts the task for "сдвинь штукатурные работы на 2 дня"', { timeout: 120_000 }, async () => {
    const prisma = getPrisma();
    const { owner, projectId } = await createRenovationProject();

    try {
      const beforeTasks = (await taskService.list(projectId, undefined, 1000, 0)).tasks;
      const beforePlaster = beforeTasks.find((task) => task.id === 'plaster');
      assert.ok(beforePlaster, 'expected plaster task in fixture');

      const route = await selectAgentRoute({
        userMessage: 'сдвинь штукатурные работы на 2 дня',
        taskCount: beforeTasks.length,
        hasHierarchy: beforeTasks.some((task) => Boolean(task.parentId)),
      });

      assert.equal(route.route, 'mutation');

      const runId = randomUUID();
      const historyGroupId = (await historyService.getLatestVisibleGroupId(projectId)) ?? 'initial';
      const result = await runPiOrdinaryAgent({
        userMessage: 'сдвинь штукатурные работы на 2 дня',
        projectId,
        sessionId: `agent-live-e2e-${randomUUID()}`,
        runId,
        userId: owner.userId,
        env: liveEnv,
        messages: [],
        historyGroupId,
        requestContextId: runId,
        historyTitle: 'AI - live shift e2e',
        mutationRoute: true,
        taskService,
        broadcastToSession: () => undefined,
        logger: {
          debug: async () => undefined,
        },
      });

      assert.ok(result.toolCallCount > 0, 'expected at least one tool call');
      assert.ok(
        result.toolFacts.some((fact) => fact.name === 'shift_tasks'),
        'expected shift_tasks to be called',
      );
      assert.ok(
        result.acceptedMutatingToolCalls.some((fact) => fact.name === 'shift_tasks'),
        'expected an accepted shift_tasks mutation',
      );
      assert.equal(result.rejectedMutatingToolCalls.length, 0);
      assert.doesNotMatch(result.assistantResponse, /не выполнил ни одного tool call/i);

      const afterTasks = (await taskService.list(projectId, undefined, 1000, 0)).tasks;
      const afterPlaster = afterTasks.find((task) => task.id === 'plaster');
      assert.ok(afterPlaster, 'expected plaster task after mutation');

      const shiftDelta = diffDays(isoDate(beforePlaster.startDate), isoDate(afterPlaster.startDate));
      assert.ok(shiftDelta >= 2, `expected plaster task to move by at least 2 days, got ${shiftDelta}`);
    } finally {
      await prisma.project.delete({
        where: { id: projectId },
      });
    }
  });
});
