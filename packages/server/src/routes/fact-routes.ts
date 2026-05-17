import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { clampTaskProgress, normalizeStoredTaskStatus, synchronizeTaskStatus } from '@gantt/runtime-core/services/task-status';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { resolveProjectAccess } from '../access-control.js';

const FACT_EPSILON = 0.000001;

type FactState = 'fact' | 'done' | 'not_worked' | 'problem';

type FactAccessTokenRecord = {
  id: string;
  slug: string;
  projectId: string;
  includedTaskIds: string[];
  label: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

type FactMarkInput = {
  taskId: string;
  date: string;
  state: FactState;
  value?: number;
  inputMode?: 'volume' | 'percent';
  reason?: string;
  comment?: string;
};

type FactAccessTokenListItem = {
  id: string;
  slug: string;
  projectId: string;
  includedTaskIds: string[];
  previewTitles: string[];
  label: string;
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  url: string;
};

function generateFactSlug(): string {
  return `f_${randomBytes(9).toString('base64url')}`;
}

function buildFactOrigin(): string {
  return (process.env.FACT_PUBLIC_APP_URL ?? 'https://fact.getgantt.ru').replace(/\/$/, '');
}

function buildFactUrl(slug: string): string {
  return `${buildFactOrigin()}?token=${encodeURIComponent(slug)}`;
}

function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function currentDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTodayKey(value?: unknown): string {
  if (typeof value === 'string' && parseIsoDateOnly(value)) {
    return value;
  }
  return currentDateKey();
}

function roundFactAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function isFactState(value: unknown): value is FactState {
  return value === 'fact' || value === 'done' || value === 'not_worked' || value === 'problem';
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}

function sanitizeFactLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : fallback;
}

function buildPreviewTitles(
  tasks: Array<{ id: string; name: string; sortOrder: number }>,
  includedTaskIds: string[],
): string[] {
  if (includedTaskIds.length === 0) {
    return [];
  }
  const included = new Set(includedTaskIds);
  return tasks
    .filter((task) => included.has(task.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .slice(0, 4)
    .map((task) => task.name);
}

function serializeFactAccessToken(
  token: {
    id: string;
    slug: string;
    projectId: string;
    includedTaskIds: string[];
    label: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  },
  previewTitles: string[] = [],
): FactAccessTokenListItem {
  return {
    id: token.id,
    slug: token.slug,
    projectId: token.projectId,
    includedTaskIds: token.includedTaskIds,
    previewTitles,
    label: token.label,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
    url: buildFactUrl(token.slug),
  };
}

function assertUsableToken(token: FactAccessTokenRecord | null): FactAccessTokenRecord | null {
  if (!token || token.revokedAt) {
    return null;
  }
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return token;
}

function resolveAccessibleTaskIds(input: {
  tokenTaskIds: string[];
  projectTaskIds: string[];
}): Set<string> {
  if (input.tokenTaskIds.length === 0) {
    return new Set(input.projectTaskIds);
  }
  const projectTaskIds = new Set(input.projectTaskIds);
  return new Set(input.tokenTaskIds.filter((taskId) => projectTaskIds.has(taskId)));
}

function collectAncestorIds(tasks: Array<{ id: string; parentId: string | null }>, taskIds: Set<string>): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ancestors = new Set<string>();
  for (const taskId of taskIds) {
    let current = byId.get(taskId);
    while (current?.parentId) {
      ancestors.add(current.parentId);
      current = byId.get(current.parentId);
    }
  }
  return ancestors;
}

function isTaskOverdueUnfinished(
  task: { endDate: Date; progress: number | null; status: string | null },
  dateKey: string,
): boolean {
  const endKey = toDateKey(task.endDate);
  const status = normalizeStoredTaskStatus(task.status);
  return endKey < dateKey && status !== 'done' && status !== 'closed' && (task.progress ?? 0) < 100;
}

async function recomputeTaskProgress(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>['$transaction']>[0]>[0],
  projectId: string,
  taskId: string,
  taskWorkVolume: number | null,
): Promise<void> {
  const [aggregate, task] = await Promise.all([
    tx.taskProgressEntry.aggregate({
      where: { projectId, taskId },
      _sum: { amount: true },
    }),
    tx.task.findUnique({
      where: { id: taskId },
      select: { status: true, progress: true, completedVolume: true },
    }),
  ]);
  const completedVolume = aggregate._sum.amount ?? 0;
  const synced = synchronizeTaskStatus({
    currentStatus: task?.status,
    currentProgress: task?.progress,
    currentCompletedVolume: task?.completedVolume,
    currentWorkVolume: taskWorkVolume,
    nextCompletedVolume: completedVolume,
  });

  await tx.task.update({
    where: { id: taskId },
    data: {
      completedVolume: synced.completedVolume,
      progress: synced.progress,
      status: synced.status,
    },
  });
}

function normalizeFactMark(raw: unknown, fallbackDate?: string): FactMarkInput | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : '';
  const date = typeof input.date === 'string' ? input.date : fallbackDate;
  const state = input.state;
  const inputMode = input.inputMode === 'percent' ? 'percent' : 'volume';
  const value = input.value;

  if (!taskId || !date || !parseIsoDateOnly(date) || !isFactState(state)) {
    return null;
  }
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    return null;
  }

  return {
    taskId,
    date,
    state,
    inputMode,
    value,
    reason: sanitizeText(input.reason) ?? undefined,
    comment: sanitizeText(input.comment) ?? undefined,
  };
}

