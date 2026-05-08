import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import { query, isSDKAssistantMessage, isSDKPartialAssistantMessage, isSDKResultMessage } from '@qwen-code/sdk';

dotenv.config({ path: join(process.cwd(), '.env') });

const {
  getPrisma,
} = await import('../packages/runtime-core/dist/prisma.js');
const {
  projectService,
} = await import('../packages/runtime-core/dist/services/project.service.js');
const {
  commandService,
  messageService,
  taskService,
  historyService,
} = await import('../packages/mcp/dist/services/index.js');
const {
  runPiOrdinaryAgent,
} = await import('../packages/server/dist/agent/pi-agent-runner.js');
const {
  runInitialGeneration,
} = await import('../packages/server/dist/initial-generation/orchestrator.js');
const {
  selectAgentRoute,
} = await import('../packages/server/dist/initial-generation/route-selection.js');

type TaskSnapshot = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: 'task' | 'milestone';
  parentId?: string;
  status?: 'not_started' | 'in_progress' | 'done' | 'closed';
  progress?: number;
  color?: string;
  sortOrder?: number;
};

type DependencySnapshot = {
  id: string;
  taskId: string;
  depTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag?: number;
};

type FixtureSnapshot = {
  name: string;
  tasks: TaskSnapshot[];
  dependencies: DependencySnapshot[];
};

type ScenarioExpectation = {
  route: 'mutation' | 'initial_generation';
  minTaskCount?: number;
  createdTaskNames?: string[];
  absentTaskNames?: string[];
  renamedTask?: {
    beforeName: string;
    afterName: string;
  };
  durationTask?: {
    name: string;
    minDeltaDays?: number;
    minMultiplier?: number;
  };
  shiftedTask?: {
    name: string;
    minStartDeltaDays: number;
  };
  dependency?: {
    predecessorName: string;
    successorName: string;
    exists: boolean;
  };
  parentTask?: {
    taskName: string;
    parentName: string;
  };
};

type Scenario = {
  id: string;
  origin: 'log' | 'synthetic';
  description: string;
  userMessage: string;
  fixture: 'empty' | 'closeout' | 'renovation';
  expectation: ScenarioExpectation;
  logRequestContextId?: string;
};

type OwnerContext = {
  userId: string;
  groupId: string;
  sessionId: string;
};

type RouteResult = Awaited<ReturnType<typeof selectAgentRoute>>;

type JudgeVerdict = {
  verdict: 'success' | 'partial' | 'failure';
  matchedRequest: boolean;
  hasError: boolean;
  score: number;
  explanation: string;
  issues: string[];
};

type ScenarioResult = {
  id: string;
  origin: 'log' | 'synthetic';
  description: string;
  request: string;
  route: RouteResult['route'];
  expectedRoute: ScenarioExpectation['route'];
  assistantResponse: string;
  toolCallCount: number;
  acceptedMutations: number;
  rejectedMutations: number;
  structuralPass: boolean;
  hardError: boolean;
  judge: JudgeVerdict;
  success: boolean;
  notes: string[];
  durationMs: number;
  beforeTaskCount: number;
  afterTaskCount: number;
  createdTaskNames: string[];
  deletedTaskNames: string[];
  changedTaskNames: string[];
  sourceLogMessage?: {
    projectId: string;
    projectName: string;
    createdAt: string;
    content: string;
  } | null;
};

type ExecutionResult = {
  route: 'mutation' | 'initial_generation';
  assistantResponse: string;
  toolCallCount: number;
  acceptedMutations: number;
  rejectedMutations: number;
  durationMs: number;
};

const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4/',
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'glm-4.7',
  OPENAI_CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL ?? process.env.cheap_model ?? undefined,
};

