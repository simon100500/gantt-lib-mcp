import { randomUUID } from 'node:crypto';
import { Prisma, getPrisma } from '../prisma.js';
import type {
  ActorType,
  CommitProjectCommandResponse,
  CreateProjectFromTemplatePublicationInput,
  CreateTaskInput,
  CreateTemplatePublicationFromProjectInput,
  CreateTemplatePublicationFromSelectionInput,
  DependencyType,
  EffectiveCalendarDay,
  GetTemplatePublicationBySlugInput,
  GetTemplatePublicationInput,
  GanttDayMode,
  InsertTemplatePublicationInput,
  ListTemplatePublicationsInput,
  ListTemplatePublicationsResponse,
  Task,
  TaskDependency,
  TaskType,
  TemplatePublicationDetail,
  TemplatePublicationItem,
  TemplatePublicationKind,
  TemplatePublicationSnapshot,
  TemplatePublicationStatus,
  TemplatePublicationVerificationStatus,
  TemplatePublicationVisibility,
  TemplateSourceKind,
  TimelineMarker,
  UpdateTemplatePublicationInput,
  RepublishTemplatePublicationInput,
} from '../types.js';
import { commandService, type CommandService } from './command.service.js';
import { projectService, type ProjectService } from './project.service.js';
import { dateToDomain, domainToDate } from './types.js';
import { getProjectCalendarSettings } from './projectScheduleOptions.js';

type TemplatePublicationServiceDeps = {
  prisma?: TemplatePublicationPrismaClient;
  commandService?: CommandService;
  projectService?: ProjectService;
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
    id: string;
    depTaskId: string;
    type: string;
    lag: number | null;
  }>;
};

type ProjectRecord = {
  id: string;
  name: string;
  version: number;
  timelineMarkers: unknown;
};

type TemplatePublicationRecord = {
  id: string;
  slug: string;
  kind: TemplatePublicationKind;
  sourceProjectId: string;
  sourceUserId: string;
  sourceTemplateId: string | null;
  sourceKind: TemplateSourceKind;
  sourceSelectionTaskIds: string[];
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string | null;
  industry: string | null;
  tags: string[];
  status: TemplatePublicationStatus;
  visibility: TemplatePublicationVisibility;
  verificationStatus: TemplatePublicationVerificationStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  seoBody: string | null;
  coverImageUrl: string | null;
  previewImageUrl: string | null;
  snapshot: unknown;
  taskCount: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TemplatePublicationPrismaClient = {
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
      select: { id?: true; name?: true; version?: true; timelineMarkers?: true; groupId?: true };
    }): Promise<ProjectRecord | { id: string; groupId: string } | null>;
    update(args: {
      where: { id: string };
      data: Prisma.ProjectUncheckedUpdateInput;
    }): Promise<unknown>;
  };
  templatePublication: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
    }): Promise<TemplatePublicationRecord[]>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
    }): Promise<TemplatePublicationRecord | null>;
    create(args: {
      data: Record<string, unknown>;
    }): Promise<TemplatePublicationRecord>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<TemplatePublicationRecord>;
  };
  workCalendar: {
    findMany(args: {
      where: { projectId: string };
      select: { id: true } ;
      orderBy: { createdAt: 'asc' };
    }): Promise<Array<{ id: string }>>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<unknown>;
  };
  calendarDay: {
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
    deleteMany(args: { where: { calendarId: string } | { calendarId: { in: string[] } } }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: TemplatePublicationPrismaClient) => Promise<T>): Promise<T>;
};

export class TemplatePublicationValidationError extends Error {
  readonly code = 'validation_error';

  constructor(message: string) {
    super(message);
    this.name = 'TemplatePublicationValidationError';
  }
}

function assertNonEmpty(value: string | undefined | null, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new TemplatePublicationValidationError(`${field} is required`);
  }
  return trimmed;
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function addDays(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

function diffDays(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
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
      throw new TemplatePublicationValidationError(`Unsupported dependency type "${value}"`);
  }
}

function normalizeRootTaskIds(ids: string[]): string[] {
  const normalized = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new TemplatePublicationValidationError('rootTaskIds must not be empty');
  }
  return normalized;
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

