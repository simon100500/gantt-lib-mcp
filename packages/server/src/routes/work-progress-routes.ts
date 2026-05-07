import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { normalizeStoredTaskStatus, synchronizeTaskStatus } from '@gantt/runtime-core/services/task-status';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';

type WorkProgressResponse = {
  task: {
    id: string;
    workVolume: number | null;
    workUnit: string | null;
    completedVolume: number;
    status: 'not_started' | 'in_progress' | 'done' | 'closed';
    progress: number;
  };
  progressEntries: Array<{
    id: string;
    projectId: string;
    taskId: string;
    entryDate: string;
    amount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  affectedTasks?: Array<{
    id: string;
    workVolume: number | null;
    workUnit: string | null;
    completedVolume: number;
    status: 'not_started' | 'in_progress' | 'done' | 'closed';
    progress: number;
  }>;
  affectedProgressEntries?: Array<{
    id: string;
    projectId: string;
    taskId: string;
    entryDate: string;
    amount: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

function toEntryResponse(entry: {
  id: string;
  projectId: string;
  taskId: string;
  entryDate: Date;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}): WorkProgressResponse['progressEntries'][number] {
  return {
    id: entry.id,
    projectId: entry.projectId,
    taskId: entry.taskId,
    entryDate: entry.entryDate.toISOString().split('T')[0],
    amount: entry.amount,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function buildTaskProgressResponse(projectId: string, taskId: string): Promise<WorkProgressResponse> {
  const prisma = getPrisma();
  const [task, progressEntries] = await Promise.all([
    prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: {
        id: true,
        workVolume: true,
        workUnit: true,
        completedVolume: true,
        status: true,
        progress: true,
      },
    }),
    prisma.taskProgressEntry.findMany({
      where: { projectId, taskId },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  return {
    task: {
      id: task.id,
      workVolume: task.workVolume ?? null,
      workUnit: task.workUnit ?? null,
      completedVolume: task.completedVolume ?? 0,
      status: normalizeStoredTaskStatus(task.status),
      progress: task.progress ?? 0,
    },
    progressEntries: progressEntries.map(toEntryResponse),
  };
}

async function recomputeTaskProgress(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>['$transaction']>[0]>[0],
  projectId: string,
  taskId: string,
  taskWorkVolume: number,
): Promise<void> {
  const aggregate = await tx.taskProgressEntry.aggregate({
    where: { projectId, taskId },
    _sum: { amount: true },
  });
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  const completedVolume = aggregate._sum.amount ?? 0;
  const synced = synchronizeTaskStatus({
    currentStatus: task?.status,
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

async function buildTasksProgressResponse(projectId: string, taskIds: string[]): Promise<{
  tasks: WorkProgressResponse['affectedTasks'];
  progressEntries: WorkProgressResponse['affectedProgressEntries'];
}> {
  const prisma = getPrisma();
  const [tasks, progressEntries] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, id: { in: taskIds } },
      select: {
        id: true,
        workVolume: true,
        workUnit: true,
        completedVolume: true,
        status: true,
        progress: true,
      },
    }),
    prisma.taskProgressEntry.findMany({
      where: { projectId, taskId: { in: taskIds } },
      orderBy: [{ taskId: 'asc' }, { entryDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      workVolume: task.workVolume ?? null,
      workUnit: task.workUnit ?? null,
      completedVolume: task.completedVolume ?? 0,
      status: normalizeStoredTaskStatus(task.status),
      progress: task.progress ?? 0,
    })),
    progressEntries: progressEntries.map(toEntryResponse),
  };
}

function collectDescendantTaskIds(
  rootTaskId: string,
  tasks: Array<{ id: string; parentId: string | null }>,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }
    const children = childrenByParent.get(task.parentId) ?? [];
    children.push(task.id);
    childrenByParent.set(task.parentId, children);
  }

  const result: string[] = [];
  const stack = [rootTaskId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    result.push(currentId);
    const childIds = childrenByParent.get(currentId) ?? [];
    for (const childId of childIds) {
      stack.push(childId);
    }
  }

  return result;
}

async function syncProgressEntriesToCompletedVolume(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>['$transaction']>[0]>[0],
  projectId: string,
  taskId: string,
  targetCompletedVolume: number,
): Promise<void> {
  const aggregate = await tx.taskProgressEntry.aggregate({
    where: { projectId, taskId },
    _sum: { amount: true },
  });
  const currentCompletedVolume = aggregate._sum.amount ?? 0;
  const delta = targetCompletedVolume - currentCompletedVolume;
  if (Math.abs(delta) < 0.000001) {
    return;
  }

  const entryDate = new Date(`${new Date().toISOString().split('T')[0]}T00:00:00.000Z`);
  const existingEntry = await tx.taskProgressEntry.findUnique({
    where: {
      taskId_entryDate: {
        taskId,
        entryDate,
      },
    },
  });

  if (existingEntry) {
    await tx.taskProgressEntry.update({
      where: { id: existingEntry.id },
      data: { amount: existingEntry.amount + delta },
    });
    return;
  }

  await tx.taskProgressEntry.create({
    data: {
      projectId,
      taskId,
      entryDate,
      amount: delta,
    },
  });
}

export async function registerWorkProgressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.patch<{ Params: { taskId: string }; Body: { status?: 'not_started' | 'in_progress' | 'done' | 'closed' } }>(
    '/api/tasks/:taskId/status',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId } = req.params;
      const { status } = req.body ?? {};

      if (status !== 'not_started' && status !== 'in_progress' && status !== 'done' && status !== 'closed') {
        return reply.status(400).send({ error: 'status must be one of not_started, in_progress, done, closed' });
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: {
          id: true,
          status: true,
          workVolume: true,
          completedVolume: true,
          progress: true,
        },
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const shouldCascadeToDescendants = status === 'done' || status === 'closed';
      const affectedTaskIds = shouldCascadeToDescendants
        ? collectDescendantTaskIds(taskId, await prisma.task.findMany({
            where: { projectId: req.user!.projectId },
            select: { id: true, parentId: true },
          }))
        : [taskId];

      await prisma.$transaction(async (tx) => {
        const tasksToUpdate = await tx.task.findMany({
          where: { projectId: req.user!.projectId, id: { in: affectedTaskIds } },
          select: {
            id: true,
            status: true,
            workVolume: true,
            completedVolume: true,
            progress: true,
          },
        });

        for (const currentTask of tasksToUpdate) {
          const synced = synchronizeTaskStatus({
            currentStatus: currentTask.status,
            currentProgress: currentTask.progress,
            currentWorkVolume: currentTask.workVolume,
            currentCompletedVolume: currentTask.completedVolume,
            nextStatus: status,
          });

          await tx.task.update({
            where: { id: currentTask.id },
            data: {
              status: synced.status,
              progress: synced.progress,
              completedVolume: synced.completedVolume,
            },
          });

          if (status === 'done' && currentTask.workVolume && currentTask.workVolume > 0) {
            await syncProgressEntriesToCompletedVolume(tx, req.user!.projectId, currentTask.id, synced.completedVolume);
          }
        }
      });

      const [rootResponse, affectedResponse] = await Promise.all([
        buildTaskProgressResponse(req.user!.projectId, taskId),
        buildTasksProgressResponse(req.user!.projectId, affectedTaskIds),
      ]);

      return reply.send({
        ...rootResponse,
        affectedTasks: affectedResponse.tasks,
        affectedProgressEntries: affectedResponse.progressEntries,
      });
    },
  );

  fastify.patch<{ Params: { taskId: string }; Body: { workVolume?: number | null; workUnit?: string | null } }>(
    '/api/tasks/:taskId/work-metadata',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId } = req.params;
      const { workVolume, workUnit } = req.body ?? {};

      if (workVolume !== undefined && workVolume !== null && (!Number.isFinite(workVolume) || workVolume < 0)) {
        return reply.status(400).send({ error: 'workVolume must be a finite number >= 0 or null' });
      }

      if (workUnit !== undefined && workUnit !== null && typeof workUnit !== 'string') {
        return reply.status(400).send({ error: 'workUnit must be a string or null' });
      }

      const existingTask = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: { id: true, status: true, completedVolume: true, workVolume: true, _count: { select: { children: true } } },
      });

      if (!existingTask) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      if (existingTask._count.children > 0) {
        return reply.status(400).send({ error: 'Work volume can only be entered for leaf tasks' });
      }

      const normalizedWorkVolume = workVolume === undefined ? existingTask.workVolume : workVolume;
      const synced = synchronizeTaskStatus({
        currentStatus: existingTask.status,
        currentWorkVolume: existingTask.workVolume,
        currentCompletedVolume: existingTask.completedVolume ?? 0,
        nextWorkVolume: normalizedWorkVolume,
      });

      await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(workVolume !== undefined ? { workVolume: workVolume === null ? null : workVolume } : {}),
          ...(workUnit !== undefined ? { workUnit: workUnit?.trim() ? workUnit.trim() : null } : {}),
          progress: synced.progress,
          status: synced.status,
        },
      });

      return reply.send(await buildTaskProgressResponse(req.user!.projectId, taskId));
    },
  );

  fastify.post<{
    Params: { taskId: string };
    Body: { entryDate?: string; value?: number; inputMode?: 'volume' | 'percent' };
  }>(
    '/api/tasks/:taskId/progress-entries',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId } = req.params;
      const { entryDate, value, inputMode } = req.body ?? {};

      if (!entryDate || typeof entryDate !== 'string') {
        return reply.status(400).send({ error: 'entryDate is required' });
      }
      const normalizedDate = parseIsoDateOnly(entryDate);
      if (!normalizedDate) {
        return reply.status(400).send({ error: 'entryDate must be YYYY-MM-DD' });
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
        return reply.status(400).send({ error: 'value must be a finite non-zero number' });
      }
      if (inputMode !== 'volume' && inputMode !== 'percent') {
        return reply.status(400).send({ error: 'inputMode must be volume or percent' });
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: {
          id: true,
          workVolume: true,
          completedVolume: true,
          _count: { select: { children: true } },
        },
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      if (task._count.children > 0) {
        return reply.status(400).send({ error: 'Completed work can only be entered for leaf tasks' });
      }

      if (!task.workVolume || task.workVolume <= 0) {
        return reply.status(400).send({ error: 'Set total volume before entering completed work' });
      }
      const taskWorkVolume = task.workVolume;

      const incrementAmount = inputMode === 'percent'
        ? taskWorkVolume * (value / 100)
        : value;

      await prisma.$transaction(async (tx) => {
        const existingEntry = await tx.taskProgressEntry.findUnique({
          where: {
            taskId_entryDate: {
              taskId,
              entryDate: normalizedDate,
            },
          },
        });

        if (existingEntry) {
          await tx.taskProgressEntry.update({
            where: { id: existingEntry.id },
            data: {
              amount: existingEntry.amount + incrementAmount,
            },
          });
        } else {
          await tx.taskProgressEntry.create({
            data: {
              projectId: req.user!.projectId,
              taskId,
              entryDate: normalizedDate,
              amount: incrementAmount,
            },
          });
        }

        await recomputeTaskProgress(tx, req.user!.projectId, taskId, taskWorkVolume);
      });

      return reply.send(await buildTaskProgressResponse(req.user!.projectId, taskId));
    },
  );

  fastify.patch<{
    Params: { taskId: string; entryId: string };
    Body: { entryDate?: string; amount?: number };
  }>(
    '/api/tasks/:taskId/progress-entries/:entryId',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId, entryId } = req.params;
      const { entryDate, amount } = req.body ?? {};

      if (!entryDate || typeof entryDate !== 'string') {
        return reply.status(400).send({ error: 'entryDate is required' });
      }
      const normalizedDate = parseIsoDateOnly(entryDate);
      if (!normalizedDate) {
        return reply.status(400).send({ error: 'entryDate must be YYYY-MM-DD' });
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return reply.status(400).send({ error: 'amount must be a finite number > 0' });
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: { id: true, workVolume: true, _count: { select: { children: true } } },
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      if (task._count.children > 0) {
        return reply.status(400).send({ error: 'Completed work can only be edited for leaf tasks' });
      }
      if (!task.workVolume || task.workVolume <= 0) {
        return reply.status(400).send({ error: 'Set total volume before editing completed work' });
      }

      const existingEntry = await prisma.taskProgressEntry.findFirst({
        where: { id: entryId, taskId, projectId: req.user!.projectId },
        select: { id: true },
      });

      if (!existingEntry) {
        return reply.status(404).send({ error: 'Progress entry not found' });
      }

      const conflictingEntry = await prisma.taskProgressEntry.findFirst({
        where: {
          id: { not: entryId },
          taskId,
          projectId: req.user!.projectId,
          entryDate: normalizedDate,
        },
        select: { id: true },
      });

      if (conflictingEntry) {
        return reply.status(409).send({ error: 'Progress entry for this date already exists' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.taskProgressEntry.update({
          where: { id: entryId },
          data: {
            entryDate: normalizedDate,
            amount,
          },
        });
        await recomputeTaskProgress(tx, req.user!.projectId, taskId, task.workVolume!);
      });

      return reply.send(await buildTaskProgressResponse(req.user!.projectId, taskId));
    },
  );

  fastify.delete<{ Params: { taskId: string; entryId: string } }>(
    '/api/tasks/:taskId/progress-entries/:entryId',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId, entryId } = req.params;

      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: { id: true, workVolume: true, _count: { select: { children: true } } },
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      if (task._count.children > 0) {
        return reply.status(400).send({ error: 'Completed work can only be deleted for leaf tasks' });
      }

      const existingEntry = await prisma.taskProgressEntry.findFirst({
        where: { id: entryId, taskId, projectId: req.user!.projectId },
        select: { id: true },
      });

      if (!existingEntry) {
        return reply.status(404).send({ error: 'Progress entry not found' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.taskProgressEntry.delete({ where: { id: entryId } });
        await recomputeTaskProgress(tx, req.user!.projectId, taskId, task.workVolume ?? 0);
      });

      return reply.send(await buildTaskProgressResponse(req.user!.projectId, taskId));
    },
  );
}
