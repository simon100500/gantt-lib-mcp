import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { authMiddleware } from '../middleware/auth-middleware.js';

type FinanceGranularity = 'month' | 'week';
type FinanceAllocationMode = 'manual' | 'auto';

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
  allocationMode: FinanceAllocationMode;
  allocationParentTaskId: string | null;
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

type FinanceSettingRecord = {
  id: string;
  plannedCost: number;
  currencyCode: string;
  allocationMode: FinanceAllocationMode;
  allocationParentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

type FinanceSettingsStore = {
  taskFinanceSetting: ReturnType<typeof getPrisma>['taskFinanceSetting'];
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

function getTaskDurationDays(task: TaskRecord): number {
  return Math.max(1, diffDaysInclusive(startOfUtcDay(task.startDate), startOfUtcDay(task.endDate)));
}

function allocateChildCostsByDuration(
  children: TaskRecord[],
  totalPlannedCost: number,
): Map<string, number> {
  const allocation = new Map<string, number>();
  if (children.length === 0) {
    return allocation;
  }

  const totalDays = children.reduce((sum, child) => sum + getTaskDurationDays(child), 0);
  if (totalDays <= 0) {
    let allocated = 0;
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const value = isLast ? roundMoney(totalPlannedCost - allocated) : 0;
      allocation.set(child.id, value);
      allocated = roundMoney(allocated + value);
    });
    return allocation;
  }

  let allocated = 0;
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const raw = totalPlannedCost * (getTaskDurationDays(child) / totalDays);
    const value = isLast ? roundMoney(totalPlannedCost - allocated) : roundMoney(raw);
    allocation.set(child.id, value);
    allocated = roundMoney(allocated + value);
  });

  return allocation;
}

function getDirectChildren(tasks: TaskRecord[], parentTaskId: string): TaskRecord[] {
  return tasks.filter((task) => task.parentId === parentTaskId);
}

function sumPlannedCosts(taskIds: string[], settingsByTaskId: Map<string, FinanceSettingRecord>): number {
  return roundMoney(taskIds.reduce((sum, taskId) => sum + (settingsByTaskId.get(taskId)?.plannedCost ?? 0), 0));
}

