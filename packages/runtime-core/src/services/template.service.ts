import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma.js';
import type {
  ActorType,
  CommitProjectCommandResponse,
  CreateTaskInput,
  CreateTemplateFromProjectInput,
  CreateTemplateFromSelectionInput,
  DeleteTemplateInput,
  DeleteTemplateResponse,
  DependencyType,
  GetTemplateInput,
  HistoryGroupContext,
  InsertTemplateInput,
  ListTemplatesInput,
  ListTemplatesResponse,
  Task,
  TaskDependency,
  TaskType,
  TemplateDependency,
  TemplateMetadata,
  TemplateSnapshot,
  TemplateSourceKind,
  TemplateTask,
  TemplateWorkspaceSnapshot,
  UpdateTemplateMetadataInput,
  UpdateTemplateSnapshotInput,
} from '../types.js';
import { commandService, type CommandService } from './command.service.js';
import { dateToDomain, domainToDate } from './types.js';

type TemplateServiceDeps = {
  prisma?: TemplatePrismaClient;
  commandService?: CommandService;
};

type ProjectTaskRow = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  type: string | null;
  color: string | null;
  parentId: string | null;
  progress: number;
  sortOrder: number;
  dependencies: Array<{
    depTaskId: string;
    type: string;
    lag: number | null;
  }>;
};

type PersistableTemplateTask = {
  localId: string;
  name: string;
  type: TaskType;
  color: string | null;
  parentLocalId: string | null;
  sortOrder: number;
  relativeStartOffset: number;
  durationDays: number;
};

type PersistableTemplateDependency = {
  sourceLocalId: string;
  targetLocalId: string;
  type: DependencyType;
  lag: number;
};

type TemplateModelRecord = {
  id: string;
  ownerUserId: string;
  name: string;
  sourceKind: TemplateSourceKind;
  createdAt: Date;
  updatedAt: Date;
  _count?: { tasks: number };
};

type TemplateTaskRecord = {
  id: string;
  templateId: string;
  localId: string;
  name: string;
  type: string | null;
  color: string | null;
  parentLocalId: string | null;
  sortOrder: number;
  relativeStartOffset: number;
  durationDays: number;
};

type TemplateDependencyRecord = {
  id: string;
  templateId: string;
  sourceLocalId: string;
  targetLocalId: string;
  type: string;
  lag: number | null;
};

type TemplatePrismaClient = {
  task: {
    findMany(args: {
      where: { projectId: string };
      include: { dependencies: true };
      orderBy: { sortOrder: 'asc' };
    }): Promise<ProjectTaskRow[]>;
  };
  project: {
    findUnique(args: {
      where: { id: string };
      select: { version: true };
    }): Promise<{ version: number } | null>;
  };
  template: {
    findMany(args: {
      where: { ownerUserId: string };
      include: { _count: { select: { tasks: true } } };
      orderBy: { updatedAt: 'desc' };
    }): Promise<TemplateModelRecord[]>;
    findFirst(args: {
      where: { id: string; ownerUserId: string };
      include?: {
        tasks?: { orderBy: { sortOrder: 'asc' } };
        dependencies?: true;
        _count?: { select: { tasks: true } };
      };
      select?: { id: true; name: true; sourceKind: true };
    }): Promise<(TemplateModelRecord & {
      tasks: TemplateTaskRecord[];
      dependencies: TemplateDependencyRecord[];
    }) | { id: string; name: string; sourceKind: TemplateSourceKind } | null>;
    updateMany(args: {
      where: { id: string; ownerUserId: string };
      data: { name: string };
    }): Promise<{ count: number }>;
    deleteMany(args: {
      where: { id: string; ownerUserId: string };
    }): Promise<{ count: number }>;
    create(args: {
      data: {
        id: string;
        ownerUserId: string;
        name: string;
        sourceKind: TemplateSourceKind;
      };
    }): Promise<TemplateModelRecord>;
    update(args: {
      where: { id: string };
      data: { name: string };
    }): Promise<TemplateModelRecord>;
  };
  templateTask: {
    deleteMany(args: { where: { templateId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{
        id: string;
        templateId: string;
        localId: string;
        name: string;
        type: TaskType;
        color: string | null;
        parentLocalId: string | null;
        sortOrder: number;
        relativeStartOffset: number;
        durationDays: number;
      }>;
    }): Promise<{ count: number }>;
  };
  templateDependency: {
    deleteMany(args: { where: { templateId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{
        id: string;
        templateId: string;
        sourceLocalId: string;
        targetLocalId: string;
        type: DependencyType;
        lag: number;
      }>;
    }): Promise<{ count: number }>;
  };
  $transaction<T>(fn: (tx: TemplatePrismaClient) => Promise<T>): Promise<T>;
};

export class TemplateValidationError extends Error {
  readonly code = 'validation_error';

  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TemplateValidationError(`${field} is required`);
  }
  return trimmed;
}

function assertTaskIds(ids: string[]): string[] {
  const normalized = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new TemplateValidationError('rootTaskIds must not be empty');
  }
  return normalized;
}

