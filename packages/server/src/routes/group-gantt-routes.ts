import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@gantt/runtime-core/prisma';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { resolveGroupAccess } from '../access-control.js';
import { normalizeStoredTaskStatus } from '@gantt/runtime-core/services/task-status';

type DbTask = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: 'task' | 'milestone';
  status: 'not_started' | 'in_progress' | 'done' | 'closed';
  color: string | null;
  progress: number;
  workVolume: number | null;
  parentId: string | null;
  sortOrder: number;
};

export type GroupGanttSectionOverview = {
  taskId: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: string;
  color: string | null;
  children?: GroupGanttSectionOverview[];
};

export type GroupGanttOverviewProject = {
  id: string;
  name: string;
  status: 'active' | 'archived' | 'deleted';
  ganttDayMode: 'business' | 'calendar';
  startDate: string | null;
  endDate: string | null;
  progress: number;
  taskCount: number;
  sectionCount: number;
  sections: GroupGanttSectionOverview[];
};

export type GroupGanttOverviewPayload = {
  group: {
    id: string;
    name: string;
  };
  projects: GroupGanttOverviewProject[];
};

export type GroupGanttOverviewLoadResult =
  | { kind: 'ok'; payload: GroupGanttOverviewPayload }
  | { kind: 'forbidden' }
  | { kind: 'hidden' }
  | { kind: 'not_found' };

function toDateOnly(value: Date): string {
  return value.toISOString().split('T')[0] ?? '';
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function durationDays(startDate: Date, endDate: Date): number {
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function descendantsOf(rootId: string, childrenByParentId: Map<string, DbTask[]>): DbTask[] {
  const result: DbTask[] = [];
  const stack = [...(childrenByParentId.get(rootId) ?? [])];

  while (stack.length > 0) {
    const task = stack.shift()!;
    result.push(task);
    stack.push(...(childrenByParentId.get(task.id) ?? []));
  }

  return result;
}

function summarizeTasks(tasks: DbTask[]): { startDate: string | null; endDate: string | null; progress: number } {
  if (tasks.length === 0) {
    return { startDate: null, endDate: null, progress: 0 };
  }

  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  let weightedProgress = 0;
  let totalWeight = 0;

  for (const task of tasks) {
    if (!minStart || task.startDate.getTime() < minStart.getTime()) {
      minStart = task.startDate;
    }
    if (!maxEnd || task.endDate.getTime() > maxEnd.getTime()) {
      maxEnd = task.endDate;
    }

    const weight = typeof task.workVolume === 'number' && Number.isFinite(task.workVolume) && task.workVolume > 0
      ? task.workVolume
      : durationDays(task.startDate, task.endDate);
    weightedProgress += clampProgress(task.progress) * weight;
    totalWeight += weight;
  }

  return {
    startDate: minStart ? toDateOnly(minStart) : null,
    endDate: maxEnd ? toDateOnly(maxEnd) : null,
    progress: totalWeight > 0 ? clampProgress(weightedProgress / totalWeight) : 0,
  };
}

function rollupTasks(tasks: DbTask[], childrenByParentId: Map<string, DbTask[]>): DbTask[] {
  const leaves = tasks.filter((task) => (childrenByParentId.get(task.id)?.length ?? 0) === 0);
  return leaves.length > 0 ? leaves : tasks;
}

function pickSectionTasks(tasks: DbTask[], childrenByParentId: Map<string, DbTask[]>): DbTask[] {
  const roots = tasks.filter((task) => task.parentId === null);

  if (roots.length === 1 && (childrenByParentId.get(roots[0]!.id)?.length ?? 0) > 0) {
    return [...(childrenByParentId.get(roots[0]!.id) ?? [])].sort(compareTasks);
  }

  return roots.sort(compareTasks);
}

function sectionToOverview(section: DbTask, childrenByParentId: Map<string, DbTask[]>, depth: number): GroupGanttSectionOverview {
  const subtree = [section, ...descendantsOf(section.id, childrenByParentId)];
  const summary = summarizeTasks(rollupTasks(subtree, childrenByParentId));
  const childSections = depth < 2
    ? (childrenByParentId.get(section.id) ?? []).map((child) => sectionToOverview(child, childrenByParentId, depth + 1))
    : [];

  return {
    taskId: section.id,
    name: section.name,
    startDate: summary.startDate ?? toDateOnly(section.startDate),
    endDate: summary.endDate ?? toDateOnly(section.endDate),
    progress: summary.progress,
    status: normalizeStoredTaskStatus(section.status),
    color: section.color,
    ...(childSections.length > 0 ? { children: childSections } : {}),
  };
}

function countVisibleSections(sections: GroupGanttSectionOverview[]): number {
  return sections.reduce((sum, section) => sum + 1 + countVisibleSections(section.children ?? []), 0);
}

function compareTasks(left: DbTask, right: DbTask): number {
  return left.sortOrder - right.sortOrder
    || left.startDate.getTime() - right.startDate.getTime()
    || left.name.localeCompare(right.name, 'ru')
    || left.id.localeCompare(right.id);
}

export async function registerGroupGanttRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/project-groups/:groupId/overview-gantt', { preHandler: [authMiddleware] }, async (req, reply) => {
    const groupId = (req.params as { groupId?: string }).groupId?.trim();
    if (!groupId) {
      return reply.status(400).send({ error: 'groupId required' });
    }

    const result = await loadGroupGanttOverview(req.user!.userId, groupId);
    if (result.kind === 'forbidden') {
      return reply.status(403).send({ error: 'Project group access denied' });
    }
    if (result.kind === 'hidden') {
      return reply.status(403).send({ error: 'Project group schedule is hidden for this user' });
    }
    if (result.kind === 'not_found') {
      return reply.status(404).send({ error: 'Project group not found' });
    }

    return reply.send(result.payload);
  });
}

