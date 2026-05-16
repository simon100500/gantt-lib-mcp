import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
import { normalizeStoredTaskStatus } from '@gantt/runtime-core/services/task-status';
import { commandService } from '@gantt/runtime-core/services';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { requireActiveSubscriptionForMutation } from '../middleware/constraint-middleware.js';
import { requireCurrentProjectEditor } from '../access-control.js';
import { deleteTaskPlanEntriesForTask, insertTaskPlanEntries, listTaskPlanEntries } from '../task-plan-entry-store.js';

const PLAN_EPSILON = 0.000001;

function roundPlanValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function toDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const dateKey = value.split('T')[0]?.trim();
  return dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const startDate = new Date(`${startKey}T00:00:00.000Z`);
  const endDate = new Date(`${endKey}T00:00:00.000Z`);
  const firstDate = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
  const lastDate = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
  const dateKeys: string[] = [];
  for (const cursor = new Date(firstDate.getTime()); cursor.getTime() <= lastDate.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dateKeys.push(cursor.toISOString().slice(0, 10));
  }
  return dateKeys;
}

function sanitizeNumberMap(values: unknown): Record<string, number> {
  if (!values || typeof values !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).flatMap(([dateKey, amount]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        return [];
      }
      return [[dateKey, roundPlanValue(amount)]];
    }),
  );
}

function isPatternWeekend(
  calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean },
  dateKey: string,
): boolean {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  if (day === 0) return !calendarWeeklyPattern.sun;
  if (day === 1) return !calendarWeeklyPattern.mon;
  if (day === 2) return !calendarWeeklyPattern.tue;
  if (day === 3) return !calendarWeeklyPattern.wed;
  if (day === 4) return !calendarWeeklyPattern.thu;
  if (day === 5) return !calendarWeeklyPattern.fri;
  return !calendarWeeklyPattern.sat;
}

function isWorkingDate(
  dateKey: string,
  calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean },
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>,
): boolean {
  const override = calendarDays.find((day) => day.date === dateKey)?.kind;
  if (override === 'non_working') {
    return false;
  }
  if (override === 'working' || override === 'shortened') {
    return true;
  }
  return !isPatternWeekend(calendarWeeklyPattern, dateKey);
}

function getNextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function findNextWorkingDate(
  afterDateKey: string,
  calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean },
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>,
): string {
  let cursor = getNextDateKey(afterDateKey);
  for (let guard = 0; guard < 3660; guard += 1) {
    if (isWorkingDate(cursor, calendarWeeklyPattern, calendarDays)) {
      return cursor;
    }
    cursor = getNextDateKey(cursor);
  }
  return cursor;
}

function distributeAmountAcrossDates(amount: number, dateKeys: string[], weightByDate: Map<string, number>): Record<string, number> {
  if (amount <= PLAN_EPSILON || dateKeys.length === 0) {
    return {};
  }

  const weights = dateKeys.map((dateKey) => Math.max(weightByDate.get(dateKey) ?? 0, 0));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = weightSum > PLAN_EPSILON ? weights : dateKeys.map(() => 1);
  const effectiveWeightSum = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const distributed: Record<string, number> = {};
  let remaining = amount;

  for (const [index, dateKey] of dateKeys.entries()) {
    const rawValue = index === dateKeys.length - 1
      ? remaining
      : amount * ((effectiveWeights[index] ?? 0) / effectiveWeightSum);
    const roundedValue = roundPlanValue(rawValue);
    if (roundedValue > PLAN_EPSILON) {
      distributed[dateKey] = roundedValue;
    }
    remaining = roundPlanValue(remaining - roundedValue);
  }

  if (remaining > PLAN_EPSILON) {
    const lastDateKey = dateKeys[dateKeys.length - 1];
    if (lastDateKey) {
      distributed[lastDateKey] = roundPlanValue((distributed[lastDateKey] ?? 0) + remaining);
    }
  }

  return distributed;
}

function mergeChangedTasks<T extends { id: string }>(left: T[], right: T[]): T[] {
  const byId = new Map<string, T>();
  for (const task of left) {
    byId.set(task.id, task);
  }
  for (const task of right) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}