function toTaskType(value: string | null | undefined): TaskType {
  return value === 'milestone' ? 'milestone' : 'task';
}

function toDependencyType(value: string): DependencyType {
  switch (value) {
    case 'FS':
    case 'SS':
    case 'FF':
    case 'SF':
      return value;
    default:
      throw new TemplateValidationError(`Unsupported dependency type "${value}"`);
  }
}

function addDays(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

function diffDays(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function toDurationDays(startDate: Date, endDate: Date): number {
  return Math.max(1, diffDays(endDate, startDate) + 1);
}

function buildChildrenByParent(tasks: Array<{ id: string; parentId: string | null }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) {
      continue;
    }
    const bucket = map.get(task.parentId) ?? [];
    bucket.push(task.id);
    map.set(task.parentId, bucket);
  }
  return map;
}

function collectDescendants(taskId: string, childrenByParent: Map<string, string[]>): string[] {
  const queue = [taskId];
  const result: string[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    result.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  return result;
}

function normalizeRootSelection(tasks: ProjectTaskRow[], requestedRootTaskIds: string[]): string[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const selected = new Set(requestedRootTaskIds);
  const normalized: string[] = [];

  for (const rootId of requestedRootTaskIds) {
    const task = taskMap.get(rootId);
    if (!task) {
      continue;
    }
    let parentId = task.parentId;
    let shadowed = false;
    while (parentId) {
      if (selected.has(parentId)) {
        shadowed = true;
        break;
      }
      parentId = taskMap.get(parentId)?.parentId ?? null;
    }
    if (!shadowed) {
      normalized.push(rootId);
    }
  }

  return normalized;
}

function buildPersistedTemplateSnapshot(tasks: ProjectTaskRow[], sourceKind: TemplateSourceKind): {
  sourceKind: TemplateSourceKind;
  tasks: PersistableTemplateTask[];
  dependencies: PersistableTemplateDependency[];
} {
  if (tasks.length === 0) {
    throw new TemplateValidationError('Template must contain at least one task');
  }

  const earliestStart = tasks.reduce((min, task) => task.startDate.getTime() < min.getTime() ? task.startDate : min, tasks[0]!.startDate);
  const taskIds = new Set(tasks.map((task) => task.id));
  const localIds = new Map<string, string>();

  tasks.forEach((task) => {
    localIds.set(task.id, randomUUID());
  });

  const persistedTasks = tasks.map((task) => ({
    localId: localIds.get(task.id)!,
    name: task.name,
    type: toTaskType(task.type),
    color: task.color,
    parentLocalId: task.parentId && taskIds.has(task.parentId) ? localIds.get(task.parentId)! : null,
    sortOrder: task.sortOrder,
    relativeStartOffset: diffDays(task.startDate, earliestStart),
    durationDays: toDurationDays(task.startDate, task.endDate),
  }));

  const persistedDeps = tasks.flatMap((task) => (
    task.dependencies
      .filter((dependency) => taskIds.has(dependency.depTaskId))
      .map((dependency) => ({
        sourceLocalId: localIds.get(dependency.depTaskId)!,
        targetLocalId: localIds.get(task.id)!,
        type: toDependencyType(dependency.type),
        lag: dependency.lag ?? 0,
      }))
  ));

  return {
    sourceKind,
    tasks: persistedTasks,
    dependencies: persistedDeps,
  };
}

function toTemplateMetadata(record: {
  id: string;
  ownerUserId: string;
  name: string;
  sourceKind: TemplateSourceKind;
  createdAt: Date;
  updatedAt: Date;
  _count?: { tasks: number };
}): TemplateMetadata {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    name: record.name,
    sourceKind: record.sourceKind,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    taskCount: record._count?.tasks ?? 0,
  };
}

