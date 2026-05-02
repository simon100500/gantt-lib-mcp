import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { authMiddleware } from '../middleware/auth-middleware.js';

type FinanceGranularity = 'month' | 'week';

type TaskRecord = {
  id: string;
  name: string;
  parentId: string | null;
  startDate: Date;
  endDate: Date;
  progress: number;
  sortOrder: number;
  childCount: number;
};

type FinanceTaskRow = {
  taskId: string;
  parentTaskId: string | null;
  title: string;
  depth: number;
  startDate: string;
  endDate: string;
  progress: number;
  plannedCost: number;
  plannedToDate: number;
  earnedToDate: number;
  paidToDate: number;
  variancePlannedVsEarned: number;
  varianceEarnedVsPaid: number;
  plannedByPeriod: Record<string, number>;
  paidByPeriod: Record<string, number>;
};

type FinancePeriodBucket = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(value: Date): string {
  return value.toISOString().split('T')[0]!;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDaysInclusive(start: Date, end: Date): number {
  return Math.floor((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / 86_400_000) + 1;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function startOfWeekMonday(value: Date): Date {
  const normalized = startOfUtcDay(value);
  const day = normalized.getUTCDay();
  const shift = day === 0 ? -6 : 1 - day;
  return addUtcDays(normalized, shift);
}

function endOfWeekSunday(value: Date): Date {
  return addUtcDays(startOfWeekMonday(value), 6);
}

function formatPeriodLabel(startDate: Date, granularity: FinanceGranularity): string {
  if (granularity === 'month') {
    return startDate.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  const weekAnchor = addUtcDays(startDate, 3);
  const jan4 = new Date(Date.UTC(weekAnchor.getUTCFullYear(), 0, 4));
  const week1Start = startOfWeekMonday(jan4);
  const weekNumber = Math.floor((startOfUtcDay(weekAnchor).getTime() - week1Start.getTime()) / (7 * 86_400_000)) + 1;
  return `Нед ${weekNumber}, ${weekAnchor.getUTCFullYear()}`;
}

function buildPeriods(startDate: Date, endDate: Date, granularity: FinanceGranularity): FinancePeriodBucket[] {
  const periods: FinancePeriodBucket[] = [];
  let cursor = granularity === 'month' ? startOfMonth(startDate) : startOfWeekMonday(startDate);
  const terminal = granularity === 'month' ? endOfMonth(endDate) : endOfWeekSunday(endDate);

  while (cursor.getTime() <= terminal.getTime()) {
    const periodStart = cursor;
    const periodEnd = granularity === 'month' ? endOfMonth(periodStart) : endOfWeekSunday(periodStart);
    periods.push({
      id: toIsoDate(periodStart),
      label: formatPeriodLabel(periodStart, granularity),
      startDate: toIsoDate(periodStart),
      endDate: toIsoDate(periodEnd),
    });
    cursor = addUtcDays(periodEnd, 1);
  }

  return periods;
}

function allocatePlannedByPeriod(periods: FinancePeriodBucket[], taskStart: Date, taskEnd: Date, plannedCost: number): Record<string, number> {
  const allocation: Record<string, number> = {};
  if (plannedCost <= 0) {
    return allocation;
  }

  const totalDays = diffDaysInclusive(taskStart, taskEnd);
  if (totalDays <= 0) {
    return allocation;
  }

  const overlaps = periods
    .map((period) => {
      const periodStart = parseIsoDate(period.startDate)!;
      const periodEnd = parseIsoDate(period.endDate)!;
      const overlapStart = taskStart.getTime() > periodStart.getTime() ? taskStart : periodStart;
      const overlapEnd = taskEnd.getTime() < periodEnd.getTime() ? taskEnd : periodEnd;
      if (overlapEnd.getTime() < overlapStart.getTime()) {
        return null;
      }
      return {
        periodId: period.id,
        days: diffDaysInclusive(overlapStart, overlapEnd),
      };
    })
    .filter((item): item is { periodId: string; days: number } => Boolean(item));

  let allocated = 0;
  overlaps.forEach((item, index) => {
    const isLast = index === overlaps.length - 1;
    const raw = plannedCost * (item.days / totalDays);
    const value = isLast ? roundMoney(plannedCost - allocated) : roundMoney(raw);
    allocation[item.periodId] = value;
    allocated = roundMoney(allocated + value);
  });

  return allocation;
}

function buildFinanceTaskRows(
  tasks: TaskRecord[],
  settingsByTaskId: Map<string, { id: string; plannedCost: number; currencyCode: string; createdAt: string; updatedAt: string }>,
  fundingEvents: Array<{ id: string; taskId: string; eventDate: string; amount: number; comment: string | null; createdAt: string; updatedAt: string }>,
  periods: FinancePeriodBucket[],
  asOfDate: Date,
): FinanceTaskRow[] {
  const groupTasks = tasks.filter((task) => task.childCount > 0);
  const groupTaskIds = new Set(groupTasks.map((task) => task.id));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const eventMap = new Map<string, Array<{ eventDate: string; amount: number }>>();

  fundingEvents.forEach((event) => {
    const list = eventMap.get(event.taskId) ?? [];
    list.push({ eventDate: event.eventDate, amount: event.amount });
    eventMap.set(event.taskId, list);
  });

  return groupTasks.map((task) => {
    const startDate = startOfUtcDay(task.startDate);
    const endDate = startOfUtcDay(task.endDate);
    const plannedCost = settingsByTaskId.get(task.id)?.plannedCost ?? 0;
    const totalDays = Math.max(1, diffDaysInclusive(startDate, endDate));
    const elapsedDays = asOfDate.getTime() < startDate.getTime()
      ? 0
      : asOfDate.getTime() > endDate.getTime()
        ? totalDays
        : diffDaysInclusive(startDate, asOfDate);
    const plannedToDate = plannedCost > 0 ? roundMoney(plannedCost * (elapsedDays / totalDays)) : 0;
    const earnedToDate = plannedCost > 0 ? roundMoney(plannedCost * ((task.progress ?? 0) / 100)) : 0;
    const plannedByPeriod = allocatePlannedByPeriod(periods, startDate, endDate, plannedCost);
    const paidByPeriod: Record<string, number> = {};
    let paidToDate = 0;

    for (const event of eventMap.get(task.id) ?? []) {
      const eventDate = parseIsoDate(event.eventDate);
      if (!eventDate) {
        continue;
      }

      if (eventDate.getTime() <= asOfDate.getTime()) {
        paidToDate = roundMoney(paidToDate + event.amount);
      }

      const period = periods.find((candidate) => {
        const periodStart = parseIsoDate(candidate.startDate)!;
        const periodEnd = parseIsoDate(candidate.endDate)!;
        return eventDate.getTime() >= periodStart.getTime() && eventDate.getTime() <= periodEnd.getTime();
      });

      if (period) {
        paidByPeriod[period.id] = roundMoney((paidByPeriod[period.id] ?? 0) + event.amount);
      }
    }

    let parentTaskId: string | null = task.parentId;
    while (parentTaskId && !groupTaskIds.has(parentTaskId)) {
      parentTaskId = taskMap.get(parentTaskId)?.parentId ?? null;
    }

    let depth = 0;
    let currentParentId = parentTaskId;
    while (currentParentId) {
      depth += 1;
      currentParentId = taskMap.get(currentParentId)?.parentId ?? null;
      while (currentParentId && !groupTaskIds.has(currentParentId)) {
        currentParentId = taskMap.get(currentParentId)?.parentId ?? null;
      }
    }

    return {
      taskId: task.id,
      parentTaskId,
      title: task.name,
      depth,
      startDate: toIsoDate(startDate),
      endDate: toIsoDate(endDate),
      progress: task.progress ?? 0,
      plannedCost,
      plannedToDate,
      earnedToDate,
      paidToDate,
      variancePlannedVsEarned: roundMoney(earnedToDate - plannedToDate),
      varianceEarnedVsPaid: roundMoney(paidToDate - earnedToDate),
      plannedByPeriod,
      paidByPeriod,
    };
  }).sort((left, right) => {
    const leftTask = taskMap.get(left.taskId)!;
    const rightTask = taskMap.get(right.taskId)!;
    return leftTask.sortOrder - rightTask.sortOrder || left.title.localeCompare(right.title);
  });
}

async function ensureFinanceGroupTask(projectId: string, taskId: string): Promise<TaskRecord> {
  const prisma = getPrisma();
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      startDate: true,
      endDate: true,
      progress: true,
      sortOrder: true,
      _count: {
        select: {
          children: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error('task_not_found');
  }

  if (task._count.children <= 0) {
    throw new Error('task_not_group');
  }

  return {
    id: task.id,
    name: task.name,
    parentId: task.parentId,
    startDate: task.startDate,
    endDate: task.endDate,
    progress: task.progress,
    sortOrder: task.sortOrder,
    childCount: task._count.children,
  };
}

export async function registerFinanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/finance', { preHandler: [authMiddleware] }, async (req, reply) => {
    const query = (req.query ?? {}) as { asOf?: string; granularity?: string };
    const granularity: FinanceGranularity = query.granularity === 'week' ? 'week' : 'month';
    const asOfDate = query.asOf ? parseIsoDate(query.asOf) : startOfUtcDay(new Date());

    if (!asOfDate) {
      return reply.status(400).send({ error: 'Invalid asOf date' });
    }

    const prisma = getPrisma();
    const [tasks, settings, events] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: req.user!.projectId },
        select: {
          id: true,
          name: true,
          parentId: true,
          startDate: true,
          endDate: true,
          progress: true,
          sortOrder: true,
          _count: {
            select: {
              children: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.taskFinanceSetting.findMany({
        where: { projectId: req.user!.projectId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.taskFundingEvent.findMany({
        where: { projectId: req.user!.projectId },
        orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    if (tasks.length === 0) {
      return reply.send({
        projectId: req.user!.projectId,
        asOfDate: toIsoDate(asOfDate),
        granularity,
        periods: [],
        tasks: [],
        settings: [],
        events: [],
      });
    }

    const normalizedTasks: TaskRecord[] = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      parentId: task.parentId,
      startDate: task.startDate,
      endDate: task.endDate,
      progress: task.progress,
      sortOrder: task.sortOrder,
      childCount: task._count.children,
    }));

    const firstEventDate = events[0]?.eventDate ? startOfUtcDay(events[0].eventDate) : null;
    const lastEventRecord = events.length > 0 ? events[events.length - 1]! : null;
    const lastEventDate = lastEventRecord?.eventDate ? startOfUtcDay(lastEventRecord.eventDate) : null;
    const taskStart = normalizedTasks.reduce((min, task) => task.startDate.getTime() < min.getTime() ? task.startDate : min, normalizedTasks[0]!.startDate);
    const taskEnd = normalizedTasks.reduce((max, task) => task.endDate.getTime() > max.getTime() ? task.endDate : max, normalizedTasks[0]!.endDate);
    const rangeStart = firstEventDate && firstEventDate.getTime() < taskStart.getTime() ? firstEventDate : taskStart;
    const rangeEnd = lastEventDate && lastEventDate.getTime() > taskEnd.getTime() ? lastEventDate : taskEnd;
    const periods = buildPeriods(rangeStart, rangeEnd, granularity);
    const settingsByTaskId = new Map(settings.map((setting) => [setting.taskId, {
      id: setting.id,
      plannedCost: Number(setting.plannedCost),
      currencyCode: setting.currencyCode,
      createdAt: setting.createdAt.toISOString(),
      updatedAt: setting.updatedAt.toISOString(),
    }]));
    const normalizedEvents = events.map((event) => ({
      id: event.id,
      projectId: event.projectId,
      taskId: event.taskId,
      eventDate: toIsoDate(event.eventDate),
      amount: Number(event.amount),
      comment: event.comment,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    }));

    return reply.send({
      projectId: req.user!.projectId,
      asOfDate: toIsoDate(asOfDate),
      granularity,
      periods,
      tasks: buildFinanceTaskRows(normalizedTasks, settingsByTaskId, normalizedEvents, periods, asOfDate),
      settings: settings.map((setting) => ({
        id: setting.id,
        projectId: setting.projectId,
        taskId: setting.taskId,
        plannedCost: Number(setting.plannedCost),
        currencyCode: setting.currencyCode,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString(),
      })),
      events: normalizedEvents,
    });
  });

  fastify.put('/api/finance/tasks/:taskId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    const body = (req.body ?? {}) as { plannedCost?: number; currencyCode?: string };
    const taskId = params.taskId?.trim();
    if (!taskId) {
      return reply.status(400).send({ error: 'taskId required' });
    }
    if (typeof body.plannedCost !== 'number' || Number.isNaN(body.plannedCost) || body.plannedCost < 0) {
      return reply.status(400).send({ error: 'plannedCost must be a non-negative number' });
    }

    try {
      await ensureFinanceGroupTask(req.user!.projectId, taskId);
    } catch (error) {
      return reply.status(error instanceof Error && error.message === 'task_not_group' ? 400 : 404).send({
        error: error instanceof Error && error.message === 'task_not_group' ? 'Only group tasks can store planned cost' : 'Task not found',
      });
    }

    const prisma = getPrisma();
    const setting = await prisma.taskFinanceSetting.upsert({
      where: { taskId },
      update: {
        plannedCost: body.plannedCost,
        currencyCode: typeof body.currencyCode === 'string' && body.currencyCode.trim() ? body.currencyCode.trim().toUpperCase() : 'RUB',
      },
      create: {
        projectId: req.user!.projectId,
        taskId,
        plannedCost: body.plannedCost,
        currencyCode: typeof body.currencyCode === 'string' && body.currencyCode.trim() ? body.currencyCode.trim().toUpperCase() : 'RUB',
      },
    });

    return reply.send({
      id: setting.id,
      projectId: setting.projectId,
      taskId: setting.taskId,
      plannedCost: Number(setting.plannedCost),
      currencyCode: setting.currencyCode,
      createdAt: setting.createdAt.toISOString(),
      updatedAt: setting.updatedAt.toISOString(),
    });
  });

  fastify.post('/api/finance/tasks/:taskId/events', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    const body = (req.body ?? {}) as { eventDate?: string; amount?: number; comment?: string | null };
    const taskId = params.taskId?.trim();
    if (!taskId) {
      return reply.status(400).send({ error: 'taskId required' });
    }
    const eventDate = typeof body.eventDate === 'string' ? parseIsoDate(body.eventDate) : null;
    if (!eventDate) {
      return reply.status(400).send({ error: 'eventDate must be YYYY-MM-DD' });
    }
    if (typeof body.amount !== 'number' || Number.isNaN(body.amount)) {
      return reply.status(400).send({ error: 'amount must be a number' });
    }

    try {
      await ensureFinanceGroupTask(req.user!.projectId, taskId);
    } catch (error) {
      return reply.status(error instanceof Error && error.message === 'task_not_group' ? 400 : 404).send({
        error: error instanceof Error && error.message === 'task_not_group' ? 'Only group tasks can store funding events' : 'Task not found',
      });
    }

    const event = await getPrisma().taskFundingEvent.create({
      data: {
        projectId: req.user!.projectId,
        taskId,
        eventDate,
        amount: body.amount,
        comment: typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null,
      },
    });

    return reply.status(201).send({
      id: event.id,
      projectId: event.projectId,
      taskId: event.taskId,
      eventDate: toIsoDate(event.eventDate),
      amount: Number(event.amount),
      comment: event.comment,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    });
  });

  fastify.patch('/api/finance/events/:eventId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { eventId?: string };
    const body = (req.body ?? {}) as { eventDate?: string; amount?: number; comment?: string | null };
    const eventId = params.eventId?.trim();
    if (!eventId) {
      return reply.status(400).send({ error: 'eventId required' });
    }

    const existing = await getPrisma().taskFundingEvent.findFirst({
      where: {
        id: eventId,
        projectId: req.user!.projectId,
      },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Funding event not found' });
    }

    const eventDate = typeof body.eventDate === 'string' ? parseIsoDate(body.eventDate) : undefined;
    if (typeof body.eventDate === 'string' && !eventDate) {
      return reply.status(400).send({ error: 'eventDate must be YYYY-MM-DD' });
    }
    if (body.amount !== undefined && (typeof body.amount !== 'number' || Number.isNaN(body.amount))) {
      return reply.status(400).send({ error: 'amount must be a number' });
    }

    const updated = await getPrisma().taskFundingEvent.update({
      where: { id: eventId },
      data: {
        eventDate: eventDate ?? undefined,
        amount: body.amount,
        comment: body.comment === undefined
          ? undefined
          : typeof body.comment === 'string' && body.comment.trim()
            ? body.comment.trim()
            : null,
      },
    });

    return reply.send({
      id: updated.id,
      projectId: updated.projectId,
      taskId: updated.taskId,
      eventDate: toIsoDate(updated.eventDate),
      amount: Number(updated.amount),
      comment: updated.comment,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  fastify.delete('/api/finance/events/:eventId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { eventId?: string };
    const eventId = params.eventId?.trim();
    if (!eventId) {
      return reply.status(400).send({ error: 'eventId required' });
    }

    const existing = await getPrisma().taskFundingEvent.findFirst({
      where: {
        id: eventId,
        projectId: req.user!.projectId,
      },
      select: { id: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Funding event not found' });
    }

    await getPrisma().taskFundingEvent.delete({ where: { id: eventId } });
    return reply.send({ id: eventId });
  });
}