const ARTIFACT_ROOT = join(process.cwd(), '.artifacts', 'agent-e2e');
const REPORT_LABEL = process.argv[2]?.trim() || `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toIsoDate(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : new Date(value).toISOString()).slice(0, 10);
}

function diffDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function buildCloseoutFixture(): FixtureSnapshot {
  return {
    name: 'Closeout Fixture',
    tasks: [
      { id: 'closeout-root', name: 'Благоустройство и сдача', startDate: '2027-04-01', endDate: '2027-05-10', sortOrder: 0 },
      { id: 'landscaping', name: 'Озеленение', startDate: '2027-04-01', endDate: '2027-04-10', parentId: 'closeout-root', sortOrder: 1 },
      { id: 'permit', name: 'Получение разрешения на ввод объекта в эксплуатацию', startDate: '2027-04-29', endDate: '2027-05-04', parentId: 'closeout-root', sortOrder: 2 },
      { id: 'handover', name: 'Подготовка исполнительной документации', startDate: '2027-04-20', endDate: '2027-04-28', parentId: 'closeout-root', sortOrder: 3 },
    ],
    dependencies: [
      { id: 'dep-handover-permit', taskId: 'permit', depTaskId: 'handover', type: 'FS' },
    ],
  };
}

function buildRenovationFixture(): FixtureSnapshot {
  return {
    name: 'Renovation Fixture',
    tasks: [
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
    ],
    dependencies: [
      { id: 'dep-plaster-paint', taskId: 'paint', depTaskId: 'plaster', type: 'FS' },
      { id: 'dep-paint-tile', taskId: 'tile', depTaskId: 'paint', type: 'FS' },
    ],
  };
}

const FIXTURES: Record<Exclude<Scenario['fixture'], 'empty'>, FixtureSnapshot> = {
  closeout: buildCloseoutFixture(),
  renovation: buildRenovationFixture(),
};

const SCENARIOS: Scenario[] = [
  {
    id: 'log-initial-operator-room',
    origin: 'log',
    description: 'Initial generation from a short real prompt',
    userMessage: 'Ремонт операторной',
    fixture: 'empty',
    expectation: {
      route: 'initial_generation',
      minTaskCount: 8,
    },
    logRequestContextId: 'e469723f-367a-4641-8aab-4a16b91d03e8',
  },
  {
    id: 'log-initial-online-store',
    origin: 'log',
    description: 'Initial generation from a structured real business prompt',
    userMessage: 'нужно запустить интернет-магазин за 2 месяца: дизайн, разработка, каталог, оплата, доставка, тестирование',
    fixture: 'empty',
    expectation: {
      route: 'initial_generation',
      minTaskCount: 10,
    },
    logRequestContextId: 'd156f61d-0af7-4c1a-b1c9-9e43deadab3b',
  },
  {
    id: 'log-add-gasn-closeout',
    origin: 'log',
    description: 'Add a closeout task at the end of the works',
    userMessage: 'Добавь сдачу ГАСН в конце работ',
    fixture: 'closeout',
    expectation: {
      route: 'mutation',
      createdTaskNames: ['Сдача ГАСН'],
      dependency: {
        predecessorName: 'Получение разрешения на ввод объекта в эксплуатацию',
        successorName: 'Сдача ГАСН',
        exists: true,
      },
    },
    logRequestContextId: '75625c26-1fbb-491b-852d-044c8c4a8173',
  },
  {
    id: 'log-add-cleaning-to-plaster',
    origin: 'log',
    description: 'Add a task into an existing branch',
    userMessage: 'Добавь клининг в штукатурные работы',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      createdTaskNames: ['Клининг'],
      parentTask: {
        taskName: 'Клининг',
        parentName: 'Штукатурные работы',
      },
    },
    logRequestContextId: '68a8988b-0461-4ba5-b998-20ce00c7cc45',
  },
  {
    id: 'log-duration-multiplier',
    origin: 'log',
    description: 'Multiply task duration from a real prompt',
    userMessage: 'Увеличь Штукатурные работы в 2 раза',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      durationTask: {
        name: 'Штукатурные работы',
        minMultiplier: 1.8,
      },
    },
    logRequestContextId: '23756196-7f49-4725-bc58-1ef95a15c68e',
  },
  {
    id: 'log-duration-delta',
    origin: 'log',
    description: 'Add days to duration from a real prompt',
    userMessage: 'увеличь Покраска стен в МОП на 20 дней',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      durationTask: {
        name: 'Покраска стен в МОП',
        minDeltaDays: 18,
      },
    },
    logRequestContextId: '6dbdb009-4735-4018-8e73-4a4a50ccbaae',
  },
  {
    id: 'log-decompose-plaster',
    origin: 'log',
    description: 'Decompose a task into explicit subtasks from a real prompt',
    userMessage: 'Разбить задачу «Штукатурные работы» на подзадачи. Уточнения: подготовка, штукатурка стен, осушение',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      createdTaskNames: ['подготовка', 'штукатурка стен', 'осушение'],
    },
    logRequestContextId: 'fe9ff0d4-34db-40d6-aff9-2bddfcce50c9',
  },
  {
    id: 'synthetic-shift-electrical',
    origin: 'synthetic',
    description: 'Shift a task later in natural language',
    userMessage: 'сдвинь электромонтаж на 3 дня позже',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      shiftedTask: {
        name: 'Электромонтаж',
        minStartDeltaDays: 3,
      },
    },
  },
  {
    id: 'synthetic-rename-rough-electrical',
    origin: 'synthetic',
    description: 'Rename a task',
    userMessage: 'переименуй черновой электромонтаж в Электромонтаж первого этапа',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      renamedTask: {
        beforeName: 'Черновой электромонтаж',
        afterName: 'Электромонтаж первого этапа',
      },
    },
  },
  {
    id: 'synthetic-delete-temporary-fence',
    origin: 'synthetic',
    description: 'Delete an existing task',
    userMessage: 'удали временное ограждение',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      absentTaskNames: ['Временное ограждение'],
    },
  },
  {
    id: 'synthetic-link-plaster-paint',
    origin: 'synthetic',
    description: 'Link two tasks',
    userMessage: 'свяжи штукатурные работы и покраску стен в МОП',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      dependency: {
        predecessorName: 'Штукатурные работы',
        successorName: 'Покраска стен в МОП',
        exists: true,
      },
    },
  },
  {
    id: 'synthetic-unlink-plaster-paint',
    origin: 'synthetic',
    description: 'Unlink two tasks',
    userMessage: 'убери связь между штукатурными работами и покраской стен в МОП',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      dependency: {
        predecessorName: 'Штукатурные работы',
        successorName: 'Покраска стен в МОП',
        exists: false,
      },
    },
  },
  {
    id: 'synthetic-move-paint-under-electrical',
    origin: 'synthetic',
    description: 'Move a task into another branch',
    userMessage: 'перенеси покраску стен в МОП в электромонтаж',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      parentTask: {
        taskName: 'Покраска стен в МОП',
        parentName: 'Электромонтаж',
      },
    },
  },
  {
    id: 'synthetic-combo-add-acceptance-after-plaster',
    origin: 'synthetic',
    description: 'Create and link a follow-up task with one user instruction',
    userMessage: 'добавь приемку штукатурки после штукатурных работ и свяжи ее с покраской стен в МОП',
    fixture: 'renovation',
    expectation: {
      route: 'mutation',
      createdTaskNames: ['Приемка штукатурки'],
      dependency: {
        predecessorName: 'Приемка штукатурки',
        successorName: 'Покраска стен в МОП',
        exists: true,
      },
    },
  },
];

function buildSdkEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  const sdkEnv: Record<string, string> = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_MODEL: env.OPENAI_MODEL,
    ...extraEnv,
  };

  if (env.OPENAI_CHEAP_MODEL) {
    sdkEnv.OPENAI_CHEAP_MODEL = env.OPENAI_CHEAP_MODEL;
  }

  return sdkEnv;
}

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
    .map((block) => block.text ?? '')
    .join('');
}

async function executeInitialGenerationPlannerQuery(prompt: string, model: string): Promise<string> {
  const session = query({
    prompt,
    options: {
      authType: 'openai',
      model,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      env: buildSdkEnv(),
      maxSessionTurns: 3,
    },
  });

  let content = '';
  for await (const event of session) {
    if (isSDKPartialAssistantMessage(event)) {
      continue;
    }

    if (isSDKAssistantMessage(event)) {
      const text = extractAssistantText(event.message.content as Array<{ type: string; text?: string }>);
      if (text.trim().length > 0) {
        content = text;
      }
    }

    if (isSDKResultMessage(event)) {
      if (event.is_error) {
        throw new Error(typeof event.error === 'string' ? event.error : 'initial generation planner failed');
      }

      if (typeof event.result === 'string' && event.result.trim().length > 0) {
        content = event.result;
      }
      break;
    }
  }

  if (content.trim().length === 0) {
    throw new Error('initial generation planner returned empty response');
  }

  return content;
}

async function fetchSourceLogMessage(requestContextId: string | undefined): Promise<ScenarioResult['sourceLogMessage']> {
  if (!requestContextId) {
    return null;
  }

  const prisma = getPrisma();
  const row = await prisma.message.findFirst({
    where: {
      requestContextId,
      role: 'user',
      deletedAt: null,
    },
    select: {
      content: true,
      createdAt: true,
      projectId: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return {
    projectId: row.projectId,
    projectName: row.project.name,
    createdAt: row.createdAt.toISOString(),
    content: row.content,
  };
}

async function resolveOwnerContext(): Promise<OwnerContext> {
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
  let bootstrapProject = await prisma.project.findFirst({
    where: {
      userId: user.id,
      status: 'active',
    },
    select: { id: true },
  });

  if (!bootstrapProject) {
    const created = await projectService.create(user.id, 'AI E2E Bootstrap', group.id);
    bootstrapProject = { id: created.id };
  }

  let session = await prisma.session.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!session) {
    session = await prisma.session.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        projectId: bootstrapProject.id,
        accessToken: `agent-e2e-access-${randomUUID()}`,
        refreshToken: `agent-e2e-refresh-${randomUUID()}`,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
  }

  return {
    userId: user.id,
    groupId: group.id,
    sessionId: session.id,
  };
}

async function createProjectFromFixture(owner: OwnerContext, fixture: Scenario['fixture'], label: string): Promise<string> {
  const project = await projectService.create(owner.userId, `AI E2E ${label}`, owner.groupId);
  const projectId = project.id;

  if (fixture === 'empty') {
    return projectId;
  }

  const snapshot = FIXTURES[fixture];
  const prisma = getPrisma();
  const tasksByDepth = new Map<number, TaskSnapshot[]>();

  for (const task of snapshot.tasks) {
    let depth = 0;
    let currentParentId = task.parentId;
    while (currentParentId) {
      const parent = snapshot.tasks.find((candidate) => candidate.id === currentParentId);
      currentParentId = parent?.parentId;
      depth += 1;
    }

    const bucket = tasksByDepth.get(depth) ?? [];
    bucket.push(task);
    tasksByDepth.set(depth, bucket);
  }

  for (const depth of [...tasksByDepth.keys()].sort((left, right) => left - right)) {
    const batch = tasksByDepth.get(depth) ?? [];
    if (batch.length === 0) {
      continue;
    }

    await prisma.task.createMany({
      data: batch.map((task) => ({
        id: task.id,
        projectId,
        name: task.name,
        startDate: new Date(`${task.startDate}T00:00:00Z`),
        endDate: new Date(`${task.endDate}T00:00:00Z`),
        type: task.type ?? 'task',
        status: task.status ?? 'not_started',
        color: task.color ?? null,
        progress: task.progress ?? 0,
        workVolume: null,
        workUnit: null,
        completedVolume: 0,
        parentId: task.parentId ?? null,
        sortOrder: task.sortOrder ?? 0,
      })),
    });
  }

  if (snapshot.dependencies.length > 0) {
    await prisma.dependency.createMany({
      data: snapshot.dependencies.map((dependency) => ({
        id: dependency.id,
        taskId: dependency.taskId,
        depTaskId: dependency.depTaskId,
        type: dependency.type,
        lag: dependency.lag ?? 0,
      })),
    });
  }

  return projectId;
}

async function cleanupProject(projectId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.project.delete({
    where: { id: projectId },
  });
}

async function executeScenario(projectId: string, owner: OwnerContext, scenario: Scenario): Promise<ExecutionResult> {
  const runId = randomUUID();
  const historyGroupId = (await historyService.getLatestVisibleGroupId(projectId)) ?? 'initial';
  const beforeMessages = await messageService.list(projectId, 20);
  await messageService.add('user', scenario.userMessage, projectId, {
    requestContextId: runId,
    historyGroupId,
  });

  const tasksBefore = (await taskService.list(projectId, undefined, 1000, 0)).tasks;
  const routeSelection = await selectAgentRoute({
    userMessage: scenario.userMessage,
    taskCount: tasksBefore.length,
    hasHierarchy: tasksBefore.some((task: { parentId?: string }) => Boolean(task.parentId)),
  });

  if (routeSelection.route === 'initial_generation') {
    const baseVersion = (await getPrisma().project.findUnique({
      where: { id: projectId },
      select: { version: true },
    }))?.version ?? 0;
    const startedAt = Date.now();
    const result = await runInitialGeneration({
      projectId,
      sessionId: owner.sessionId,
      runId,
      userMessage: scenario.userMessage,
      tasksBefore: tasksBefore.map((task: { id: string; name: string }) => ({ id: task.id, name: task.name })),
      baseVersion,
      plannerQuery: async ({ prompt, model }: { prompt: string; model: string }) => ({
        content: await executeInitialGenerationPlannerQuery(prompt, model),
      }),
      services: {
        commandService,
        messageService,
        taskService,
      },
      logger: {
        debug: async () => undefined,
      },
      broadcastToSession: () => undefined,
    });

    return {
      route: routeSelection.route,
      assistantResponse: result.assistantResponse,
      toolCallCount: 0,
      acceptedMutations: result.ok ? 1 : 0,
      rejectedMutations: result.ok ? 0 : 1,
      durationMs: Date.now() - startedAt,
    };
  }

  const startedAt = Date.now();
  const result = await runPiOrdinaryAgent({
    userMessage: scenario.userMessage,
    projectId,
    sessionId: owner.sessionId,
    runId,
    userId: owner.userId,
    env: {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      OPENAI_MODEL: env.OPENAI_MODEL,
    },
    messages: beforeMessages.slice(0, -1),
    historyGroupId,
    requestContextId: runId,
    historyTitle: `AI — ${scenario.userMessage.trim().replace(/\s+/g, ' ')}`,
    mutationRoute: true,
    taskService,
    broadcastToSession: () => undefined,
    logger: {
      debug: async () => undefined,
    },
  });

  if (result.assistantResponse) {
    await messageService.add('assistant', result.assistantResponse, projectId, {
      requestContextId: runId,
      historyGroupId,
    });
  }

  return {
    route: routeSelection.route,
    assistantResponse: result.assistantResponse,
    toolCallCount: result.toolCallCount,
    acceptedMutations: result.acceptedMutatingToolCalls.length,
    rejectedMutations: result.rejectedMutatingToolCalls.length,
    durationMs: Date.now() - startedAt,
  };
}

function summarizeTopLevelTasks(tasks: Array<{ name: string; parentId?: string }>, limit = 12): string[] {
  return tasks
    .filter((task) => !task.parentId)
    .slice(0, limit)
    .map((task) => task.name);
}

function findTasksByLooseName(tasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>, name: string) {
  const normalizedExpected = normalizeName(name);
  return tasks.filter((task) => normalizeName(task.name) === normalizedExpected);
}

function buildTaskMap(tasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function buildDiffSummary(
  beforeTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>,
  afterTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>,
): {
  createdTaskNames: string[];
  deletedTaskNames: string[];
  changedTaskNames: string[];
  lines: string[];
} {
  const beforeById = buildTaskMap(beforeTasks);
  const afterById = buildTaskMap(afterTasks);
  const createdTaskNames = afterTasks.filter((task) => !beforeById.has(task.id)).map((task) => task.name);
  const deletedTaskNames = beforeTasks.filter((task) => !afterById.has(task.id)).map((task) => task.name);
  const changedTaskNames = afterTasks
    .filter((task) => {
      const before = beforeById.get(task.id);
      return before && JSON.stringify(before) !== JSON.stringify(task);
    })
    .map((task) => task.name);

  const lines = [
    ...createdTaskNames.slice(0, 12).map((name) => `created: ${name}`),
    ...deletedTaskNames.slice(0, 12).map((name) => `deleted: ${name}`),
    ...changedTaskNames.slice(0, 12).map((name) => `changed: ${name}`),
  ];

  return {
    createdTaskNames,
    deletedTaskNames,
    changedTaskNames,
    lines,
  };
}

function evaluateStructuralExpectations(
  scenario: Scenario,
  beforeTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>,
  afterTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string; dependencies?: Array<{ taskId: string; type: string }> }>,
  route: 'mutation' | 'initial_generation',
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (route !== scenario.expectation.route) {
    pass = false;
    notes.push(`route mismatch: expected ${scenario.expectation.route}, got ${route}`);
  }

  if (typeof scenario.expectation.minTaskCount === 'number' && afterTasks.length < scenario.expectation.minTaskCount) {
    pass = false;
    notes.push(`task count ${afterTasks.length} < expected minimum ${scenario.expectation.minTaskCount}`);
  }

  for (const name of scenario.expectation.createdTaskNames ?? []) {
    if (findTasksByLooseName(afterTasks, name).length === 0) {
      pass = false;
      notes.push(`missing created task "${name}"`);
    }
  }

  for (const name of scenario.expectation.absentTaskNames ?? []) {
    if (findTasksByLooseName(afterTasks, name).length > 0) {
      pass = false;
      notes.push(`task "${name}" still present`);
    }
  }

  if (scenario.expectation.renamedTask) {
    const beforeOld = findTasksByLooseName(beforeTasks, scenario.expectation.renamedTask.beforeName).length > 0;
    const afterOld = findTasksByLooseName(afterTasks, scenario.expectation.renamedTask.beforeName).length > 0;
    const afterNew = findTasksByLooseName(afterTasks, scenario.expectation.renamedTask.afterName).length > 0;
    if (!beforeOld || afterOld || !afterNew) {
      pass = false;
      notes.push(`rename expectation failed for "${scenario.expectation.renamedTask.beforeName}" -> "${scenario.expectation.renamedTask.afterName}"`);
    }
  }

  if (scenario.expectation.durationTask) {
    const before = findTasksByLooseName(beforeTasks, scenario.expectation.durationTask.name)[0];
    const after = findTasksByLooseName(afterTasks, scenario.expectation.durationTask.name)[0];
    if (!before || !after) {
      pass = false;
      notes.push(`duration target "${scenario.expectation.durationTask.name}" not found`);
    } else {
      const beforeDuration = diffDaysInclusive(before.startDate, before.endDate);
      const afterDuration = diffDaysInclusive(after.startDate, after.endDate);
      if (typeof scenario.expectation.durationTask.minDeltaDays === 'number') {
        const delta = afterDuration - beforeDuration;
        if (delta < scenario.expectation.durationTask.minDeltaDays) {
          pass = false;
          notes.push(`duration delta ${delta} < expected ${scenario.expectation.durationTask.minDeltaDays} for "${scenario.expectation.durationTask.name}"`);
        }
      }
      if (typeof scenario.expectation.durationTask.minMultiplier === 'number') {
        const ratio = beforeDuration === 0 ? 0 : afterDuration / beforeDuration;
        if (ratio < scenario.expectation.durationTask.minMultiplier) {
          pass = false;
          notes.push(`duration multiplier ${ratio.toFixed(2)} < expected ${scenario.expectation.durationTask.minMultiplier} for "${scenario.expectation.durationTask.name}"`);
        }
      }
    }
  }

  if (scenario.expectation.shiftedTask) {
    const before = findTasksByLooseName(beforeTasks, scenario.expectation.shiftedTask.name)[0];
    const after = findTasksByLooseName(afterTasks, scenario.expectation.shiftedTask.name)[0];
    if (!before || !after) {
      pass = false;
      notes.push(`shift target "${scenario.expectation.shiftedTask.name}" not found`);
    } else {
      const delta = Math.round((new Date(`${after.startDate}T00:00:00Z`).getTime() - new Date(`${before.startDate}T00:00:00Z`).getTime()) / 86_400_000);
      if (delta < scenario.expectation.shiftedTask.minStartDeltaDays) {
        pass = false;
        notes.push(`shift delta ${delta} < expected ${scenario.expectation.shiftedTask.minStartDeltaDays} for "${scenario.expectation.shiftedTask.name}"`);
      }
    }
  }

  if (scenario.expectation.dependency) {
    const successor = findTasksByLooseName(afterTasks, scenario.expectation.dependency.successorName)[0];
    const predecessor = findTasksByLooseName(afterTasks, scenario.expectation.dependency.predecessorName)[0];
    const exists = Boolean(
      successor
      && predecessor
      && (successor.dependencies ?? []).some((dependency) => dependency.taskId === predecessor.id),
    );

    if (exists !== scenario.expectation.dependency.exists) {
      pass = false;
      notes.push(`dependency expectation failed for "${scenario.expectation.dependency.predecessorName}" -> "${scenario.expectation.dependency.successorName}"`);
    }
  }

  if (scenario.expectation.parentTask) {
    const task = findTasksByLooseName(afterTasks, scenario.expectation.parentTask.taskName)[0];
    const parent = findTasksByLooseName(afterTasks, scenario.expectation.parentTask.parentName)[0];
    if (!task || !parent || task.parentId !== parent.id) {
      pass = false;
      notes.push(`parent expectation failed for "${scenario.expectation.parentTask.taskName}" -> "${scenario.expectation.parentTask.parentName}"`);
    }
  }

  return { pass, notes };
}

async function callJudge(input: {
  scenario: Scenario;
  assistantResponse: string;
  hardError: boolean;
  structuralPass: boolean;
  structuralNotes: string[];
  beforeTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string }>;
  afterTasks: Array<{ id: string; name: string; parentId?: string; startDate: string; endDate: string }>;
  diffLines: string[];
}): Promise<JudgeVerdict> {
  if (!env.OPENAI_API_KEY) {
    return {
      verdict: input.hardError || !input.structuralPass ? 'failure' : 'success',
      matchedRequest: !input.hardError && input.structuralPass,
      hasError: input.hardError,
      score: input.hardError || !input.structuralPass ? 0 : 1,
      explanation: 'Judge skipped because OPENAI_API_KEY is missing.',
      issues: input.structuralNotes,
    };
  }

  const beforeSummary = {
    taskCount: input.beforeTasks.length,
    topLevelTasks: summarizeTopLevelTasks(input.beforeTasks),
  };
  const afterSummary = {
    taskCount: input.afterTasks.length,
    topLevelTasks: summarizeTopLevelTasks(input.afterTasks),
  };

  const baseUrl = env.OPENAI_BASE_URL.endsWith('/')
    ? env.OPENAI_BASE_URL
    : `${env.OPENAI_BASE_URL}/`;
  const response = await fetch(new URL('chat/completions', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_CHEAP_MODEL ?? env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a strict evaluator for a Gantt AI assistant.',
            'Return JSON only.',
            'Count success only if the result matches the request, the project state reflects the requested change, and there are no substantive errors.',
            'Ignore differences that are only capitalization, letter case, or trivial punctuation when the task meaning is the same.',
            'Use this schema:',
            '{"verdict":"success|partial|failure","matchedRequest":true,"hasError":false,"score":0.0,"explanation":"...","issues":["..."]}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            request: input.scenario.userMessage,
            scenarioDescription: input.scenario.description,
            expectedRoute: input.scenario.expectation.route,
            expectedChecks: input.scenario.expectation,
            assistantResponse: input.assistantResponse,
            hardError: input.hardError,
            structuralPass: input.structuralPass,
            structuralNotes: input.structuralNotes,
            beforeSummary,
            afterSummary,
            diffSummary: input.diffLines.slice(0, 20),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      verdict: input.hardError || !input.structuralPass ? 'failure' : 'partial',
      matchedRequest: !input.hardError && input.structuralPass,
      hasError: input.hardError,
      score: input.hardError ? 0 : 0.5,
      explanation: `Judge HTTP ${response.status}`,
      issues: input.structuralNotes,
    };
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text ?? '')
        .join('')
      : '';

  try {
    const parsed = JSON.parse(content) as Partial<JudgeVerdict>;
    return {
      verdict: parsed.verdict === 'success' || parsed.verdict === 'partial' || parsed.verdict === 'failure'
        ? parsed.verdict
        : 'failure',
      matchedRequest: parsed.matchedRequest === true,
      hasError: parsed.hasError !== false,
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : 'Judge returned no explanation.',
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((issue): issue is string => typeof issue === 'string') : [],
    };
  } catch {
    return {
      verdict: input.hardError || !input.structuralPass ? 'failure' : 'partial',
      matchedRequest: !input.hardError && input.structuralPass,
      hasError: input.hardError,
      score: input.hardError ? 0 : 0.5,
      explanation: 'Judge returned malformed JSON.',
      issues: input.structuralNotes,
    };
  }
}

async function runScenario(owner: OwnerContext, scenario: Scenario): Promise<ScenarioResult> {
  const projectId = await createProjectFromFixture(owner, scenario.fixture, `${REPORT_LABEL} ${scenario.id}`);

  try {
    const sourceLogMessage = await fetchSourceLogMessage(scenario.logRequestContextId);
    const beforeTasks = (await taskService.list(projectId, undefined, 1000, 0)).tasks.map((task: any) => ({
      id: task.id,
      name: task.name,
      startDate: toIsoDate(task.startDate),
      endDate: toIsoDate(task.endDate),
      parentId: task.parentId,
      dependencies: (task.dependencies ?? []).map((dependency: any) => ({
        taskId: dependency.taskId,
        type: dependency.type,
      })),
    }));

    const execution = await executeScenario(projectId, owner, scenario);
    const afterTasks = (await taskService.list(projectId, undefined, 1000, 0)).tasks.map((task: any) => ({
      id: task.id,
      name: task.name,
      startDate: toIsoDate(task.startDate),
      endDate: toIsoDate(task.endDate),
      parentId: task.parentId,
      dependencies: (task.dependencies ?? []).map((dependency: any) => ({
        taskId: dependency.taskId,
        type: dependency.type,
      })),
    }));

    const diff = buildDiffSummary(beforeTasks, afterTasks);
    const structural = evaluateStructuralExpectations(scenario, beforeTasks, afterTasks, execution.route);
    const hardError = execution.assistantResponse.trim().length === 0
      || execution.rejectedMutations > 0
      || (scenario.expectation.route === 'mutation' && execution.acceptedMutations === 0)
      || /не удалось|не применил|не применилось|rejected|error/i.test(execution.assistantResponse);
    const judge = await callJudge({
      scenario,
      assistantResponse: execution.assistantResponse,
      hardError,
      structuralPass: structural.pass,
      structuralNotes: structural.notes,
      beforeTasks,
      afterTasks,
      diffLines: diff.lines,
    });
    const success = structural.pass
      && judge.verdict === 'success'
      && judge.matchedRequest
      && !judge.hasError
      && !hardError;

    return {
      id: scenario.id,
      origin: scenario.origin,
      description: scenario.description,
      request: scenario.userMessage,
      route: execution.route,
      expectedRoute: scenario.expectation.route,
      assistantResponse: execution.assistantResponse,
      toolCallCount: execution.toolCallCount,
      acceptedMutations: execution.acceptedMutations,
      rejectedMutations: execution.rejectedMutations,
      structuralPass: structural.pass,
      hardError,
      judge,
      success,
      notes: unique([...structural.notes, ...judge.issues]),
      durationMs: execution.durationMs,
      beforeTaskCount: beforeTasks.length,
      afterTaskCount: afterTasks.length,
      createdTaskNames: diff.createdTaskNames,
      deletedTaskNames: diff.deletedTaskNames,
      changedTaskNames: diff.changedTaskNames,
      sourceLogMessage,
    };
  } finally {
    await cleanupProject(projectId);
  }
}

function renderMarkdownReport(results: ScenarioResult[]): string {
  const successCount = results.filter((result) => result.success).length;
  const passRate = results.length === 0 ? 0 : successCount / results.length;
  const lines: string[] = [
    `# Agent E2E Report: ${REPORT_LABEL}`,
    '',
    `- Total scenarios: ${results.length}`,
    `- Successful scenarios: ${successCount}`,
    `- Success rate: ${(passRate * 100).toFixed(1)}%`,
    '',
    '## Scenarios',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.id}`);
    lines.push(`- Status: ${result.success ? 'PASS' : 'FAIL'}`);
    lines.push(`- Origin: ${result.origin}`);
    lines.push(`- Description: ${result.description}`);
    lines.push(`- Request: ${result.request}`);
    lines.push(`- Route: ${result.route} (expected ${result.expectedRoute})`);
    lines.push(`- Tool calls: ${result.toolCallCount}, accepted mutations: ${result.acceptedMutations}, rejected mutations: ${result.rejectedMutations}`);
    lines.push(`- Task count: ${result.beforeTaskCount} -> ${result.afterTaskCount}`);
    lines.push(`- Assistant response: ${result.assistantResponse || '(empty)'}`);
    lines.push(`- Judge: ${result.judge.verdict}, score=${result.judge.score}, matched=${result.judge.matchedRequest}, hasError=${result.judge.hasError}`);
    if (result.createdTaskNames.length > 0) {
      lines.push(`- Created tasks: ${result.createdTaskNames.slice(0, 12).join(', ')}`);
    }
    if (result.deletedTaskNames.length > 0) {
      lines.push(`- Deleted tasks: ${result.deletedTaskNames.slice(0, 12).join(', ')}`);
    }
    if (result.changedTaskNames.length > 0) {
      lines.push(`- Changed tasks: ${result.changedTaskNames.slice(0, 12).join(', ')}`);
    }
    if (result.notes.length > 0) {
      lines.push(`- Notes: ${result.notes.join(' | ')}`);
    }
    if (result.sourceLogMessage) {
      lines.push(`- Source log: ${result.sourceLogMessage.createdAt} / ${result.sourceLogMessage.projectName}`);
    }
    lines.push('');
  }

  lines.push('## Conclusions');
  if (passRate >= 0.8) {
    lines.push('');
    lines.push('- The current system met the 80% success target on this live suite.');
  } else {
    lines.push('');
    lines.push('- The current system did not meet the 80% success target on this live suite.');
    lines.push('- The failed cases and structural notes above show where the agent still diverges from user intent or produces execution errors.');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY or ANTHROPIC_AUTH_TOKEN is required for live evaluation');
  }

  const owner = await resolveOwnerContext();
  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`[agent-e2e] running ${scenario.id}`);
    const result = await runScenario(owner, scenario);
    results.push(result);
    console.log(`[agent-e2e] ${scenario.id}: ${result.success ? 'PASS' : 'FAIL'} (${result.durationMs} ms)`);
  }

  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const jsonPath = join(ARTIFACT_ROOT, `${REPORT_LABEL}.json`);
  const mdPath = join(ARTIFACT_ROOT, `${REPORT_LABEL}.md`);
  const summary = {
    label: REPORT_LABEL,
    generatedAt: new Date().toISOString(),
    scenarioCount: results.length,
    successCount: results.filter((result) => result.success).length,
    successRate: results.length === 0 ? 0 : results.filter((result) => result.success).length / results.length,
    results,
  };

  await writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(mdPath, renderMarkdownReport(results), 'utf8');

  console.log(`[agent-e2e] report: ${mdPath}`);
  console.log(`[agent-e2e] success rate: ${(summary.successRate * 100).toFixed(1)}%`);
}

await main();