async function applyFactMark(input: {
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>['$transaction']>[0]>[0];
  projectId: string;
  tokenId: string;
  task: { id: string; workVolume: number | null };
  mark: FactMarkInput;
}): Promise<void> {
  const entryDate = parseIsoDateOnly(input.mark.date)!;
  const workVolume = input.task.workVolume ?? null;
  const rawValue = roundFactAmount(Math.max(0, input.mark.value ?? 0));
  const inputMode = input.mark.inputMode ?? 'volume';
  let amount = rawValue;
  let percentWithoutVolume: number | null = null;

  if (input.mark.state === 'done') {
    if (workVolume && workVolume > 0) {
      amount = workVolume;
    } else {
      percentWithoutVolume = 100;
      amount = 0;
    }
  } else if (input.mark.state === 'not_worked') {
    if (!workVolume || workVolume <= 0) {
      percentWithoutVolume = 0;
    }
    amount = 0;
  } else if (inputMode === 'percent') {
    if (workVolume && workVolume > 0) {
      amount = workVolume * (amount / 100);
    } else {
      percentWithoutVolume = clampTaskProgress(amount);
      amount = 0;
    }
  }
  amount = roundFactAmount(Math.max(0, amount));

  if (percentWithoutVolume === null && amount > FACT_EPSILON) {
    await input.tx.taskProgressEntry.upsert({
      where: {
        taskId_entryDate: {
          taskId: input.task.id,
          entryDate,
        },
      },
      update: { amount },
      create: {
        projectId: input.projectId,
        taskId: input.task.id,
        entryDate,
        amount,
      },
    });
  } else if (percentWithoutVolume === null || input.mark.state === 'not_worked') {
    await input.tx.taskProgressEntry.deleteMany({
      where: {
        projectId: input.projectId,
        taskId: input.task.id,
        entryDate,
      },
    });
  }

  await input.tx.factDayCloseEntry.upsert({
    where: {
      taskId_date_tokenId: {
        taskId: input.task.id,
        date: entryDate,
        tokenId: input.tokenId,
      },
    },
    update: {
      state: input.mark.state,
      inputMode,
      value: rawValue,
      reason: input.mark.reason ?? null,
      comment: input.mark.comment ?? null,
    },
    create: {
      projectId: input.projectId,
      taskId: input.task.id,
      date: entryDate,
      state: input.mark.state,
      inputMode,
      value: rawValue,
      reason: input.mark.reason ?? null,
      comment: input.mark.comment ?? null,
      tokenId: input.tokenId,
    },
  });

  if (percentWithoutVolume !== null) {
    const task = await input.tx.task.findUnique({
      where: { id: input.task.id },
      select: { status: true, completedVolume: true },
    });
    const synced = synchronizeTaskStatus({
      currentStatus: task?.status,
      currentCompletedVolume: task?.completedVolume,
      nextProgress: percentWithoutVolume,
    });
    await input.tx.task.update({
      where: { id: input.task.id },
      data: {
        progress: synced.progress,
        status: synced.status,
        completedVolume: synced.completedVolume,
      },
    });
  } else {
    await recomputeTaskProgress(input.tx, input.projectId, input.task.id, workVolume);
  }
}

