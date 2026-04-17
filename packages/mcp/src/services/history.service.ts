import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type {
  ActorType,
  CommitProjectCommandResponse,
  DependencyType,
  MutationGroupRecord,
  ProjectCommand,
  ProjectSnapshot,
  Task,
  TaskDependency,
} from '../types.js';
import { dateToDomain } from './types.js';
import { commandService, type CommandService } from './command.service.js';

export type HistoryGroupListItem = MutationGroupRecord & {
  commandCount: number;
  createdAt: string;
  redoable: boolean;
};

export type ListHistoryGroupsInput = {
  projectId: string;
  cursor?: string;
  limit?: number;
};

export type HistoryMutationRequest = {
  projectId: string;
  actorType: ActorType;
  actorId?: string;
  requestContextId?: string;
};

export type UndoGroupRequest = HistoryMutationRequest & {
  groupId: string;
};

export type HistoryMutationFailureReason =
  | 'version_conflict'
  | 'validation_error'
  | 'redo_not_available'
  | 'history_diverged'
  | 'target_not_undone';

export type HistoryMutationResponse =
  | {
      accepted: true;
      version: number;
      snapshot: ProjectSnapshot;
      groupId: string;
      targetGroupId: string;
    }
  | {
      accepted: false;
      reason: HistoryMutationFailureReason;
      currentVersion: number;
      snapshot?: ProjectSnapshot;
      error?: string;
    };

type DbMutationGroup = {
  id: string;
  projectId: string;
  baseVersion: number;
  newVersion: number | null;
  actorType: 'user' | 'agent' | 'system' | 'import_actor';
  actorId?: string | null;
  origin: 'user_ui' | 'agent_run' | 'system' | 'undo' | 'redo';
  title: string;
  status: 'applied' | 'undone';
  undoable: boolean;
  undoneByGroupId?: string | null;
  redoOfGroupId?: string | null;
  createdAt: Date;
};

type DbProjectEvent = {
  groupId?: string | null;
  ordinal?: number | null;
  command: ProjectCommand;
  inverseCommand?: ProjectCommand | null;
};

type HistoryServiceDeps = {
  prisma?: ReturnType<typeof getPrisma> | any;
  commandService?: Pick<CommandService, 'commitCommand'>;
};

function toActorType(value: DbMutationGroup['actorType']): ActorType {
  return value === 'import_actor' ? 'import' : value;
}

async function loadTaskSnapshot(projectId: string, prismaClient: any): Promise<Task[]> {
  const tasks = await prismaClient.task.findMany({
    where: { projectId },
    include: { dependencies: true },
    orderBy: { sortOrder: 'asc' },
  });

  return tasks.map((task: any) => ({
    id: task.id,
    name: task.name,
    startDate: dateToDomain(task.startDate),
    endDate: dateToDomain(task.endDate),
    type: task.type ?? 'task',
    color: task.color ?? undefined,
    parentId: task.parentId ?? undefined,
    progress: task.progress,
    sortOrder: task.sortOrder,
    dependencies: (task.dependencies ?? []).map((dependency: any): TaskDependency => ({
      taskId: dependency.depTaskId,
      type: dependency.type as DependencyType,
      lag: dependency.lag,
    })),
  }));
}

async function loadDependencyRows(projectId: string, prismaClient: any): Promise<ProjectSnapshot['dependencies']> {
  const rows = await prismaClient.dependency.findMany({
    where: { task: { projectId } },
    select: { id: true, taskId: true, depTaskId: true, type: true, lag: true },
  });

  return rows.map((row: any) => ({
    id: row.id,
    taskId: row.taskId,
    depTaskId: row.depTaskId,
    type: row.type as DependencyType,
    lag: row.lag,
  }));
}

async function buildProjectSnapshot(projectId: string, prismaClient: any): Promise<ProjectSnapshot> {
  const [tasks, dependencies] = await Promise.all([
    loadTaskSnapshot(projectId, prismaClient),
    loadDependencyRows(projectId, prismaClient),
  ]);

  return { tasks, dependencies };
}

function normalizeMutationGroup(group: DbMutationGroup): MutationGroupRecord {
  return {
    id: group.id,
    projectId: group.projectId,
    baseVersion: group.baseVersion,
    newVersion: group.newVersion,
    actorType: toActorType(group.actorType),
    actorId: group.actorId ?? undefined,
    origin: group.origin,
    title: group.title,
    status: group.status,
    undoable: group.undoable,
    undoneByGroupId: group.undoneByGroupId ?? undefined,
    redoOfGroupId: group.redoOfGroupId ?? undefined,
    createdAt: group.createdAt.toISOString(),
  };
}

export class HistoryService {
  private _prisma: ReturnType<typeof getPrisma> | any;
  private readonly commandService: Pick<CommandService, 'commitCommand'>;