function materializeTemplateTasks(tasks: TemplateTask[], anchorDate: Date): Task[] {
  return tasks.map((task) => {
    const start = addDays(anchorDate, task.relativeStartOffset);
    const end = addDays(start, task.durationDays - 1);
    return {
      id: task.id,
      name: task.name,
      startDate: dateToDomain(start),
      endDate: dateToDomain(end),
      type: task.type,
      color: task.color ?? undefined,
      parentId: task.parentId ?? undefined,
      progress: 0,
      sortOrder: task.sortOrder,
    };
  });
}

function buildRelativeTasksFromWorkspace(snapshot: TemplateWorkspaceSnapshot): PersistableTemplateTask[] {
  if (!snapshot.tasks.length) {
    throw new TemplateValidationError('Template snapshot must contain at least one task');
  }

  const parsedTasks = snapshot.tasks.map((task) => ({
    ...task,
    start: domainToDate(task.startDate),
    end: domainToDate(task.endDate),
  }));
  const earliestStart = parsedTasks.reduce((min, task) => task.start.getTime() < min.getTime() ? task.start : min, parsedTasks[0]!.start);
  const taskIds = new Set(parsedTasks.map((task) => task.id));

  for (const task of parsedTasks) {
    if (task.parentId && !taskIds.has(task.parentId)) {
      throw new TemplateValidationError(`Parent task ${task.parentId} is outside template snapshot`);
    }
  }

  return parsedTasks.map((task) => ({
    localId: task.id,
    name: task.name,
    type: task.type ?? 'task',
    color: task.color ?? null,
    parentLocalId: task.parentId ?? null,
    sortOrder: task.sortOrder ?? 0,
    relativeStartOffset: diffDays(task.start, earliestStart),
    durationDays: toDurationDays(task.start, task.end),
  }));
}

function buildRelativeDependenciesFromWorkspace(snapshot: TemplateWorkspaceSnapshot): PersistableTemplateDependency[] {
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  return snapshot.dependencies.map((dependency) => {
    if (!taskIds.has(dependency.taskId) || !taskIds.has(dependency.depTaskId)) {
      throw new TemplateValidationError('Template dependency endpoints must belong to the template snapshot');
    }
    return {
      sourceLocalId: dependency.depTaskId,
      targetLocalId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    };
  });
}

export class TemplateService {
  private readonly prisma: TemplatePrismaClient;
  private readonly commands: CommandService;

  constructor(deps: TemplateServiceDeps = {}) {
    this.prisma = deps.prisma ?? (getPrisma() as unknown as TemplatePrismaClient);
    this.commands = deps.commandService ?? commandService;
  }