function normalizeTimelineMarkers(value: unknown): TimelineMarker[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const marker = entry as Partial<TimelineMarker>;
    const date = typeof marker.date === 'string' ? marker.date.trim().slice(0, 10) : '';
    if (!date) {
      return [];
    }
    const normalized: TimelineMarker = { date };
    if (typeof marker.color === 'string' && marker.color.trim()) {
      normalized.color = marker.color.trim();
    }
    if (typeof marker.name === 'string' && marker.name.trim()) {
      normalized.name = marker.name.trim();
    }
    return [normalized];
  });
}

function buildPublicationSnapshot(
  tasks: ProjectTaskRow[],
  ganttDayMode: GanttDayMode,
  calendarDays: EffectiveCalendarDay[],
  timelineMarkers: TimelineMarker[],
): TemplatePublicationSnapshot {
  if (tasks.length === 0) {
    throw new TemplatePublicationValidationError('Publication must contain at least one task');
  }

  const taskIds = new Set(tasks.map((task) => task.id));
  const dependencies = tasks.flatMap((task) => (
    task.dependencies
      .filter((dependency) => taskIds.has(dependency.depTaskId))
      .map((dependency) => ({
        id: dependency.id,
        taskId: task.id,
        depTaskId: dependency.depTaskId,
        type: toDependencyType(dependency.type),
        lag: dependency.lag ?? 0,
      }))
  ));

  const dependenciesByTask = new Map<string, TaskDependency[]>();
  for (const dependency of dependencies) {
    const bucket = dependenciesByTask.get(dependency.taskId) ?? [];
    bucket.push({
      taskId: dependency.depTaskId,
      type: dependency.type,
      lag: dependency.lag,
    });
    dependenciesByTask.set(dependency.taskId, bucket);
  }

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      startDate: dateToDomain(task.startDate),
      endDate: dateToDomain(task.endDate),
      type: toTaskType(task.type),
      color: task.color ?? undefined,
      parentId: task.parentId ?? undefined,
      progress: task.progress,
      sortOrder: task.sortOrder,
      dependencies: dependenciesByTask.get(task.id) ?? [],
    })),
    dependencies,
    ganttDayMode,
    calendarDays,
    timelineMarkers,
  };
}

function parseSnapshot(value: unknown): TemplatePublicationSnapshot {
  if (!value || typeof value !== 'object') {
    throw new TemplatePublicationValidationError('Publication snapshot is invalid');
  }

  const snapshot = value as TemplatePublicationSnapshot;
  if (!Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.dependencies) || !Array.isArray(snapshot.calendarDays) || !Array.isArray(snapshot.timelineMarkers)) {
    throw new TemplatePublicationValidationError('Publication snapshot is invalid');
  }

  return snapshot;
}

