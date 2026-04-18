import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type {
  ActorType,
  CommitProjectCommandResponse,
  DependencyType,
  HistoryGroupSnapshotResponse,
  MutationGroupOrigin,
  ProjectCommand,
  ProjectSnapshot,
  RestoreHistoryGroupResponse,
  Task,
  TaskDependency,
} from '../types.js';
import { applyProjectCommandToSnapshot } from './project-command-apply.js';
import { getProjectScheduleOptionsForProject } from './projectScheduleOptions.js';
import { commandService, type CommandService } from './command.service.js';
import { dateToDomain } from './types.js';

const TECHNICAL_RESTORE_ORIGIN: MutationGroupOrigin = 'undo';

export type HistoryGroupListItem = {
  id: string;
  actorType: ActorType;
  title: string;
  createdAt: string;
  baseVersion: number;
  newVersion: number;
  commandCount: number;
  isCurrent: boolean;
  canRestore: boolean;
};

export type ListHistoryGroupsInput = {
  projectId: string;
  cursor?: string;
  limit?: number;
};

export type GetHistorySnapshotInput = {
  projectId: string;
  groupId: string;
};

export type RestoreHistoryGroupInput = {
  projectId: string;
  groupId: string;
  actorType: ActorType;
  actorId?: string;
  requestContextId?: string;
};

export class HistoryValidationError extends Error {
  readonly code = 'validation_error';

  constructor(message: string) {
    super(message);
    this.name = 'HistoryValidationError';
  }
}

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
  getScheduleOptions?: (projectId: string, prismaClient: any) => Promise<{ businessDays?: boolean; weekendPredicate?: (date: Date) => boolean }>;
};

