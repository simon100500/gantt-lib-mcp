import { randomUUID } from 'node:crypto';
import { validateDependencies } from 'gantt-lib/core/scheduling';
import { getPrisma, type PrismaClient } from '../prisma.js';
import {
  getProjectScheduleOptionsForProject,
} from '../services/projectScheduleOptions.js';
import { commandService, type CommandService } from '../services/command.service.js';
import { taskService, type TaskService } from '../services/task.service.js';
import type {
  CommitProjectCommandResponse,
  ProjectSummary,
  Task,
} from '../types.js';
import type { ToolCallContext } from './types.js';

type ToolContextOptions = {
  actorType?: ToolCallContext['actorType'];
  actorId?: string;
  defaultProjectId?: string;
  prisma?: PrismaClient;
  commandService?: Pick<CommandService, 'commitCommand'>;
  taskService?: Pick<TaskService, 'list' | 'get'>;
};

function formatDateOnly(value: string | Date): string {
  return String(value).split('T')[0];
}

async function listAllProjectTasks(service: Pick<TaskService, 'list'>, projectId: string): Promise<Task[]> {
  const tasks: Task[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const page = await service.list(projectId, undefined, pageSize, offset);
    tasks.push(...page.tasks);
    if (!page.hasMore) {
      break;
    }
    offset += pageSize;
  }

  return tasks;
}

async function getProjectSummary(prisma: PrismaClient, projectId: string): Promise<ProjectSummary> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      version: true,
      ganttDayMode: true,
      tasks: {
        select: {
          id: true,
          parentId: true,
          startDate: true,
          endDate: true,
          dependencies: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const tasks = project.tasks.map((task) => ({
    id: task.id,
    startDate: formatDateOnly(task.startDate),
    endDate: formatDateOnly(task.endDate),
    parentId: task.parentId ?? undefined,
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.depTaskId,
      type: dependency.type,
      lag: dependency.lag,
    })),
  }));

  const validation = validateDependencies(tasks);
  const sortedByStart = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sortedByEnd = [...tasks].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const healthFlags: string[] = [];

  if (!validation.isValid) {
    healthFlags.push('dependency_errors');
  }
  if (tasks.some((task) => task.parentId && !tasks.find((candidate) => candidate.id === task.parentId))) {
    healthFlags.push('orphaned_hierarchy_refs');
  }
  if (tasks.length === 0) {
    healthFlags.push('empty_project');
  }

  return {
    projectId: project.id,
    version: project.version,
    dayMode: project.ganttDayMode,
    effectiveDateRange: {
      startDate: sortedByStart[0]?.startDate ?? null,
      endDate: sortedByEnd[sortedByEnd.length - 1]?.endDate ?? null,
    },
    rootTaskCount: tasks.filter((task) => !task.parentId).length,
    totalTaskCount: tasks.length,
    healthFlags,
  };
}

function resolveProjectId(defaultProjectId?: string, projectId?: string | null): string | undefined {
  if (typeof projectId === 'string' && projectId.trim().length > 0) {
    return projectId.trim();
  }

  if (defaultProjectId && defaultProjectId.trim().length > 0) {
    return defaultProjectId.trim();
  }

  if (process.env.PROJECT_ID && process.env.PROJECT_ID.trim().length > 0) {
    return process.env.PROJECT_ID.trim();
  }

  return undefined;
}

async function commitCommand(
  service: Pick<CommandService, 'commitCommand'>,
  prisma: PrismaClient,
  actorType: ToolCallContext['actorType'],
  actorId: string | undefined,
  projectId: string,
  command: Parameters<ToolCallContext['commitCommand']>[1],
): Promise<{ baseVersion: number; response: CommitProjectCommandResponse }> {
  const summary = await getProjectSummary(prisma, projectId);
  const response = await service.commitCommand(
    {
      projectId,
      clientRequestId: `tool-core-${randomUUID()}`,
      baseVersion: summary.version,
      command,
    },
    actorType,
    actorId,
  );

  return {
    baseVersion: summary.version,
    response,
  };
}

export function createToolContext(options: ToolContextOptions = {}): ToolCallContext {
  const prisma = options.prisma ?? getPrisma();
  const taskApi = options.taskService ?? taskService;
  const commandApi = options.commandService ?? commandService;

  return {
    actorType: options.actorType ?? 'agent',
    actorId: options.actorId,
    defaultProjectId: options.defaultProjectId,
    getProjectSummary: async (projectId) => getProjectSummary(prisma, projectId),
    listAllProjectTasks: async (projectId) => listAllProjectTasks(taskApi, projectId),
    getTask: async (_projectId, taskId) => taskApi.get(taskId),
    getProjectScheduleOptions: async (projectId) => getProjectScheduleOptionsForProject(prisma, projectId),
    commitCommand: async (projectId, command) => commitCommand(commandApi, prisma, options.actorType ?? 'agent', options.actorId, projectId, command),
    resolveProjectId: (projectId) => resolveProjectId(options.defaultProjectId, projectId),
  };
}