export function normalizeTaskPlanByDate(input: {
  startDate: string;
  endDate: string;
  workVolume: number;
  basePlanByDate: Record<string, number>;
  nextPlanByDate: Record<string, number>;
  todayIso: string;
  calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
}): { planByDate: Record<string, number>; startDate: string; endDate: string } {
  const editedDateKeys = new Set<string>();
  for (const dateKey of new Set([...Object.keys(input.basePlanByDate), ...Object.keys(input.nextPlanByDate)])) {
    if (Math.abs((input.basePlanByDate[dateKey] ?? 0) - (input.nextPlanByDate[dateKey] ?? 0)) > PLAN_EPSILON) {
      editedDateKeys.add(dateKey);
    }
  }
  const redistributionAnchorDate = Array.from(editedDateKeys).sort().at(-1);
  const isFutureExtensionEdit = Boolean(
    redistributionAnchorDate
    && redistributionAnchorDate > input.endDate
    && editedDateKeys.size === 1,
  );

  const positiveNextKeys = Object.entries(input.nextPlanByDate)
    .filter(([, amount]) => amount > PLAN_EPSILON)
    .map(([dateKey]) => dateKey);
  const nextStartDate = [input.startDate, ...positiveNextKeys].sort()[0] ?? input.startDate;
  let nextEndDate = [input.endDate, ...positiveNextKeys].sort().at(-1) ?? input.endDate;
  const rangeDateKeys = enumerateDateKeys(nextStartDate, nextEndDate);
  const workingDateKeys = rangeDateKeys.filter((dateKey) => isWorkingDate(dateKey, input.calendarWeeklyPattern, input.calendarDays));
  const distributionDateKeys = workingDateKeys.length > 0 ? workingDateKeys : rangeDateKeys;

  const fixedByDate = new Map<string, number>();
  for (const dateKey of distributionDateKeys) {
    if (
      dateKey < input.todayIso
      || (
        !isFutureExtensionEdit
        && redistributionAnchorDate
        && dateKey <= redistributionAnchorDate
      )
    ) {
      fixedByDate.set(dateKey, input.basePlanByDate[dateKey] ?? 0);
    }
  }
  for (const dateKey of editedDateKeys) {
    fixedByDate.set(dateKey, input.nextPlanByDate[dateKey] ?? 0);
  }

  let fixedTotal = 0;
  for (const amount of fixedByDate.values()) {
    fixedTotal += amount;
  }
  const remainingVolume = roundPlanValue(Math.max(0, input.workVolume - fixedTotal));
  let candidateDateKeys = distributionDateKeys.filter((dateKey) => (
    (
      isFutureExtensionEdit
        ? dateKey >= input.todayIso
        : dateKey > (redistributionAnchorDate ?? input.todayIso)
    )
    && !fixedByDate.has(dateKey)
  ));
  if (isFutureExtensionEdit) {
    const plannedCandidateDateKeys = candidateDateKeys.filter((dateKey) => (
      dateKey <= input.endDate
      && (input.basePlanByDate[dateKey] ?? 0) > PLAN_EPSILON
    ));
    if (plannedCandidateDateKeys.length > 0) {
      candidateDateKeys = plannedCandidateDateKeys;
    }
  }
  if (candidateDateKeys.length === 0 && remainingVolume > PLAN_EPSILON) {
    const extensionBaseDate = [nextEndDate, redistributionAnchorDate ?? input.todayIso, input.todayIso].sort().at(-1) ?? nextEndDate;
    const appendedDate = findNextWorkingDate(extensionBaseDate, input.calendarWeeklyPattern, input.calendarDays);
    nextEndDate = appendedDate > nextEndDate ? appendedDate : nextEndDate;
    candidateDateKeys = [appendedDate];
  }
  const weightByDate = new Map<string, number>();
  for (const dateKey of candidateDateKeys) {
    const preferredWeight = input.nextPlanByDate[dateKey] ?? input.basePlanByDate[dateKey] ?? 0;
    weightByDate.set(dateKey, preferredWeight > PLAN_EPSILON ? preferredWeight : 1);
  }

  const planByDate: Record<string, number> = {};
  for (const [dateKey, amount] of fixedByDate.entries()) {
    if (amount > PLAN_EPSILON) {
      planByDate[dateKey] = roundPlanValue(amount);
    }
  }

  const distributedByDate = distributeAmountAcrossDates(remainingVolume, candidateDateKeys, weightByDate);
  for (const [dateKey, amount] of Object.entries(distributedByDate)) {
    if (amount > PLAN_EPSILON) {
      planByDate[dateKey] = roundPlanValue((planByDate[dateKey] ?? 0) + amount);
    }
  }

  return { planByDate, startDate: nextStartDate, endDate: nextEndDate };
}