async function upsertFinanceSetting(
  tx: FinanceSettingsStore,
  input: {
    projectId: string;
    taskId: string;
    plannedCost: number;
    currencyCode: string;
    allocationMode: FinanceAllocationMode;
    allocationParentTaskId: string | null;
  },
  settingsByTaskId?: Map<string, FinanceSettingRecord>,
): Promise<void> {
  await tx.taskFinanceSetting.upsert({
    where: { taskId: input.taskId },
    update: {
      plannedCost: input.plannedCost,
      currencyCode: input.currencyCode,
      allocationMode: input.allocationMode,
      allocationParentTaskId: input.allocationParentTaskId,
    },
    create: {
      projectId: input.projectId,
      taskId: input.taskId,
      plannedCost: input.plannedCost,
      currencyCode: input.currencyCode,
      allocationMode: input.allocationMode,
      allocationParentTaskId: input.allocationParentTaskId,
    },
  });

  settingsByTaskId?.set(input.taskId, {
    id: settingsByTaskId.get(input.taskId)?.id ?? `pending:${input.taskId}`,
    plannedCost: input.plannedCost,
    currencyCode: input.currencyCode,
    allocationMode: input.allocationMode,
    allocationParentTaskId: input.allocationParentTaskId,
    createdAt: settingsByTaskId.get(input.taskId)?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function buildChildrenByParent(tasks: TaskRecord[]): Map<string, TaskRecord[]> {
  const childrenByParent = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }
    const bucket = childrenByParent.get(task.parentId) ?? [];
    bucket.push(task);
    childrenByParent.set(task.parentId, bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((left, right) => left.sortOrder - right.sortOrder);
  }
  return childrenByParent;
}

async function redistributeSubtreeFromParent(
  tx: FinanceSettingsStore,
  input: {
    projectId: string;
    parentTaskId: string;
    totalPlannedCost: number;
    currencyCode: string;
    childrenByParent: Map<string, TaskRecord[]>;
    settingsByTaskId: Map<string, FinanceSettingRecord>;
  },
): Promise<void> {
  const directChildren = input.childrenByParent.get(input.parentTaskId) ?? [];
  if (directChildren.length === 0) {
    return;
  }

  const allocation = allocateChildCostsByDuration(directChildren, input.totalPlannedCost);
  for (const child of directChildren) {
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: child.id,
      plannedCost: allocation.get(child.id) ?? 0,
      currencyCode: input.currencyCode,
      allocationMode: 'auto',
      allocationParentTaskId: input.parentTaskId,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: child.id,
      totalPlannedCost: allocation.get(child.id) ?? 0,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
  }
}

async function rebalanceSiblingsAfterManualChildEdit(
  tx: FinanceSettingsStore,
  input: {
    projectId: string;
    taskId: string;
    requestedPlannedCost: number;
    currencyCode: string;
    tasks: TaskRecord[];
    childrenByParent: Map<string, TaskRecord[]>;
    settingsByTaskId: Map<string, FinanceSettingRecord>;
  },
): Promise<number> {
  const task = input.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task?.parentId) {
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: input.taskId,
      plannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      allocationMode: 'manual',
      allocationParentTaskId: null,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: input.taskId,
      totalPlannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
    return input.requestedPlannedCost;
  }

  const parentSetting = input.settingsByTaskId.get(task.parentId);
  if (!parentSetting) {
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: input.taskId,
      plannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      allocationMode: 'manual',
      allocationParentTaskId: null,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: input.taskId,
      totalPlannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
    return input.requestedPlannedCost;
  }

  const siblings = input.childrenByParent.get(task.parentId) ?? [];
  if (siblings.length === 0) {
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: input.taskId,
      plannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      allocationMode: 'manual',
      allocationParentTaskId: null,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: input.taskId,
      totalPlannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
    return input.requestedPlannedCost;
  }

  const otherManualSiblings = siblings.filter((sibling) => {
    if (sibling.id === input.taskId) {
      return false;
    }
    return input.settingsByTaskId.get(sibling.id)?.allocationMode === 'manual';
  });
  const autoSiblings = siblings.filter((sibling) => {
    if (sibling.id === input.taskId) {
      return false;
    }
    return input.settingsByTaskId.get(sibling.id)?.allocationMode !== 'manual';
  });
  const manualSiblingTotal = sumPlannedCosts(otherManualSiblings.map((sibling) => sibling.id), input.settingsByTaskId);

  if (autoSiblings.length === 0) {
    const totalManualPlannedCost = roundMoney(manualSiblingTotal + input.requestedPlannedCost);
    if (totalManualPlannedCost > parentSetting.plannedCost) {
      throw new Error('manual_children_exceed_parent');
    }

    if (Math.abs(totalManualPlannedCost - parentSetting.plannedCost) >= 0.0001) {
      throw new Error('manual_children_must_match_parent');
    }

    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: input.taskId,
      plannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      allocationMode: 'manual',
      allocationParentTaskId: null,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: input.taskId,
      totalPlannedCost: input.requestedPlannedCost,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
    return input.requestedPlannedCost;
  }

  const remainder = roundMoney(parentSetting.plannedCost - manualSiblingTotal - input.requestedPlannedCost);
  if (remainder < 0) {
    throw new Error('manual_children_exceed_parent');
  }

  await upsertFinanceSetting(tx, {
    projectId: input.projectId,
    taskId: input.taskId,
    plannedCost: input.requestedPlannedCost,
    currencyCode: input.currencyCode,
    allocationMode: 'manual',
    allocationParentTaskId: null,
  }, input.settingsByTaskId);
  await redistributeSubtreeFromParent(tx, {
    projectId: input.projectId,
    parentTaskId: input.taskId,
    totalPlannedCost: input.requestedPlannedCost,
    currencyCode: input.currencyCode,
    childrenByParent: input.childrenByParent,
    settingsByTaskId: input.settingsByTaskId,
  });

  const allocation = allocateChildCostsByDuration(autoSiblings, remainder);
  for (const sibling of autoSiblings) {
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: sibling.id,
      plannedCost: allocation.get(sibling.id) ?? 0,
      currencyCode: input.currencyCode,
      allocationMode: 'auto',
      allocationParentTaskId: task.parentId,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: sibling.id,
      totalPlannedCost: allocation.get(sibling.id) ?? 0,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
  }

  return input.requestedPlannedCost;
}

async function rebalanceSiblingsForAutoTask(
  tx: FinanceSettingsStore,
  input: {
    projectId: string;
    taskId: string;
    currencyCode: string;
    tasks: TaskRecord[];
    childrenByParent: Map<string, TaskRecord[]>;
    settingsByTaskId: Map<string, FinanceSettingRecord>;
  },
): Promise<number> {
  const task = input.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task?.parentId) {
    throw new Error('auto_requires_parent');
  }

  const parentSetting = input.settingsByTaskId.get(task.parentId);
  if (!parentSetting) {
    throw new Error('auto_requires_parent');
  }

  const siblings = input.childrenByParent.get(task.parentId) ?? [];
  const manualSiblings = siblings.filter((sibling) => input.settingsByTaskId.get(sibling.id)?.allocationMode === 'manual');
  const autoSiblings = siblings.filter((sibling) => input.settingsByTaskId.get(sibling.id)?.allocationMode !== 'manual' || sibling.id === input.taskId);
  const manualSiblingTotal = sumPlannedCosts(
    manualSiblings
      .filter((sibling) => sibling.id !== input.taskId)
      .map((sibling) => sibling.id),
    input.settingsByTaskId,
  );

  const remainder = roundMoney(parentSetting.plannedCost - manualSiblingTotal);
  if (remainder < 0) {
    throw new Error('manual_children_exceed_parent');
  }

  const allocation = allocateChildCostsByDuration(autoSiblings, remainder);
  for (const sibling of autoSiblings) {
    const plannedCost = allocation.get(sibling.id) ?? 0;
    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: sibling.id,
      plannedCost,
      currencyCode: input.currencyCode,
      allocationMode: 'auto',
      allocationParentTaskId: task.parentId,
    }, input.settingsByTaskId);
    await redistributeSubtreeFromParent(tx, {
      projectId: input.projectId,
      parentTaskId: sibling.id,
      totalPlannedCost: plannedCost,
      currencyCode: input.currencyCode,
      childrenByParent: input.childrenByParent,
      settingsByTaskId: input.settingsByTaskId,
    });
  }

  return allocation.get(input.taskId) ?? 0;
}