  async listTemplates(input: ListTemplatesInput): Promise<ListTemplatesResponse> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const templates = await this.prisma.template.findMany({
      where: { ownerUserId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      templates: templates.map(toTemplateMetadata),
    };
  }

  async getTemplate(input: GetTemplateInput): Promise<TemplateSnapshot> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const templateId = assertNonEmpty(input.templateId, 'templateId');
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, ownerUserId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        dependencies: true,
        _count: { select: { tasks: true } },
      },
    }) as (TemplateModelRecord & {
      tasks: TemplateTaskRecord[];
      dependencies: TemplateDependencyRecord[];
    }) | null;

    if (!template) {
      throw new TemplateValidationError('Template not found');
    }

    return {
      ...toTemplateMetadata(template),
      tasks: template.tasks.map((task) => ({
        id: task.localId,
        name: task.name,
        type: toTaskType(task.type),
        color: task.color,
        parentId: task.parentLocalId,
        sortOrder: task.sortOrder,
        relativeStartOffset: task.relativeStartOffset,
        durationDays: task.durationDays,
      })),
      dependencies: template.dependencies.map((dependency) => ({
        id: dependency.id,
        sourceTaskId: dependency.sourceLocalId,
        targetTaskId: dependency.targetLocalId,
        type: toDependencyType(dependency.type),
        lag: dependency.lag ?? 0,
      })),
    };
  }

  async getTemplateWorkspaceSnapshot(input: GetTemplateInput, anchorDate = new Date()): Promise<{
    metadata: TemplateMetadata;
    snapshot: TemplateWorkspaceSnapshot;
  }> {
    const template = await this.getTemplate(input);
    const today = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()));
    const tasks = materializeTemplateTasks(template.tasks, today);
    const deps = template.dependencies.map((dependency) => ({
      id: dependency.id,
      taskId: dependency.targetTaskId,
      depTaskId: dependency.sourceTaskId,
      type: dependency.type,
      lag: dependency.lag,
    }));

    return {
      metadata: {
        id: template.id,
        ownerUserId: template.ownerUserId,
        name: template.name,
        sourceKind: template.sourceKind,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        taskCount: template.taskCount,
      },
      snapshot: {
        tasks: tasks.map((task) => ({
          ...task,
          dependencies: deps
            .filter((dependency) => dependency.taskId === task.id)
            .map((dependency) => ({
              taskId: dependency.depTaskId,
              type: dependency.type,
              lag: dependency.lag,
            })),
        })),
        dependencies: deps,
      },
    };
  }

  async createFromProject(input: CreateTemplateFromProjectInput): Promise<TemplateSnapshot> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const name = assertNonEmpty(input.name, 'name');
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    });

    const persisted = buildPersistedTemplateSnapshot(tasks as ProjectTaskRow[], 'project');
    return this.persistTemplate(ownerUserId, name, persisted.sourceKind, persisted.tasks, persisted.dependencies);
  }

  async createFromSelection(input: CreateTemplateFromSelectionInput): Promise<TemplateSnapshot> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const name = assertNonEmpty(input.name, 'name');
    const rootTaskIds = assertTaskIds(input.rootTaskIds);
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: { dependencies: true },
      orderBy: { sortOrder: 'asc' },
    });

    const normalizedRoots = normalizeRootSelection(tasks, rootTaskIds);
    const childrenByParent = buildChildrenByParent(tasks.map((task) => ({ id: task.id, parentId: task.parentId ?? null })));
    const includedIds = new Set<string>();
    for (const rootId of normalizedRoots) {
      collectDescendants(rootId, childrenByParent).forEach((taskId) => includedIds.add(taskId));
    }

    const selectedTasks = tasks.filter((task) => includedIds.has(task.id));
    const persisted = buildPersistedTemplateSnapshot(selectedTasks, 'task_selection');
    return this.persistTemplate(ownerUserId, name, persisted.sourceKind, persisted.tasks, persisted.dependencies);
  }

  async updateTemplateMetadata(input: UpdateTemplateMetadataInput): Promise<TemplateMetadata> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const templateId = assertNonEmpty(input.templateId, 'templateId');
    const name = assertNonEmpty(input.name, 'name');

    const updated = await this.prisma.template.updateMany({
      where: { id: templateId, ownerUserId },
      data: { name },
    });

    if (updated.count === 0) {
      throw new TemplateValidationError('Template not found');
    }

    const template = await this.prisma.template.findFirst({
      where: { id: templateId, ownerUserId },
      include: { _count: { select: { tasks: true } } },
    }) as TemplateModelRecord | null;
    if (!template) {
      throw new TemplateValidationError('Template not found');
    }
    return toTemplateMetadata(template);
  }

  async updateTemplateSnapshot(input: UpdateTemplateSnapshotInput): Promise<TemplateSnapshot> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const templateId = assertNonEmpty(input.templateId, 'templateId');
    const relativeTasks = buildRelativeTasksFromWorkspace(input.snapshot);
    const relativeDependencies = buildRelativeDependenciesFromWorkspace(input.snapshot);

    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, ownerUserId },
      select: { id: true, name: true, sourceKind: true },
    }) as { id: string; name: string; sourceKind: TemplateSourceKind } | null;
    if (!existing) {
      throw new TemplateValidationError('Template not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.template.update({
        where: { id: templateId },
        data: { name: input.name ? assertNonEmpty(input.name, 'name') : existing.name },
      });
      await tx.templateTask.deleteMany({ where: { templateId } });
      await tx.templateDependency.deleteMany({ where: { templateId } });
      await tx.templateTask.createMany({
        data: relativeTasks.map((task) => ({
          id: randomUUID(),
          templateId,
          localId: task.localId,
          name: task.name,
          type: task.type,
          color: task.color,
          parentLocalId: task.parentLocalId,
          sortOrder: task.sortOrder,
          relativeStartOffset: task.relativeStartOffset,
          durationDays: task.durationDays,
        })),
      });
      if (relativeDependencies.length > 0) {
        await tx.templateDependency.createMany({
          data: relativeDependencies.map((dependency) => ({
            id: randomUUID(),
            templateId,
            sourceLocalId: dependency.sourceLocalId,
            targetLocalId: dependency.targetLocalId,
            type: dependency.type,
            lag: dependency.lag,
          })),
        });
      }
    });

    return this.getTemplate({ ownerUserId, templateId });
  }

  async deleteTemplate(input: DeleteTemplateInput): Promise<DeleteTemplateResponse> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const templateId = assertNonEmpty(input.templateId, 'templateId');
    const deleted = await this.prisma.template.deleteMany({
      where: { id: templateId, ownerUserId },
    });
    if (deleted.count === 0) {
      throw new TemplateValidationError('Template not found');
    }
    return { id: templateId };
  }

  async insertIntoProject(
    input: InsertTemplateInput,
    actorType: ActorType,
    actorId?: string,
  ): Promise<CommitProjectCommandResponse> {
    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const templateId = assertNonEmpty(input.templateId, 'templateId');
    const anchorTaskId = assertNonEmpty(input.anchorTaskId, 'anchorTaskId');
    const placement = input.placement;
    if (placement !== 'after' && placement !== 'inside') {
      throw new TemplateValidationError('placement must be after or inside');
    }

    const [template, project, projectTasks] = await Promise.all([
      this.getTemplate({ ownerUserId, templateId }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { version: true } }),
      this.prisma.task.findMany({
        where: { projectId },
        include: { dependencies: true },
        orderBy: { sortOrder: 'asc' },
      }) as Promise<ProjectTaskRow[]>,
    ]);

    if (!project) {
      throw new TemplateValidationError('Project not found');
    }

    const anchorTask = projectTasks.find((task) => task.id === anchorTaskId);
    if (!anchorTask) {
      throw new TemplateValidationError('Anchor task not found');
    }

    const rootParentId = placement === 'inside' ? anchorTask.id : (anchorTask.parentId ?? null);
    const taskIdMap = new Map<string, string>();
    template.tasks.forEach((task) => taskIdMap.set(task.id, randomUUID()));
    const sortedTemplateTasks = [...template.tasks].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    const anchorStartDate = anchorTask.startDate;

    const createInputs: CreateTaskInput[] = sortedTemplateTasks.map((task) => {
      const start = addDays(anchorStartDate, task.relativeStartOffset);
      const end = addDays(start, task.durationDays - 1);
      const parentId = task.parentId
        ? taskIdMap.get(task.parentId)!
        : (rootParentId ?? undefined);
      const dependencies: TaskDependency[] = template.dependencies
        .filter((dependency) => dependency.targetTaskId === task.id)
        .map((dependency) => ({
          taskId: taskIdMap.get(dependency.sourceTaskId)!,
          type: dependency.type,
          lag: dependency.lag,
        }));

      return {
        id: taskIdMap.get(task.id)!,
        name: task.name,
        startDate: dateToDomain(start),
        endDate: dateToDomain(end),
        type: task.type,
        color: task.color ?? undefined,
        parentId,
        progress: 0,
        sortOrder: task.sortOrder,
        dependencies,
      };
    });

    const historySeed = {
      groupId: randomUUID(),
      requestContextId: randomUUID(),
    };
    const title = `Пользователь — Вставил шаблон "${template.name}"`;
    const createResponse = await this.commands.commitCommand({
      projectId,
      clientRequestId: randomUUID(),
      baseVersion: project.version,
      command: { type: 'create_tasks_batch', tasks: createInputs },
      includeSnapshot: true,
      history: {
        ...historySeed,
        origin: 'user_ui',
        title,
        finalizeGroup: false,
      },
    }, actorType, actorId);

    if (!createResponse.accepted) {
      return createResponse;
    }

    const currentTasks = (createResponse.snapshot?.tasks ?? []).map((task) => ({
      id: task.id,
      parentId: task.parentId ?? null,
      sortOrder: task.sortOrder ?? 0,
    }));

    const siblingParentId = rootParentId;
    const siblings = currentTasks.filter((task) => (task.parentId ?? null) === siblingParentId);
    const createdRootIds = sortedTemplateTasks
      .filter((task) => !task.parentId)
      .map((task) => taskIdMap.get(task.id)!)
      .filter((taskId) => siblings.some((task) => task.id === taskId));
    const siblingIds = siblings
      .map((task) => task.id)
      .filter((taskId) => !createdRootIds.includes(taskId));
    const anchorIndex = siblingIds.indexOf(anchorTask.id);
    const insertionIndex = placement === 'inside'
      ? siblingIds.length
      : Math.max(0, anchorIndex + 1);
    const orderedSiblingIds = placement === 'inside'
      ? [...siblingIds, ...createdRootIds]
      : [
          ...siblingIds.slice(0, insertionIndex),
          ...createdRootIds,
          ...siblingIds.slice(insertionIndex),
        ];

    const reorderUpdates = orderedSiblingIds.map((taskId, index) => ({
      taskId,
      sortOrder: index,
    }));

    if (reorderUpdates.length === 0) {
      return createResponse;
    }

    return this.commands.commitCommand({
      projectId,
      clientRequestId: randomUUID(),
      baseVersion: createResponse.newVersion,
      command: { type: 'reorder_tasks', updates: reorderUpdates },
      includeSnapshot: true,
      history: {
        ...historySeed,
        origin: 'user_ui',
        title,
        finalizeGroup: true,
      },
    }, actorType, actorId);
  }

  private async persistTemplate(
    ownerUserId: string,
    name: string,
    sourceKind: TemplateSourceKind,
    tasks: PersistableTemplateTask[],
    dependencies: PersistableTemplateDependency[],
  ): Promise<TemplateSnapshot> {
    const templateId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.template.create({
        data: {
          id: templateId,
          ownerUserId,
          name,
          sourceKind,
        },
      });
      await tx.templateTask.createMany({
        data: tasks.map((task) => ({
          id: randomUUID(),
          templateId,
          localId: task.localId,
          name: task.name,
          type: task.type,
          color: task.color,
          parentLocalId: task.parentLocalId,
          sortOrder: task.sortOrder,
          relativeStartOffset: task.relativeStartOffset,
          durationDays: task.durationDays,
        })),
      });
      if (dependencies.length > 0) {
        await tx.templateDependency.createMany({
          data: dependencies.map((dependency) => ({
            id: randomUUID(),
            templateId,
            sourceLocalId: dependency.sourceLocalId,
            targetLocalId: dependency.targetLocalId,
            type: dependency.type,
            lag: dependency.lag,
          })),
        });
      }
    });

    return this.getTemplate({ ownerUserId, templateId });
  }
}

export const templateService = new TemplateService();