export async function registerTaskPlanRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.put<{
    Params: { taskId: string };
    Body: {
      basePlanByDate?: Record<string, number>;
      nextPlanByDate?: Record<string, number>;
      startDate?: string;
      endDate?: string;
      workVolume?: number | null;
    };
  }>(
    '/api/tasks/:taskId/plan-entries',
    { preHandler: [authMiddleware, requireCurrentProjectEditor, requireActiveSubscriptionForMutation] },
    async (req, reply) => {
      const prisma = getPrisma();
      const { taskId } = req.params;
      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: req.user!.projectId },
        select: {
          id: true,
          projectId: true,
          startDate: true,
          endDate: true,
          workVolume: true,
          workUnit: true,
          completedVolume: true,
          progress: true,
          status: true,
          project: { select: { version: true } },
          _count: { select: { children: true } },
        },
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }
      if (task._count.children > 0) {
        return reply.status(400).send({ error: 'Plan entries can only be edited for leaf tasks' });
      }

      const startDate = req.body?.startDate ? toDateKey(req.body.startDate) : toDateKey(task.startDate);
      const endDate = req.body?.endDate ? toDateKey(req.body.endDate) : toDateKey(task.endDate);
      const workVolume = typeof req.body?.workVolume === 'number' && Number.isFinite(req.body.workVolume) && req.body.workVolume > 0
        ? req.body.workVolume
        : (task.workVolume ?? 0);

      if (!startDate || !endDate) {
        return reply.status(400).send({ error: 'Invalid task date range' });
      }

      const projectCalendar = await getProjectCalendarSettings(prisma, req.user!.projectId);
      const normalized = normalizeTaskPlanByDate({
        startDate,
        endDate,
        workVolume,
        basePlanByDate: sanitizeNumberMap(req.body?.basePlanByDate),
        nextPlanByDate: sanitizeNumberMap(req.body?.nextPlanByDate ?? req.body?.basePlanByDate),
        todayIso: new Date().toISOString().slice(0, 10),
        calendarWeeklyPattern: projectCalendar.calendarWeeklyPattern,
        calendarDays: projectCalendar.calendarDays,
      });

      let changedTasks: Array<{ id: string }> = [];
      let baseVersion = task.project.version;
      const currentStartDate = toDateKey(task.startDate);
      const currentEndDate = toDateKey(task.endDate);

      if (currentStartDate && normalized.startDate !== currentStartDate) {
        const response = await commandService.commitCommand({
          projectId: req.user!.projectId,
          baseVersion,
          clientRequestId: randomUUID(),
          command: {
            type: 'set_task_start',
            taskId,
            startDate: normalized.startDate,
          },
          includeSnapshot: false,
        }, 'user', req.user!.userId);

        if (!response.accepted) {
          return reply.status(409).send({ error: response.error ?? response.reason ?? 'Schedule update failed' });
        }

        baseVersion = response.newVersion;
        changedTasks = mergeChangedTasks(changedTasks, response.result.changedTasks ?? response.changedTasks ?? []);
      }

      if (currentEndDate && normalized.endDate !== currentEndDate) {
        const response = await commandService.commitCommand({
          projectId: req.user!.projectId,
          baseVersion,
          clientRequestId: randomUUID(),
          command: {
            type: 'set_task_end',
            taskId,
            endDate: normalized.endDate,
          },
          includeSnapshot: false,
        }, 'user', req.user!.userId);

        if (!response.accepted) {
          return reply.status(409).send({ error: response.error ?? response.reason ?? 'Schedule update failed' });
        }

        changedTasks = mergeChangedTasks(changedTasks, response.result.changedTasks ?? response.changedTasks ?? []);
      }

      await prisma.$transaction(async (tx) => {
        await deleteTaskPlanEntriesForTask(tx as any, req.user!.projectId, taskId);

        const entries = Object.entries(normalized.planByDate)
          .filter(([, amount]) => amount > PLAN_EPSILON)
          .map(([entryDate, amount]) => ({
            projectId: req.user!.projectId,
            taskId,
            entryDate: parseIsoDateOnly(entryDate)!,
            amount,
          }));

        if (entries.length > 0) {
          await insertTaskPlanEntries(tx as any, entries.map((entry) => ({ id: randomUUID(), ...entry })));
        }
      });

      const [updatedTask, planEntries] = await Promise.all([
        prisma.task.findUnique({
          where: { id: taskId },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            workVolume: true,
            workUnit: true,
            completedVolume: true,
            progress: true,
            status: true,
          },
        }),
        listTaskPlanEntries(prisma as any, req.user!.projectId, taskId),
      ]);

      return reply.send({
        task: {
          id: updatedTask!.id,
          startDate: updatedTask!.startDate.toISOString().slice(0, 10),
          endDate: updatedTask!.endDate.toISOString().slice(0, 10),
          workVolume: updatedTask!.workVolume ?? null,
          workUnit: updatedTask!.workUnit ?? null,
          completedVolume: updatedTask!.completedVolume ?? 0,
          progress: updatedTask!.progress ?? 0,
          status: normalizeStoredTaskStatus(updatedTask!.status),
        },
        planEntries: planEntries.map((entry) => ({
          id: entry.id,
          projectId: entry.projectId,
          taskId: entry.taskId,
          entryDate: entry.entryDate.toISOString().slice(0, 10),
          amount: entry.amount,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        })),
        changedTasks,
      });
    },
  );
}