async function lockAncestorsWhenChildrenFullyFixed(
  tx: FinanceSettingsStore,
  input: {
    projectId: string;
    startTaskId: string;
    currencyCode: string;
    taskMap: Map<string, TaskRecord>;
    childrenByParent: Map<string, TaskRecord[]>;
    settingsByTaskId: Map<string, FinanceSettingRecord>;
  },
): Promise<void> {
  let currentParentId = input.taskMap.get(input.startTaskId)?.parentId ?? null;

  while (currentParentId) {
    const parentTask = input.taskMap.get(currentParentId);
    const parentSetting = input.settingsByTaskId.get(currentParentId);
    if (!parentTask || !parentSetting) {
      currentParentId = parentTask?.parentId ?? null;
      continue;
    }

    const directChildren = input.childrenByParent.get(currentParentId) ?? [];
    if (directChildren.length === 0) {
      currentParentId = parentTask.parentId ?? null;
      continue;
    }

    const allChildrenManual = directChildren.every((child) => input.settingsByTaskId.get(child.id)?.allocationMode === 'manual');
    if (!allChildrenManual) {
      currentParentId = parentTask.parentId ?? null;
      continue;
    }

    const childTotal = roundMoney(
      directChildren.reduce((sum, child) => sum + (input.settingsByTaskId.get(child.id)?.plannedCost ?? 0), 0),
    );
    if (Math.abs(childTotal - parentSetting.plannedCost) >= 0.0001) {
      currentParentId = parentTask.parentId ?? null;
      continue;
    }

    await upsertFinanceSetting(tx, {
      projectId: input.projectId,
      taskId: currentParentId,
      plannedCost: parentSetting.plannedCost,
      currencyCode: parentSetting.currencyCode || input.currencyCode,
      allocationMode: 'manual',
      allocationParentTaskId: null,
    }, input.settingsByTaskId);

    currentParentId = parentTask.parentId ?? null;
  }
}