export async function registerFactRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/projects/:id/fact-access-tokens', { preHandler: [authMiddleware] }, async (req, reply) => {
    const prisma = getPrisma();
    const projectId = (req.params as { id?: string }).id?.trim();
    if (!projectId) {
      return reply.status(400).send({ error: 'project id required' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const tokens = await prisma.factAccessToken.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const tasks = tokens.some((token) => token.includedTaskIds.length > 0)
      ? await prisma.task.findMany({
        where: { projectId },
        select: { id: true, name: true, sortOrder: true },
      })
      : [];

    return reply.send({
      tokens: tokens.map((token) => serializeFactAccessToken(token, buildPreviewTitles(tasks, token.includedTaskIds))),
    });
  });

  fastify.post('/api/projects/:id/fact-access-tokens', { preHandler: [authMiddleware] }, async (req, reply) => {
    const prisma = getPrisma();
    const projectId = (req.params as { id?: string }).id?.trim();
    const body = (req.body ?? {}) as {
      label?: unknown;
      includedTaskIds?: unknown;
      expiresAt?: unknown;
    };
    if (!projectId) {
      return reply.status(400).send({ error: 'project id required' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    const project = access
      ? await prisma.project.findFirst({ where: { id: projectId, status: { not: 'deleted' } }, select: { id: true, name: true } })
      : null;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access?.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const allTasks = await prisma.task.findMany({
      where: { projectId },
      select: { id: true, name: true, sortOrder: true },
    });
    const taskIds = new Set(allTasks.map((task) => task.id));
    const includedTaskIds = Array.isArray(body.includedTaskIds)
      ? Array.from(new Set(body.includedTaskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskIds.has(taskId))))
      : [];

    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt.trim()
      ? new Date(body.expiresAt)
      : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return reply.status(400).send({ error: 'expiresAt must be an ISO date string' });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const token = await prisma.factAccessToken.create({
          data: {
            slug: generateFactSlug(),
            projectId,
            includedTaskIds,
            label: sanitizeFactLabel(body.label, `${project.name} · закрытие дня`),
            expiresAt,
            createdByUserId: req.user!.userId,
          },
        });

        return reply.send({
          token: serializeFactAccessToken(token, buildPreviewTitles(allTasks, token.includedTaskIds)),
        });
      } catch {
        // Retry on rare slug collision.
      }
    }

    return reply.status(500).send({ error: 'Failed to create fact access token' });
  });

  fastify.post('/api/projects/:id/fact-access-tokens/:tokenId/revoke', { preHandler: [authMiddleware] }, async (req, reply) => {
    const prisma = getPrisma();
    const params = req.params as { id?: string; tokenId?: string };
    const projectId = params.id?.trim();
    const tokenId = params.tokenId?.trim();
    if (!projectId || !tokenId) {
      return reply.status(400).send({ error: 'project id and token id required' });
    }

    const access = await resolveProjectAccess(req.user!.userId, projectId);
    if (!access) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    if (!access.canEdit) {
      return reply.status(403).send({ error: 'Project is read-only for this user' });
    }

    const existing = await prisma.factAccessToken.findFirst({
      where: { id: tokenId, projectId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Fact access token not found' });
    }

    const token = existing.revokedAt
      ? existing
      : await prisma.factAccessToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });

    return reply.send({ token: serializeFactAccessToken(token) });
  });

  fastify.get('/api/fact/session', async (req, reply) => {
    const prisma = getPrisma();
    const query = req.query as { token?: string; date?: string };
    const slug = query.token?.trim();
    const dateKey = normalizeTodayKey(query.date);
    const date = parseIsoDateOnly(dateKey)!;

    if (!slug) {
      return reply.status(400).send({ error: 'token required' });
    }

    const token = assertUsableToken(await prisma.factAccessToken.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        projectId: true,
        includedTaskIds: true,
        label: true,
        revokedAt: true,
        expiresAt: true,
      },
    }));
    if (!token) {
      return reply.status(404).send({ error: 'Fact access token not found' });
    }

    const [project, tasks, planEntries, progressEntries, closeEntries] = await Promise.all([
      prisma.project.findFirst({
        where: { id: token.projectId, status: { not: 'deleted' } },
        select: { id: true, name: true, status: true },
      }),
      prisma.task.findMany({
        where: { projectId: token.projectId },
        select: {
          id: true,
          name: true,
          parentId: true,
          startDate: true,
          endDate: true,
          type: true,
          status: true,
          progress: true,
          workVolume: true,
          workUnit: true,
          completedVolume: true,
          sortOrder: true,
          _count: { select: { children: true } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.taskPlanEntry.findMany({
        where: { projectId: token.projectId, entryDate: date },
        select: { taskId: true, amount: true },
      }),
      prisma.taskProgressEntry.findMany({
        where: { projectId: token.projectId, entryDate: date },
        select: { taskId: true, amount: true, updatedAt: true },
      }),
      prisma.factDayCloseEntry.findMany({
        where: { projectId: token.projectId, tokenId: token.id, date },
        select: { taskId: true, state: true, inputMode: true, value: true, reason: true, comment: true, createdAt: true, updatedAt: true },
      }),
    ]);

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const accessibleTaskIds = resolveAccessibleTaskIds({
      tokenTaskIds: token.includedTaskIds,
      projectTaskIds: tasks.map((task) => task.id),
    });
    const planByTaskId = new Map(planEntries.map((entry) => [entry.taskId, entry.amount]));
    const factByTaskId = new Map(progressEntries.map((entry) => [entry.taskId, entry]));
    const closeByTaskId = new Map(closeEntries.map((entry) => [entry.taskId, entry]));
    const dayTaskIds = new Set(
      tasks
        .filter((task) => (
          accessibleTaskIds.has(task.id)
          && (
            planByTaskId.has(task.id)
            || isTaskOverdueUnfinished(task, dateKey)
            || factByTaskId.has(task.id)
            || closeByTaskId.has(task.id)
          )
        ))
        .map((task) => task.id),
    );
    const ancestorIds = collectAncestorIds(tasks, dayTaskIds);
    const visibleTaskIds = new Set([...dayTaskIds, ...ancestorIds]);

    await prisma.factAccessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });

    return reply.send({
      token: {
        slug: token.slug,
        label: token.label,
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
      project,
      date: dateKey,
      tasks: tasks
        .filter((task) => visibleTaskIds.has(task.id))
        .map((task) => {
          const closeEntry = closeByTaskId.get(task.id);
          const factEntry = factByTaskId.get(task.id);
          return {
            id: task.id,
            name: task.name,
            parentId: task.parentId,
            startDate: toDateKey(task.startDate),
            endDate: toDateKey(task.endDate),
            type: task.type,
            status: normalizeStoredTaskStatus(task.status),
            progress: task.progress ?? 0,
            workVolume: task.workVolume ?? null,
            workUnit: task.workUnit ?? null,
            completedVolume: task.completedVolume ?? 0,
            sortOrder: task.sortOrder,
            isLeaf: task._count.children === 0,
            writable: dayTaskIds.has(task.id) && task._count.children === 0,
            dayPlan: planByTaskId.get(task.id) ?? 0,
            dayFact: factEntry?.amount ?? 0,
            dayFactUpdatedAt: factEntry?.updatedAt.toISOString() ?? null,
            closeState: closeEntry?.state ?? null,
            closeInputMode: closeEntry?.inputMode ?? null,
            closeValue: closeEntry?.value ?? null,
            closeReason: closeEntry?.reason ?? null,
            closeComment: closeEntry?.comment ?? null,
          };
        }),
    });
  });

  fastify.post('/api/fact/tasks/:taskId/progress', async (req, reply) => {
    const prisma = getPrisma();
    const params = req.params as { taskId?: string };
    const body = (req.body ?? {}) as { token?: string } & Record<string, unknown>;
    const slug = typeof body.token === 'string' ? body.token.trim() : '';
    const mark = normalizeFactMark({ ...body, taskId: params.taskId }, undefined);

    if (!slug) {
      return reply.status(400).send({ error: 'token required' });
    }
    if (!mark) {
      return reply.status(400).send({ error: 'invalid fact mark' });
    }

    const token = assertUsableToken(await prisma.factAccessToken.findUnique({
      where: { slug },
      select: { id: true, slug: true, projectId: true, includedTaskIds: true, label: true, revokedAt: true, expiresAt: true },
    }));
    if (!token) {
      return reply.status(404).send({ error: 'Fact access token not found' });
    }

    const task = await prisma.task.findFirst({
      where: { id: mark.taskId, projectId: token.projectId },
      select: { id: true, workVolume: true, _count: { select: { children: true } } },
    });
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }
    if (task._count.children > 0) {
      return reply.status(400).send({ error: 'Fact can only be entered for leaf tasks' });
    }
    if (token.includedTaskIds.length > 0 && !token.includedTaskIds.includes(task.id)) {
      return reply.status(403).send({ error: 'Task is not available for this token' });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await applyFactMark({ tx, projectId: token.projectId, tokenId: token.id, task, mark });
        await tx.factAccessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
      });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Failed to save fact' });
    }

    return reply.send({ ok: true });
  });

  fastify.post('/api/fact/day-close', async (req, reply) => {
    const prisma = getPrisma();
    const body = (req.body ?? {}) as { token?: string; date?: string; entries?: unknown[] };
    const slug = body.token?.trim();
    const dateKey = normalizeTodayKey(body.date);

    if (!slug) {
      return reply.status(400).send({ error: 'token required' });
    }
    if (!Array.isArray(body.entries)) {
      return reply.status(400).send({ error: 'entries array required' });
    }

    const marks = body.entries.map((entry) => normalizeFactMark(entry, dateKey));
    if (marks.some((mark) => mark === null)) {
      return reply.status(400).send({ error: 'invalid fact entries' });
    }

    const token = assertUsableToken(await prisma.factAccessToken.findUnique({
      where: { slug },
      select: { id: true, slug: true, projectId: true, includedTaskIds: true, label: true, revokedAt: true, expiresAt: true },
    }));
    if (!token) {
      return reply.status(404).send({ error: 'Fact access token not found' });
    }

    const taskIds = Array.from(new Set((marks as FactMarkInput[]).map((mark) => mark.taskId)));
    const tasks = await prisma.task.findMany({
      where: { projectId: token.projectId, id: { in: taskIds } },
      select: { id: true, workVolume: true, _count: { select: { children: true } } },
    });
    const tasksById = new Map(tasks.map((task) => [task.id, task]));

    for (const taskId of taskIds) {
      const task = tasksById.get(taskId);
      if (!task) {
        return reply.status(404).send({ error: `Task ${taskId} not found` });
      }
      if (task._count.children > 0) {
        return reply.status(400).send({ error: 'Fact can only be entered for leaf tasks' });
      }
      if (token.includedTaskIds.length > 0 && !token.includedTaskIds.includes(taskId)) {
        return reply.status(403).send({ error: `Task ${taskId} is not available for this token` });
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const mark of marks as FactMarkInput[]) {
          await applyFactMark({
            tx,
            projectId: token.projectId,
            tokenId: token.id,
            task: tasksById.get(mark.taskId)!,
            mark,
          });
        }
        await tx.factAccessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
      });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Failed to close day' });
    }

    return reply.send({ ok: true, saved: marks.length, date: dateKey });
  });
}