type RollbackTailPlan = {
  targetGroup: DbMutationGroup;
  currentVersion: number;
  isCurrent: boolean;
  inverseCommands: ProjectCommand[];
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

export class HistoryService {
  private _prisma: ReturnType<typeof getPrisma> | any;
  private readonly commandService: Pick<CommandService, 'commitCommand'>;
  private readonly getScheduleOptions: NonNullable<HistoryServiceDeps['getScheduleOptions']>;

  constructor(deps: HistoryServiceDeps = {}) {
    this._prisma = deps.prisma;
    this.commandService = deps.commandService ?? commandService;
    this.getScheduleOptions = deps.getScheduleOptions ?? getProjectScheduleOptionsForProject;
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

  private async getVisibleGroups(projectId: string): Promise<DbMutationGroup[]> {
    const groups = await this.prisma.mutationGroup.findMany({
      where: {
        projectId,
        status: 'applied',
      },
      orderBy: [{ newVersion: 'desc' }, { createdAt: 'desc' }],
    });

    return (groups as DbMutationGroup[]).filter(
      (group) => group.newVersion !== null && group.origin !== 'undo' && group.origin !== 'redo',
    );
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

  private async resolveRollbackTail(projectId: string, groupId: string): Promise<RollbackTailPlan> {
    const visibleGroups = await this.getVisibleGroups(projectId);
    const targetGroup = visibleGroups.find((group) => group.id === groupId);

    if (!targetGroup || targetGroup.newVersion === null) {
      throw new HistoryValidationError(`Visible history group ${groupId} was not found`);
    }

    const currentVersion = await this.getProjectVersion(projectId);
    const activeTailGroups = visibleGroups.filter((group) => (group.newVersion ?? -1) > targetGroup.newVersion!);
    const inverseCommands: ProjectCommand[] = [];

    for (const group of activeTailGroups) {
      const events = await this.getGroupEvents(group.id, 'desc');
      for (const event of events) {
        if (!event.inverseCommand) {
          throw new HistoryValidationError(
            `Active tail event in group ${group.id} is missing inverseCommand and cannot be replayed`,
          );
        }
        inverseCommands.push(event.inverseCommand);
      }
    }

    return {
      targetGroup,
      currentVersion,
      isCurrent: activeTailGroups.length === 0,
      inverseCommands,
    };
  }

  async listHistoryGroups({ projectId, cursor, limit }: ListHistoryGroupsInput): Promise<{ items: HistoryGroupListItem[]; nextCursor?: string }> {
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
    const allGroups = await this.getVisibleGroups(projectId);
    const currentGroupId = allGroups[0]?.id;
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

    const commandCountByGroupId = new Map<string, number>();
    for (const event of events as DbProjectEvent[]) {
      if (!event.groupId) {
        continue;
      }
      commandCountByGroupId.set(event.groupId, (commandCountByGroupId.get(event.groupId) ?? 0) + 1);
    }

    return {
      items: selectedGroups.map((group) => ({
        id: group.id,
        actorType: toActorType(group.actorType),
        title: group.title,
        createdAt: group.createdAt.toISOString(),
        baseVersion: group.baseVersion,
        newVersion: group.newVersion!,
        commandCount: commandCountByGroupId.get(group.id) ?? 0,
        isCurrent: group.id === currentGroupId,
        canRestore: group.id !== currentGroupId,
      })),
      nextCursor: pageGroups.length > safeLimit ? selectedGroups[selectedGroups.length - 1]?.id : undefined,
    };
  }

  async getHistorySnapshot({ projectId, groupId }: GetHistorySnapshotInput): Promise<HistoryGroupSnapshotResponse> {
    const plan = await this.resolveRollbackTail(projectId, groupId);
    const currentSnapshot = await buildProjectSnapshot(projectId, this.prisma);

    if (plan.isCurrent) {
      return {
        groupId: plan.targetGroup.id,
        isCurrent: true,
        currentVersion: plan.currentVersion,
        snapshot: currentSnapshot,
      };
    }

    const scheduleOptions = await this.getScheduleOptions(projectId, this.prisma);
    const snapshot = plan.inverseCommands.reduce(
      (workingSnapshot, command) => applyProjectCommandToSnapshot(workingSnapshot, command, scheduleOptions).snapshot,
      currentSnapshot,
    );

    return {
      groupId: plan.targetGroup.id,
      isCurrent: false,
      currentVersion: plan.currentVersion,
      snapshot,
    };
  }

  async restoreToGroup(request: RestoreHistoryGroupInput): Promise<RestoreHistoryGroupResponse> {
    const plan = await this.resolveRollbackTail(request.projectId, request.groupId);
    if (plan.isCurrent) {
      return {
        groupId: plan.targetGroup.id,
        targetGroupId: plan.targetGroup.id,
        version: plan.currentVersion,
        snapshot: await buildProjectSnapshot(request.projectId, this.prisma),
      };
    }

    const rollbackGroupId = randomUUID();
    let baseVersion = plan.currentVersion;
    let snapshot = await buildProjectSnapshot(request.projectId, this.prisma);
    let version = baseVersion;

    for (const [index, inverseCommand] of plan.inverseCommands.entries()) {
      const response = await this.commandService.commitCommand(
        {
          projectId: request.projectId,
          clientRequestId: `restore-${rollbackGroupId}-${index + 1}`,
          baseVersion,
          command: inverseCommand,
          history: {
            groupId: rollbackGroupId,
            origin: TECHNICAL_RESTORE_ORIGIN,
            title: `Restore to ${plan.targetGroup.title}`,
            requestContextId: request.requestContextId,
            finalizeGroup: index === plan.inverseCommands.length - 1,
            targetGroupId: plan.targetGroup.id,
          },
        },
        request.actorType,
        request.actorId,
      );

      if (!response.accepted) {
        throw this.mapCommitFailure(response);
      }

      baseVersion = response.newVersion;
      version = response.newVersion;
      snapshot = response.snapshot;
    }

    return {
      groupId: rollbackGroupId,
      targetGroupId: plan.targetGroup.id,
      version,
      snapshot,
    };
  }

  private mapCommitFailure(response: Extract<CommitProjectCommandResponse, { accepted: false }>): Error {
    if (response.reason === 'validation_error') {
      return new HistoryValidationError(response.error ?? 'History restore failed validation');
    }

    return new Error(response.error ?? `History restore failed: ${response.reason}`);
  }
}

export const historyService = new HistoryService();