export async function loadGroupGanttOverview(userId: string, groupId: string): Promise<GroupGanttOverviewLoadResult> {
  const access = await resolveGroupAccess(userId, groupId);
  if (!access) {
    return { kind: 'forbidden' };
  }
  if (access.permissions.schedule === 'none') {
    return { kind: 'hidden' };
  }

  const prisma = getPrisma();
  const group = await prisma.projectGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  });
  if (!group) {
    return { kind: 'not_found' };
  }

  const projects = await prisma.project.findMany({
    where: {
      groupId,
      status: 'active',
    },
    select: {
      id: true,
      name: true,
      status: true,
      ganttDayMode: true,
      tasks: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          type: true,
          status: true,
          color: true,
          progress: true,
          workVolume: true,
          parentId: true,
          sortOrder: true,
        },
        orderBy: [
          { sortOrder: 'asc' },
          { startDate: 'asc' },
          { name: 'asc' },
        ],
      },
    },
    orderBy: [
      { createdAt: 'asc' },
      { name: 'asc' },
    ],
  });

  return {
    kind: 'ok',
    payload: {
      group: {
        id: group.id,
        name: group.name,
      },
      projects: projects.map((project) => {
        const tasks = project.tasks as DbTask[];
        const childrenByParentId = new Map<string, DbTask[]>();
        for (const task of tasks) {
          if (!task.parentId) {
            continue;
          }
          const bucket = childrenByParentId.get(task.parentId) ?? [];
          bucket.push(task);
          childrenByParentId.set(task.parentId, bucket);
        }
        for (const bucket of childrenByParentId.values()) {
          bucket.sort(compareTasks);
        }

        const projectSummary = summarizeTasks(rollupTasks(tasks, childrenByParentId));
        const sectionTasks = pickSectionTasks(tasks, childrenByParentId);

        const sections = sectionTasks.map((section) => sectionToOverview(section, childrenByParentId, 1));

        return {
          id: project.id,
          name: project.name,
          status: project.status,
          ganttDayMode: project.ganttDayMode,
          startDate: projectSummary.startDate,
          endDate: projectSummary.endDate,
          progress: projectSummary.progress,
          taskCount: tasks.length,
          sectionCount: countVisibleSections(sections),
          sections,
        };
      }),
    },
  };
}