function buildFinanceTaskRows(
  tasks: TaskRecord[],
  settingsByTaskId: Map<string, FinanceSettingRecord>,
  fundingEvents: Array<{ id: string; taskId: string; eventDate: string; amount: number; comment: string | null; createdAt: string; updatedAt: string }>,
  periods: FinancePeriodBucket[],
  asOfDate: Date,
): FinanceTaskRow[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string | null, TaskRecord[]>();
  const eventMap = new Map<string, Array<{ eventDate: string; amount: number }>>();

  for (const task of tasks) {
    const key = task.parentId ?? null;
    const bucket = childrenByParent.get(key) ?? [];
    bucket.push(task);
    childrenByParent.set(key, bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((left, right) => left.sortOrder - right.sortOrder);
  }

  fundingEvents.forEach((event) => {
    const list = eventMap.get(event.taskId) ?? [];
    list.push({ eventDate: event.eventDate, amount: event.amount });
    eventMap.set(event.taskId, list);
  });

  const orderedTasks: TaskRecord[] = [];
  const visit = (task: TaskRecord) => {
    orderedTasks.push(task);
    for (const child of childrenByParent.get(task.id) ?? []) {
      visit(child);
    }
  };
  for (const rootTask of childrenByParent.get(null) ?? []) {
    visit(rootTask);
  }

  return orderedTasks.map((task) => {
    const startDate = startOfUtcDay(task.startDate);
    const endDate = startOfUtcDay(task.endDate);
    const setting = settingsByTaskId.get(task.id);
    const plannedCost = setting?.plannedCost ?? 0;
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

    const parentTaskId = task.parentId;
    let depth = 0;
    let currentParentId = task.parentId;
    while (currentParentId) {
      depth += 1;
      currentParentId = taskMap.get(currentParentId)?.parentId ?? null;
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
      hasOwnFinanceSetting: settingsByTaskId.has(task.id),
      allocationMode: setting?.allocationMode ?? 'manual',
      allocationParentTaskId: setting?.allocationParentTaskId ?? null,
      plannedToDate,
      earnedToDate,
      paidToDate,
      variancePlannedVsEarned: roundMoney(earnedToDate - plannedToDate),
      varianceEarnedVsPaid: roundMoney(paidToDate - earnedToDate),
      plannedByPeriod,
      paidByPeriod,
    };
  });
}

async function ensureFinanceTask(projectId: string, taskId: string): Promise<TaskRecord> {
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
        orderBy: { sortOrder: 'asc' },
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
      allocationMode: setting.allocationMode as FinanceAllocationMode,
      allocationParentTaskId: setting.allocationParentTaskId,
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
        allocationMode: setting.allocationMode,
        allocationParentTaskId: setting.allocationParentTaskId,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString(),
      })),
      events: normalizedEvents,
    });
  });

  fastify.put('/api/finance/tasks/:taskId', { preHandler: [authMiddleware] }, async (req, reply) => {
    const params = req.params as { taskId?: string };
    const body = (req.body ?? {}) as { plannedCost?: number; currencyCode?: string; allocationMode?: FinanceAllocationMode };
    const taskId = params.taskId?.trim();
    if (!taskId) {
      return reply.status(400).send({ error: 'taskId required' });
    }
    if (body.plannedCost !== undefined && (typeof body.plannedCost !== 'number' || Number.isNaN(body.plannedCost) || body.plannedCost < 0)) {
      return reply.status(400).send({ error: 'plannedCost must be a non-negative number' });
    }
    if (body.plannedCost === undefined && body.allocationMode === undefined) {
      return reply.status(400).send({ error: 'plannedCost or allocationMode required' });
    }

    try {
      await ensureFinanceTask(req.user!.projectId, taskId);
    } catch (error) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    const prisma = getPrisma();
    const currencyCode = typeof body.currencyCode === 'string' && body.currencyCode.trim() ? body.currencyCode.trim().toUpperCase() : 'RUB';

    try {
      const result = await prisma.$transaction(async (tx) => {
        const tasks = await tx.task.findMany({
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
        });
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
        const childrenByParent = buildChildrenByParent(normalizedTasks);
        const taskMap = new Map(normalizedTasks.map((task) => [task.id, task]));
        const targetTask = normalizedTasks.find((task) => task.id === taskId);
        if (!targetTask) {
          throw new Error('task_not_found');
        }

        const settings = await tx.taskFinanceSetting.findMany({
          where: { projectId: req.user!.projectId },
          orderBy: { createdAt: 'asc' },
        });
        const settingsByTaskId = new Map(settings.map((setting) => [setting.taskId, {
          id: setting.id,
          plannedCost: Number(setting.plannedCost),
          currencyCode: setting.currencyCode,
          allocationMode: setting.allocationMode as FinanceAllocationMode,
          allocationParentTaskId: setting.allocationParentTaskId,
          createdAt: setting.createdAt.toISOString(),
          updatedAt: setting.updatedAt.toISOString(),
        } satisfies FinanceSettingRecord]));
        const existingSetting = settingsByTaskId.get(taskId);
        const requestedPlannedCost = body.plannedCost ?? existingSetting?.plannedCost ?? 0;
        const requestedAllocationMode = body.allocationMode ?? 'manual';

        const parentHasPlannedCost = Boolean(targetTask.parentId && settingsByTaskId.get(targetTask.parentId));

        if (requestedAllocationMode === 'auto') {
          await rebalanceSiblingsForAutoTask(tx, {
            projectId: req.user!.projectId,
            taskId,
            currencyCode,
            tasks: normalizedTasks,
            childrenByParent,
            settingsByTaskId,
          });
        } else if (!parentHasPlannedCost) {
          await upsertFinanceSetting(tx, {
            projectId: req.user!.projectId,
            taskId,
            plannedCost: requestedPlannedCost,
            currencyCode,
            allocationMode: 'manual',
            allocationParentTaskId: null,
          }, settingsByTaskId);
          await redistributeSubtreeFromParent(tx, {
            projectId: req.user!.projectId,
            parentTaskId: taskId,
            totalPlannedCost: requestedPlannedCost,
            currencyCode,
            childrenByParent,
            settingsByTaskId,
          });
        } else {
          await rebalanceSiblingsAfterManualChildEdit(tx, {
            projectId: req.user!.projectId,
            taskId,
            requestedPlannedCost,
            currencyCode,
            tasks: normalizedTasks,
            childrenByParent,
            settingsByTaskId,
          });
        }

        await lockAncestorsWhenChildrenFullyFixed(tx, {
          projectId: req.user!.projectId,
          startTaskId: taskId,
          currencyCode,
          taskMap,
          childrenByParent,
          settingsByTaskId,
        });

        const saved = await tx.taskFinanceSetting.findUniqueOrThrow({ where: { taskId } });
        return {
          id: saved.id,
          projectId: saved.projectId,
          taskId: saved.taskId,
          plannedCost: Number(saved.plannedCost),
          currencyCode: saved.currencyCode,
          allocationMode: saved.allocationMode,
          allocationParentTaskId: saved.allocationParentTaskId,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
        };
      });

      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'manual_children_exceed_parent') {
        return reply.status(400).send({ error: 'Child manual amounts exceed parent planned cost' });
      }
      if (error instanceof Error && error.message === 'manual_children_must_match_parent') {
        return reply.status(400).send({ error: 'When all child amounts are fixed, their sum must equal parent planned cost' });
      }
      if (error instanceof Error && error.message === 'auto_requires_parent') {
        return reply.status(400).send({ error: 'Auto allocation requires a parent with planned cost' });
      }
      throw error;
    }
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
      await ensureFinanceTask(req.user!.projectId, taskId);
    } catch (error) {
      return reply.status(404).send({ error: 'Task not found' });
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