function toPublicationItem(record: TemplatePublicationRecord): TemplatePublicationItem {
  return {
    id: record.id,
    slug: record.slug,
    kind: record.kind,
    sourceProjectId: record.sourceProjectId,
    sourceUserId: record.sourceUserId,
    sourceTemplateId: record.sourceTemplateId,
    sourceKind: record.sourceKind,
    sourceSelectionTaskIds: record.sourceSelectionTaskIds,
    title: record.title,
    subtitle: record.subtitle,
    summary: record.summary,
    category: record.category,
    industry: record.industry,
    tags: record.tags,
    status: record.status,
    visibility: record.visibility,
    verificationStatus: record.verificationStatus,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    seoBody: record.seoBody,
    coverImageUrl: record.coverImageUrl,
    previewImageUrl: record.previewImageUrl,
    taskCount: record.taskCount,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

type SnapshotBuildResult = {
  sourceKind: TemplateSourceKind;
  sourceSelectionTaskIds: string[];
  snapshot: TemplatePublicationSnapshot;
  taskCount: number;
};

export class TemplatePublicationService {
  private readonly prisma: TemplatePublicationPrismaClient;
  private readonly commands: CommandService;
  private readonly projects: ProjectService;

  constructor(deps: TemplatePublicationServiceDeps = {}) {
    this.prisma = deps.prisma ?? (getPrisma() as unknown as TemplatePublicationPrismaClient);
    this.commands = deps.commandService ?? commandService;
    this.projects = deps.projectService ?? projectService;
  }

  async listPublications(input: ListTemplatePublicationsInput = {}): Promise<ListTemplatePublicationsResponse> {
    const where: Record<string, unknown> = {};

    if (input.kind) {
      where.kind = input.kind;
    }
    if (input.status) {
      where.status = input.status;
    }
    if (input.visibility) {
      where.visibility = input.visibility;
    }
    if (input.verificationStatus) {
      where.verificationStatus = input.verificationStatus;
    }
    if (input.category?.trim()) {
      where.category = input.category.trim();
    }
    if (input.industry?.trim()) {
      where.industry = input.industry.trim();
    }
    if (input.sourceUserId?.trim()) {
      where.sourceUserId = input.sourceUserId.trim();
    }
    if (input.tag?.trim()) {
      where.tags = { has: input.tag.trim() };
    }
    if (input.query?.trim()) {
      const query = input.query.trim();
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { subtitle: { contains: query, mode: 'insensitive' } },
        { summary: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { industry: { contains: query, mode: 'insensitive' } },
        { tags: { has: query } },
      ];
    }

    if (!input.includeNonPublic) {
      where.status = 'published';
      if (input.visibilityTarget === 'site') {
        where.visibility = { in: ['site', 'both'] };
        where.verificationStatus = { in: ['verified', 'editorial'] };
      } else if (input.visibilityTarget === 'marketplace') {
        where.visibility = { in: ['marketplace', 'both'] };
      }
    }

    const publications = await this.prisma.templatePublication.findMany({
      where,
      orderBy: [
        { verificationStatus: 'desc' },
        { publishedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    return {
      publications: publications.map(toPublicationItem),
    };
  }

  async getPublication(input: GetTemplatePublicationInput): Promise<TemplatePublicationDetail> {
    const publicationId = assertNonEmpty(input.publicationId, 'publicationId');
    const publication = await this.prisma.templatePublication.findFirst({
      where: { id: publicationId },
    });
    if (!publication) {
      throw new TemplatePublicationValidationError('Publication not found');
    }
    return {
      ...toPublicationItem(publication),
      snapshot: parseSnapshot(publication.snapshot),
    };
  }

  async getPublicationBySlug(input: GetTemplatePublicationBySlugInput): Promise<TemplatePublicationDetail> {
    const slug = assertNonEmpty(input.slug, 'slug');
    const where: Record<string, unknown> = {
      slug,
      status: 'published',
    };

    if (input.visibilityTarget === 'site') {
      where.visibility = { in: ['site', 'both'] };
      where.verificationStatus = { in: ['verified', 'editorial'] };
    } else if (input.visibilityTarget === 'marketplace') {
      where.visibility = { in: ['marketplace', 'both'] };
    }

    const publication = await this.prisma.templatePublication.findFirst({ where });
    if (!publication) {
      throw new TemplatePublicationValidationError('Publication not found');
    }

    return {
      ...toPublicationItem(publication),
      snapshot: parseSnapshot(publication.snapshot),
    };
  }

  async createFromProject(input: CreateTemplatePublicationFromProjectInput): Promise<TemplatePublicationDetail> {
    const sourceUserId = assertNonEmpty(input.sourceUserId, 'sourceUserId');
    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const title = assertNonEmpty(input.title, 'title');
    const slug = await this.resolveUniqueSlug(input.slug ?? title);
    const built = await this.buildSnapshotFromProject(projectId);

    const created = await this.prisma.templatePublication.create({
      data: this.toCreateData(input, {
        slug,
        title,
        sourceUserId,
        projectId,
        built,
      }),
    });

    return {
      ...toPublicationItem(created),
      snapshot: parseSnapshot(created.snapshot),
    };
  }

  async createFromSelection(input: CreateTemplatePublicationFromSelectionInput): Promise<TemplatePublicationDetail> {
    const sourceUserId = assertNonEmpty(input.sourceUserId, 'sourceUserId');
    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const title = assertNonEmpty(input.title, 'title');
    const rootTaskIds = normalizeRootTaskIds(input.rootTaskIds);
    const slug = await this.resolveUniqueSlug(input.slug ?? title);
    const built = await this.buildSnapshotFromSelection(projectId, rootTaskIds);

    const created = await this.prisma.templatePublication.create({
      data: this.toCreateData(input, {
        slug,
        title,
        sourceUserId,
        projectId,
        built,
      }),
    });

    return {
      ...toPublicationItem(created),
      snapshot: parseSnapshot(created.snapshot),
    };
  }

  async updatePublication(input: UpdateTemplatePublicationInput): Promise<TemplatePublicationDetail> {
    const publicationId = assertNonEmpty(input.publicationId, 'publicationId');
    const existing = await this.prisma.templatePublication.findFirst({ where: { id: publicationId } });
    if (!existing) {
      throw new TemplatePublicationValidationError('Publication not found');
    }

    const nextStatus = input.status ?? existing.status;
    const slug = input.slug !== undefined
      ? await this.resolveUniqueSlug(input.slug, publicationId)
      : existing.slug;

    const updated = await this.prisma.templatePublication.update({
      where: { id: publicationId },
      data: {
        slug,
        ...(input.title !== undefined ? { title: assertNonEmpty(input.title, 'title') } : {}),
        ...(input.subtitle !== undefined ? { subtitle: normalizeOptionalText(input.subtitle) } : {}),
        ...(input.summary !== undefined ? { summary: normalizeOptionalText(input.summary) } : {}),
        ...(input.category !== undefined ? { category: normalizeOptionalText(input.category) } : {}),
        ...(input.industry !== undefined ? { industry: normalizeOptionalText(input.industry) } : {}),
        ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.verificationStatus !== undefined ? { verificationStatus: input.verificationStatus } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: normalizeOptionalText(input.seoTitle) } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: normalizeOptionalText(input.seoDescription) } : {}),
        ...(input.seoBody !== undefined ? { seoBody: normalizeOptionalText(input.seoBody) } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: normalizeOptionalText(input.coverImageUrl) } : {}),
        ...(input.previewImageUrl !== undefined ? { previewImageUrl: normalizeOptionalText(input.previewImageUrl) } : {}),
        publishedAt: nextStatus === 'published'
          ? (existing.publishedAt ?? new Date())
          : (nextStatus === 'draft' ? null : existing.publishedAt),
        archivedAt: nextStatus === 'archived' ? new Date() : (input.status !== undefined ? null : existing.archivedAt),
      },
    });

    return {
      ...toPublicationItem(updated),
      snapshot: parseSnapshot(updated.snapshot),
    };
  }

  async republish(input: RepublishTemplatePublicationInput): Promise<TemplatePublicationDetail> {
    const publicationId = assertNonEmpty(input.publicationId, 'publicationId');
    const existing = await this.prisma.templatePublication.findFirst({ where: { id: publicationId } });
    if (!existing) {
      throw new TemplatePublicationValidationError('Publication not found');
    }

    const built = existing.sourceKind === 'project'
      ? await this.buildSnapshotFromProject(existing.sourceProjectId)
      : await this.buildSnapshotFromSelection(existing.sourceProjectId, existing.sourceSelectionTaskIds);

    const updated = await this.prisma.templatePublication.update({
      where: { id: publicationId },
      data: {
        snapshot: built.snapshot as unknown as Prisma.InputJsonValue,
        sourceSelectionTaskIds: built.sourceSelectionTaskIds,
        taskCount: built.taskCount,
        publishedAt: existing.status === 'published' ? new Date() : existing.publishedAt,
      },
    });

    return {
      ...toPublicationItem(updated),
      snapshot: parseSnapshot(updated.snapshot),
    };
  }

  async createProjectFromPublication(input: CreateProjectFromTemplatePublicationInput): Promise<{ projectId: string; projectName: string; response: CommitProjectCommandResponse }> {
    const publication = await this.getPublication({ publicationId: input.publicationId });
    if (publication.kind !== 'template') {
      throw new TemplatePublicationValidationError('Only template publications can create new projects');
    }

    const ownerUserId = assertNonEmpty(input.ownerUserId, 'ownerUserId');
    const projectName = normalizeOptionalText(input.projectName) ?? publication.title;
    const createdProject = await this.projects.create(ownerUserId, projectName, input.groupId);
    await this.applyPublicationProjectSettings(createdProject.id, createdProject.name, publication.snapshot);
    const response = await this.materializePublicationIntoProject(
      createdProject.id,
      publication.snapshot,
      'template',
      'user',
      ownerUserId,
    );

    return {
      projectId: createdProject.id,
      projectName: createdProject.name,
      response,
    };
  }

  async insertIntoProject(
    input: InsertTemplatePublicationInput,
    actorType: ActorType,
    actorId?: string,
  ): Promise<CommitProjectCommandResponse> {
    const publication = await this.getPublication({ publicationId: input.publicationId });
    if (publication.kind !== 'block') {
      throw new TemplatePublicationValidationError('Only block publications can be inserted into an existing project');
    }

    const projectId = assertNonEmpty(input.projectId, 'projectId');
    const anchorTaskId = assertNonEmpty(input.anchorTaskId, 'anchorTaskId');
    const placement = input.placement;
    if (placement !== 'after' && placement !== 'inside') {
      throw new TemplatePublicationValidationError('placement must be after or inside');
    }

    const [project, projectTasks] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, version: true, timelineMarkers: true } }) as Promise<ProjectRecord | null>,
      this.prisma.task.findMany({
        where: { projectId },
        include: { dependencies: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    if (!project) {
      throw new TemplatePublicationValidationError('Project not found');
    }

    const anchorTask = projectTasks.find((task) => task.id === anchorTaskId);
    if (!anchorTask) {
      throw new TemplatePublicationValidationError('Anchor task not found');
    }

    const rootParentId = placement === 'inside' ? anchorTask.id : (anchorTask.parentId ?? null);
    const taskIdMap = new Map<string, string>();
    publication.snapshot.tasks.forEach((task) => taskIdMap.set(task.id, randomUUID()));
    const sortedTasks = [...publication.snapshot.tasks].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id));
    const earliestStart = sortedTasks.reduce((min, task) => {
      const next = domainToDate(task.startDate);
      return next.getTime() < min.getTime() ? next : min;
    }, domainToDate(sortedTasks[0]!.startDate));
    const anchorStartDate = anchorTask.startDate;

    const createInputs: CreateTaskInput[] = sortedTasks.map((task) => {
      const relativeStartOffset = diffDays(domainToDate(task.startDate), earliestStart);
      const durationDays = task.type === 'milestone'
        ? 0
        : Math.max(1, diffDays(domainToDate(task.endDate), domainToDate(task.startDate)) + 1);
      const start = addDays(anchorStartDate, relativeStartOffset);
      const end = task.type === 'milestone' ? start : addDays(start, durationDays - 1);
      const parentId = task.parentId
        ? taskIdMap.get(task.parentId)!
        : (rootParentId ?? undefined);
      const dependencies: TaskDependency[] = publication.snapshot.dependencies
        .filter((dependency) => dependency.taskId === task.id)
        .map((dependency) => ({
          taskId: taskIdMap.get(dependency.depTaskId)!,
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
        progress: task.progress ?? 0,
        sortOrder: task.sortOrder,
        dependencies,
      };
    });

    const historySeed = {
      groupId: randomUUID(),
      requestContextId: randomUUID(),
    };
    const title = `Пользователь — Вставил publication "${publication.title}"`;
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

    const siblings = currentTasks.filter((task) => (task.parentId ?? null) === rootParentId);
    const createdRootIds = sortedTasks
      .filter((task) => !task.parentId)
      .map((task) => taskIdMap.get(task.id)!)
      .filter((taskId) => siblings.some((task) => task.id === taskId));
    const siblingIds = siblings
      .map((task) => task.id)
      .filter((taskId) => !createdRootIds.includes(taskId));
    const anchorIndex = siblingIds.indexOf(anchorTask.id);
    const insertionIndex = placement === 'inside' ? siblingIds.length : Math.max(0, anchorIndex + 1);
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

  private toCreateData(
    input: CreateTemplatePublicationFromProjectInput,
    context: {
      slug: string;
      title: string;
      sourceUserId: string;
      projectId: string;
      built: SnapshotBuildResult;
    },
  ): Record<string, unknown> {
    const status = input.status ?? 'published';
    return {
      id: randomUUID(),
      slug: context.slug,
      kind: input.kind,
      sourceProjectId: context.projectId,
      sourceUserId: context.sourceUserId,
      sourceTemplateId: input.sourceTemplateId ?? null,
      sourceKind: context.built.sourceKind,
      sourceSelectionTaskIds: context.built.sourceSelectionTaskIds,
      title: context.title,
      subtitle: normalizeOptionalText(input.subtitle),
      summary: normalizeOptionalText(input.summary),
      category: normalizeOptionalText(input.category),
      industry: normalizeOptionalText(input.industry),
      tags: normalizeTags(input.tags),
      status,
      visibility: input.visibility ?? 'marketplace',
      verificationStatus: input.verificationStatus ?? 'unverified',
      seoTitle: normalizeOptionalText(input.seoTitle),
      seoDescription: normalizeOptionalText(input.seoDescription),
      seoBody: normalizeOptionalText(input.seoBody),
      coverImageUrl: normalizeOptionalText(input.coverImageUrl),
      previewImageUrl: normalizeOptionalText(input.previewImageUrl),
      snapshot: context.built.snapshot as unknown as Prisma.InputJsonValue,
      taskCount: context.built.taskCount,
      publishedAt: status === 'published' ? new Date() : null,
      archivedAt: status === 'archived' ? new Date() : null,
    };
  }

  private async buildSnapshotFromProject(projectId: string): Promise<SnapshotBuildResult> {
    const [project, tasks, projectCalendar] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, version: true, timelineMarkers: true },
      }) as Promise<ProjectRecord | null>,
      this.prisma.task.findMany({
        where: { projectId },
        include: { dependencies: true },
        orderBy: { sortOrder: 'asc' },
      }),
      getProjectCalendarSettings(this.prisma, projectId),
    ]);

    if (!project) {
      throw new TemplatePublicationValidationError('Project not found');
    }

    return {
      sourceKind: 'project',
      sourceSelectionTaskIds: [],
      snapshot: buildPublicationSnapshot(
        tasks,
        projectCalendar.ganttDayMode,
        projectCalendar.calendarDays,
        normalizeTimelineMarkers(project.timelineMarkers),
      ),
      taskCount: tasks.length,
    };
  }

  private async buildSnapshotFromSelection(projectId: string, rootTaskIds: string[]): Promise<SnapshotBuildResult> {
    const [project, tasks, projectCalendar] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, version: true, timelineMarkers: true },
      }) as Promise<ProjectRecord | null>,
      this.prisma.task.findMany({
        where: { projectId },
        include: { dependencies: true },
        orderBy: { sortOrder: 'asc' },
      }),
      getProjectCalendarSettings(this.prisma, projectId),
    ]);

    if (!project) {
      throw new TemplatePublicationValidationError('Project not found');
    }

    const normalizedRoots = normalizeRootSelection(tasks, rootTaskIds);
    const childrenByParent = buildChildrenByParent(tasks.map((task) => ({ id: task.id, parentId: task.parentId ?? null })));
    const includedIds = new Set<string>();
    for (const rootId of normalizedRoots) {
      collectDescendants(rootId, childrenByParent).forEach((taskId) => includedIds.add(taskId));
    }

    const selectedTasks = tasks.filter((task) => includedIds.has(task.id));
    return {
      sourceKind: 'task_selection',
      sourceSelectionTaskIds: normalizedRoots,
      snapshot: buildPublicationSnapshot(
        selectedTasks,
        projectCalendar.ganttDayMode,
        projectCalendar.calendarDays,
        normalizeTimelineMarkers(project.timelineMarkers),
      ),
      taskCount: selectedTasks.length,
    };
  }

  private async resolveUniqueSlug(rawSlug: string, excludeId?: string): Promise<string> {
    const base = slugify(assertNonEmpty(rawSlug, 'slug')) || 'publication';
    let candidate = base;
    let counter = 2;
    while (true) {
      const existing = await this.prisma.templatePublication.findFirst({
        where: excludeId
          ? { slug: candidate, NOT: { id: excludeId } }
          : { slug: candidate },
      });
      if (!existing) {
        return candidate;
      }
      candidate = `${base}-${counter}`;
      counter += 1;
    }
  }

  private async applyPublicationProjectSettings(projectId: string, projectName: string, snapshot: TemplatePublicationSnapshot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const calendarId = await this.replaceProjectCalendar(tx, projectId, projectName, snapshot.calendarDays);
      await tx.project.update({
        where: { id: projectId },
        data: {
          ganttDayMode: snapshot.ganttDayMode,
          calendarId,
          timelineMarkers: snapshot.timelineMarkers as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async replaceProjectCalendar(
    tx: TemplatePublicationPrismaClient,
    projectId: string,
    projectName: string,
    calendarDays: EffectiveCalendarDay[],
  ): Promise<string | null> {
    const ownedCalendars = await tx.workCalendar.findMany({
      where: { projectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (calendarDays.length === 0) {
      if (ownedCalendars.length > 0) {
        const ownedCalendarIds = ownedCalendars.map((calendar) => calendar.id);
        await tx.calendarDay.deleteMany({ where: { calendarId: { in: ownedCalendarIds } } });
        await tx.workCalendar.deleteMany({ where: { id: { in: ownedCalendarIds } } });
      }
      return null;
    }

    const calendarId = ownedCalendars[0]?.id ?? randomUUID();
    if (ownedCalendars[0]) {
      await tx.workCalendar.update({
        where: { id: calendarId },
        data: {
          name: `${projectName} publication calendar`,
          scope: 'project',
          timezone: 'UTC',
          isDefault: false,
        },
      });
      await tx.calendarDay.deleteMany({ where: { calendarId } });
    } else {
      await tx.workCalendar.create({
        data: {
          id: calendarId,
          name: `${projectName} publication calendar`,
          scope: 'project',
          timezone: 'UTC',
          isDefault: false,
          projectId,
        },
      });
    }

    await tx.calendarDay.createMany({
      data: calendarDays.map((day) => ({
        id: randomUUID(),
        calendarId,
        date: new Date(`${day.date}T00:00:00.000Z`),
        kind: day.kind,
        source: 'import',
      })),
    });

    if (ownedCalendars.length > 1) {
      const staleIds = ownedCalendars.slice(1).map((calendar) => calendar.id);
      await tx.calendarDay.deleteMany({ where: { calendarId: { in: staleIds } } });
      await tx.workCalendar.deleteMany({ where: { id: { in: staleIds } } });
    }

    return calendarId;
  }

  private async materializePublicationIntoProject(
    projectId: string,
    snapshot: TemplatePublicationSnapshot,
    mode: 'template' | 'block',
    actorType: ActorType,
    actorId?: string,
  ): Promise<CommitProjectCommandResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, version: true, timelineMarkers: true },
    }) as ProjectRecord | null;
    if (!project) {
      throw new TemplatePublicationValidationError('Project not found');
    }

    const taskIdMap = new Map<string, string>();
    snapshot.tasks.forEach((task) => taskIdMap.set(task.id, randomUUID()));
    const sortedTasks = [...snapshot.tasks].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id));
    const earliestStart = sortedTasks.reduce((min, task) => {
      const next = domainToDate(task.startDate);
      return next.getTime() < min.getTime() ? next : min;
    }, domainToDate(sortedTasks[0]!.startDate));
    const anchorStart = new Date();
    const today = new Date(Date.UTC(anchorStart.getUTCFullYear(), anchorStart.getUTCMonth(), anchorStart.getUTCDate()));

    const createInputs: CreateTaskInput[] = sortedTasks.map((task) => {
      const relativeStartOffset = diffDays(domainToDate(task.startDate), earliestStart);
      const durationDays = task.type === 'milestone'
        ? 0
        : Math.max(1, diffDays(domainToDate(task.endDate), domainToDate(task.startDate)) + 1);
      const start = addDays(today, relativeStartOffset);
      const end = task.type === 'milestone' ? start : addDays(start, durationDays - 1);
      const dependencies: TaskDependency[] = snapshot.dependencies
        .filter((dependency) => dependency.taskId === task.id)
        .map((dependency) => ({
          taskId: taskIdMap.get(dependency.depTaskId)!,
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
        parentId: task.parentId ? taskIdMap.get(task.parentId)! : undefined,
        progress: task.progress ?? 0,
        sortOrder: task.sortOrder,
        dependencies,
      };
    });

    return this.commands.commitCommand({
      projectId,
      clientRequestId: randomUUID(),
      baseVersion: project.version,
      command: { type: 'create_tasks_batch', tasks: createInputs },
      includeSnapshot: true,
      history: {
        groupId: randomUUID(),
        requestContextId: randomUUID(),
        origin: 'system',
        title: mode === 'template'
          ? `Создан проект из publication "${project.name}"`
          : `Вставлен publication "${project.name}"`,
        finalizeGroup: true,
      },
    }, actorType, actorId);
  }
}

export const templatePublicationService = new TemplatePublicationService();