  constructor(deps: HistoryServiceDeps = {}) {
    this._prisma = deps.prisma;
    this.commandService = deps.commandService ?? commandService;
  }

  private get prisma() {
    if (!this._prisma) {
      this._prisma = getPrisma();
    }

    return this._prisma as any;
  }

  private async getProjectVersion(projectId: string): Promise<number> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { version: true },
    });

    return project?.version ?? -1;
  }

  private async getGroup(groupId: string): Promise<DbMutationGroup | null> {
    return this.prisma.mutationGroup.findUnique({
      where: { id: groupId },
    });
  }

  private async getProjectGroups(projectId: string): Promise<DbMutationGroup[]> {
    return this.prisma.mutationGroup.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async getGroupEvents(groupId: string, order: 'asc' | 'desc'): Promise<DbProjectEvent[]> {
    return this.prisma.projectEvent.findMany({
      where: {
        groupId,
        applied: true,
      },
      orderBy: { ordinal: order },
    });
  }

  private async hasDivergedHistory(projectId: string, targetGroup: DbMutationGroup, undoGroup: DbMutationGroup): Promise<HistoryMutationFailureReason | null> {
    const groups = await this.prisma.mutationGroup.findMany({
      where: { projectId, status: 'applied' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const laterGroups = groups.filter((group: DbMutationGroup) => (group.newVersion ?? -1) > (undoGroup.newVersion ?? -1));

    if (laterGroups.some((group: DbMutationGroup) => group.origin !== 'redo')) {
      return 'history_diverged';
    }

    if (laterGroups.some((group: DbMutationGroup) => group.origin === 'redo' && group.redoOfGroupId === targetGroup.id)) {
      return 'redo_not_available';
    }

    return null;
  }

  private async replayGroup(params: {
    projectId: string;
    targetGroup: DbMutationGroup;
    actorType: ActorType;
    actorId?: string;
    requestContextId?: string;
    replayMode: 'undo' | 'redo';
    events: DbProjectEvent[];
  }): Promise<HistoryMutationResponse> {
    const replayGroupId = randomUUID();
    let baseVersion = await this.getProjectVersion(params.projectId);
    let snapshot: ProjectSnapshot | undefined;
    let version = baseVersion;

    for (const [index, event] of params.events.entries()) {
      const replayCommand = params.replayMode === 'undo' ? event.inverseCommand : event.command;
      if (!replayCommand) {
        return {
          accepted: false,
          reason: 'validation_error',
          currentVersion: baseVersion,
          error: 'Missing replay command',
        };
      }

      const response = await this.commandService.commitCommand(
        {
          projectId: params.projectId,
          clientRequestId: `${params.replayMode}-${replayGroupId}-${index + 1}`,
          baseVersion,
          command: replayCommand,
          history: {
            groupId: replayGroupId,
            origin: params.replayMode,
            title: `${params.replayMode === 'undo' ? 'Undo' : 'Redo'} — ${params.targetGroup.title}`,
            requestContextId: params.requestContextId,
            finalizeGroup: index === params.events.length - 1,
            redoOfGroupId: params.replayMode === 'redo' ? params.targetGroup.id : null,
            targetGroupId: params.targetGroup.id,
          },
        },
        params.actorType,
        params.actorId,
      );

      if (!response.accepted) {
        if (response.reason === 'version_conflict') {
          return {
            accepted: false,
            reason: 'version_conflict',
            currentVersion: response.currentVersion,
            snapshot: response.snapshot,
            error: response.error,
          };
        }

        return {
          accepted: false,
          reason: 'validation_error',
          currentVersion: response.currentVersion,
          snapshot: response.snapshot,
          error: response.error,
        };
      }

      baseVersion = response.newVersion;
      version = response.newVersion;
      snapshot = response.snapshot;
    }

    return {
      accepted: true,
      version,
      snapshot: snapshot ?? await buildProjectSnapshot(params.projectId, this.prisma),
      groupId: replayGroupId,
      targetGroupId: params.targetGroup.id,
    };
  }

  async listHistoryGroups({ projectId, cursor, limit }: ListHistoryGroupsInput): Promise<{ items: HistoryGroupListItem[]; nextCursor?: string }> {
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
    const allGroups = await this.getProjectGroups(projectId);
    const startIndex = cursor ? allGroups.findIndex((group) => group.id === cursor) + 1 : 0;
    const pageGroups = allGroups.slice(Math.max(startIndex, 0), Math.max(startIndex, 0) + safeLimit + 1);
    const selectedGroups = pageGroups.slice(0, safeLimit);
    const selectedGroupIds = selectedGroups.map((group) => group.id);
    const events = selectedGroupIds.length === 0
      ? []
      : await this.prisma.projectEvent.findMany({
          where: {
            projectId,
            groupId: { in: selectedGroupIds },
            applied: true,
          },
        });

    const eventCountByGroupId = new Map<string, number>();
    for (const event of events as DbProjectEvent[]) {
      if (!event.groupId) {
        continue;
      }
      eventCountByGroupId.set(event.groupId, (eventCountByGroupId.get(event.groupId) ?? 0) + 1);
    }

    const groupById = new Map(allGroups.map((group) => [group.id, group]));
    const items = selectedGroups.map((group) => {
      const undoGroup = group.undoneByGroupId ? groupById.get(group.undoneByGroupId) : null;
      const laterAppliedGroups = allGroups.filter((candidate) => (
        candidate.projectId === projectId &&
        candidate.status === 'applied' &&
        (candidate.newVersion ?? -1) > (undoGroup?.newVersion ?? -1)
      ));
      const redoable = group.status === 'undone'
        && Boolean(group.undoneByGroupId)
        && Boolean(undoGroup?.newVersion)
        && laterAppliedGroups.every((candidate) => candidate.origin === 'redo')
        && !laterAppliedGroups.some((candidate) => candidate.origin === 'redo' && candidate.redoOfGroupId === group.id);

      return {
        ...normalizeMutationGroup(group),
        commandCount: eventCountByGroupId.get(group.id) ?? 0,
        undoable: group.status === 'applied' && group.undoable,
        redoable,
        createdAt: group.createdAt.toISOString(),
      };
    });

    return {
      items,
      nextCursor: pageGroups.length > safeLimit ? selectedGroups[selectedGroups.length - 1]?.id : undefined,
    };
  }

  async undoLatestGroup(request: HistoryMutationRequest): Promise<HistoryMutationResponse> {
    const targetGroup = await this.prisma.mutationGroup.findFirst({
      where: {
        projectId: request.projectId,
        status: 'applied',
        undoable: true,
      },
      orderBy: { newVersion: 'desc' },
    });

    if (!targetGroup) {
      return {
        accepted: false,
        reason: 'validation_error',
        currentVersion: await this.getProjectVersion(request.projectId),
        error: 'No undoable group found',
      };
    }

    return this.undoGroup({
      ...request,
      groupId: targetGroup.id,
    });
  }

  async undoGroup(request: UndoGroupRequest): Promise<HistoryMutationResponse> {
    const targetGroup = await this.getGroup(request.groupId);
    if (!targetGroup || targetGroup.projectId !== request.projectId || targetGroup.status !== 'applied' || !targetGroup.undoable) {
      return {
        accepted: false,
        reason: 'validation_error',
        currentVersion: await this.getProjectVersion(request.projectId),
        error: 'Target group is not undoable',
      };
    }

    const events = await this.getGroupEvents(targetGroup.id, 'desc');
    const response = await this.replayGroup({
      projectId: request.projectId,
      targetGroup,
      actorType: request.actorType,
      actorId: request.actorId,
      requestContextId: request.requestContextId,
      replayMode: 'undo',
      events,
    });

    if (!response.accepted) {
      return response;
    }

    await this.prisma.mutationGroup.update({
      where: { id: targetGroup.id },
      data: {
        status: 'undone',
        undoneByGroupId: response.groupId,
      },
    });

    return response;
  }

  async redoGroup(request: UndoGroupRequest): Promise<HistoryMutationResponse> {
    const targetGroup = await this.getGroup(request.groupId);
    if (!targetGroup || targetGroup.projectId !== request.projectId) {
      return {
        accepted: false,
        reason: 'validation_error',
        currentVersion: await this.getProjectVersion(request.projectId),
        error: 'Target group not found',
      };
    }

    if (targetGroup.status !== 'undone' || !targetGroup.undoneByGroupId) {
      return {
        accepted: false,
        reason: 'target_not_undone',
        currentVersion: await this.getProjectVersion(request.projectId),
      };
    }

    const undoGroup = await this.getGroup(targetGroup.undoneByGroupId);
    if (!undoGroup || undoGroup.newVersion === null) {
      return {
        accepted: false,
        reason: 'redo_not_available',
        currentVersion: await this.getProjectVersion(request.projectId),
      };
    }

    const divergenceReason = await this.hasDivergedHistory(request.projectId, targetGroup, undoGroup);
    if (divergenceReason) {
      return {
        accepted: false,
        reason: divergenceReason,
        currentVersion: await this.getProjectVersion(request.projectId),
      };
    }

    const events = await this.getGroupEvents(targetGroup.id, 'asc');
    const response = await this.replayGroup({
      projectId: request.projectId,
      targetGroup,
      actorType: request.actorType,
      actorId: request.actorId,
      requestContextId: request.requestContextId,
      replayMode: 'redo',
      events,
    });

    if (!response.accepted) {
      return response;
    }

    await this.prisma.mutationGroup.update({
      where: { id: targetGroup.id },
      data: {
        status: 'applied',
        undoneByGroupId: null,
      },
    });

    return response;
  }
}

export const historyService = new HistoryService();
