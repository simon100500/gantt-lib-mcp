import { randomUUID } from 'node:crypto';
import { getPrisma, Prisma } from '@gantt/runtime-core/prisma';
import { getProjectCalendarSettings } from '@gantt/mcp/services';
import { normalizeStoredTaskStatus } from '@gantt/runtime-core/services/task-status';
import type {
  BaselineSource,
  CalendarDayKind,
  DependencyType,
  GanttDayMode,
  ResourceScope,
  ResourceType,
  TaskFinanceAllocationMode,
  TaskStatus,
  TaskType,
  TimelineMarker,
} from '@gantt/mcp/types';

const BACKUP_FILE_KIND = 'gantt-project-backup';
const BACKUP_FILE_VERSION = 1;

type BackupTask = {
  backupId: string;
  name: string;
  startDate: string;
  endDate: string;
  type: TaskType;
  color: string | null;
  parentBackupId: string | null;
  status: TaskStatus;
  progress: number;
  workVolume: number | null;
  workUnit: string | null;
  completedVolume: number;
  sortOrder: number;
};

type BackupDependency = {
  backupId: string;
  taskBackupId: string;
  depTaskBackupId: string;
  type: DependencyType;
  lag: number;
};

type BackupResource = {
  backupId: string;
  name: string;
  type: ResourceType;
  scope: ResourceScope;
  isActive: boolean;
  deactivatedAt: string | null;
};

type BackupAssignment = {
  taskBackupId: string;
  resourceBackupId: string;
  createdAt: string;
};

type BackupProgressEntry = {
  taskBackupId: string;
  entryDate: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

type BackupFinanceSetting = {
  taskBackupId: string;
  plannedCost: number;
  currencyCode: string;
  allocationMode: TaskFinanceAllocationMode;
  allocationParentTaskBackupId: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackupFundingEvent = {
  taskBackupId: string;
  eventDate: string;
  amount: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackupBaselineTask = {
  taskBackupId: string;
  name: string;
  startDate: string;
  endDate: string;
  type: TaskType;
  color: string | null;
  progress: number;
  parentTaskBackupId: string | null;
  sortOrder: number;
};

type BackupBaselineDependency = {
  dependencyBackupId: string;
  taskBackupId: string;
  depTaskBackupId: string;
  type: DependencyType;
  lag: number;
};

type BackupBaseline = {
  backupId: string;
  name: string;
  source: BaselineSource;
  sourceHistoryGroupId: string | null;
  createdAt: string;
  tasks: BackupBaselineTask[];
  dependencies: BackupBaselineDependency[];
};

export type ProjectBackupFile = {
  format: typeof BACKUP_FILE_KIND;
  version: typeof BACKUP_FILE_VERSION;
  exportedAt: string;
  source: {
    projectId: string;
    userId: string;
    groupId: string | null;
  };
  project: {
    name: string;
    ganttDayMode: GanttDayMode;
    calendarDays: Array<{ date: string; kind: CalendarDayKind }>;
    timelineMarkers: TimelineMarker[];
  };
  data: {
    tasks: BackupTask[];
    dependencies: BackupDependency[];
    resources: BackupResource[];
    assignments: BackupAssignment[];
    progressEntries: BackupProgressEntry[];
    financeSettings: BackupFinanceSetting[];
    fundingEvents: BackupFundingEvent[];
    baselines: BackupBaseline[];
  };
};

export type ImportProjectBackupSummary = {
  taskCount: number;
  resourceCount: number;
  assignmentCount: number;
  progressEntryCount: number;
  financeSettingCount: number;
  fundingEventCount: number;
  baselineCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNullableTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asTrimmedString(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as T;
}

function assertIsoDate(value: unknown, label: string): string {
  const date = asTrimmedString(value);
  if (!date || !isIsoDate(date.slice(0, 10))) {
    throw new Error(`Invalid ${label}`);
  }
  return date.slice(0, 10);
}

function assertIsoDateTime(value: unknown, label: string): string {
  const dateTime = asTrimmedString(value);
  if (!dateTime || !isIsoDateTime(dateTime)) {
    throw new Error(`Invalid ${label}`);
  }
  return new Date(dateTime).toISOString();
}

function assertNumber(value: unknown, label: string): number {
  const number = asFiniteNumber(value);
  if (number === null) {
    throw new Error(`Invalid ${label}`);
  }
  return number;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function normalizeTimelineMarkersInput(value: unknown): TimelineMarker[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const markers: TimelineMarker[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }

    const date = asTrimmedString(entry.date);
    if (!date || !isIsoDate(date.slice(0, 10))) {
      return null;
    }

    const marker: TimelineMarker = { date: date.slice(0, 10) };
    const color = asNullableTrimmedString(entry.color);
    const name = asNullableTrimmedString(entry.name);
    if (color) {
      marker.color = color;
    }
    if (name) {
      marker.name = name;
    }
    markers.push(marker);
  }

  return markers;
}

export function parseProjectBackupFile(input: unknown): ProjectBackupFile {
  if (!isRecord(input)) {
    throw new Error('Backup payload must be an object');
  }

  if (input.format !== BACKUP_FILE_KIND) {
    throw new Error('Unsupported backup format');
  }

  if (input.version !== BACKUP_FILE_VERSION) {
    throw new Error('Unsupported backup version');
  }

  const source = isRecord(input.source) ? input.source : null;
  const project = isRecord(input.project) ? input.project : null;
  const data = isRecord(input.data) ? input.data : null;
  if (!source || !project || !data) {
    throw new Error('Backup payload is incomplete');
  }

  const taskTypeValues = ['task', 'milestone'] as const;
  const taskStatusValues = ['not_started', 'in_progress', 'done', 'closed'] as const;
  const dependencyTypeValues = ['FS', 'SS', 'FF', 'SF'] as const;
  const resourceTypeValues = ['human', 'equipment', 'material', 'other'] as const;
  const resourceScopeValues = ['shared', 'project'] as const;
  const calendarDayKindValues = ['working', 'non_working', 'shortened'] as const;
  const ganttDayModeValues = ['business', 'calendar'] as const;
  const financeAllocationModeValues = ['manual', 'auto'] as const;
  const baselineSourceValues = ['current', 'history'] as const;

  const tasks = requireArray(data.tasks, 'tasks').map((entry, index): BackupTask => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid task at index ${index}`);
    }

    const backupId = asTrimmedString(entry.backupId);
    const name = asTrimmedString(entry.name);
    if (!backupId || !name) {
      throw new Error(`Invalid task at index ${index}`);
    }

    return {
      backupId,
      name,
      startDate: assertIsoDate(entry.startDate, `task startDate at index ${index}`),
      endDate: assertIsoDate(entry.endDate, `task endDate at index ${index}`),
      type: assertEnum(entry.type, taskTypeValues, 'task type'),
      color: asNullableTrimmedString(entry.color),
      parentBackupId: asNullableTrimmedString(entry.parentBackupId),
      status: assertEnum(entry.status, taskStatusValues, 'task status'),
      progress: assertNumber(entry.progress, `task progress at index ${index}`),
      workVolume: entry.workVolume === null || entry.workVolume === undefined ? null : assertNumber(entry.workVolume, `task workVolume at index ${index}`),
      workUnit: asNullableTrimmedString(entry.workUnit),
      completedVolume: assertNumber(entry.completedVolume, `task completedVolume at index ${index}`),
      sortOrder: assertNumber(entry.sortOrder, `task sortOrder at index ${index}`),
    };
  });

  const taskIdSet = new Set<string>();
  for (const task of tasks) {
    if (taskIdSet.has(task.backupId)) {
      throw new Error(`Duplicate task backupId "${task.backupId}"`);
    }
    taskIdSet.add(task.backupId);
  }
  for (const task of tasks) {
    if (task.parentBackupId && !taskIdSet.has(task.parentBackupId)) {
      throw new Error(`Task "${task.backupId}" references missing parent "${task.parentBackupId}"`);
    }
  }

  const dependencies = requireArray(data.dependencies, 'dependencies').map((entry, index): BackupDependency => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid dependency at index ${index}`);
    }
    const taskBackupId = asTrimmedString(entry.taskBackupId);
    const depTaskBackupId = asTrimmedString(entry.depTaskBackupId);
    if (!taskBackupId || !depTaskBackupId) {
      throw new Error(`Invalid dependency at index ${index}`);
    }
    return {
      backupId: asTrimmedString(entry.backupId) ?? `dependency-${index + 1}`,
      taskBackupId,
      depTaskBackupId,
      type: assertEnum(entry.type, dependencyTypeValues, 'dependency type'),
      lag: assertNumber(entry.lag, `dependency lag at index ${index}`),
    };
  });
  for (const dependency of dependencies) {
    if (!taskIdSet.has(dependency.taskBackupId) || !taskIdSet.has(dependency.depTaskBackupId)) {
      throw new Error(`Dependency "${dependency.backupId}" references missing tasks`);
    }
  }

  const resources = requireArray(data.resources, 'resources').map((entry, index): BackupResource => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid resource at index ${index}`);
    }
    const backupId = asTrimmedString(entry.backupId);
    const name = asTrimmedString(entry.name);
    if (!backupId || !name) {
      throw new Error(`Invalid resource at index ${index}`);
    }
    return {
      backupId,
      name,
      type: assertEnum(entry.type, resourceTypeValues, 'resource type'),
      scope: assertEnum(entry.scope, resourceScopeValues, 'resource scope'),
      isActive: assertBoolean(entry.isActive, `resource isActive at index ${index}`),
      deactivatedAt: entry.deactivatedAt === null || entry.deactivatedAt === undefined
        ? null
        : assertIsoDateTime(entry.deactivatedAt, `resource deactivatedAt at index ${index}`),
    };
  });

  const resourceIdSet = new Set<string>();
  for (const resource of resources) {
    if (resourceIdSet.has(resource.backupId)) {
      throw new Error(`Duplicate resource backupId "${resource.backupId}"`);
    }
    resourceIdSet.add(resource.backupId);
  }

  const assignments = requireArray(data.assignments, 'assignments').map((entry, index): BackupAssignment => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid assignment at index ${index}`);
    }
    const taskBackupId = asTrimmedString(entry.taskBackupId);
    const resourceBackupId = asTrimmedString(entry.resourceBackupId);
    if (!taskBackupId || !resourceBackupId) {
      throw new Error(`Invalid assignment at index ${index}`);
    }
    return {
      taskBackupId,
      resourceBackupId,
      createdAt: assertIsoDateTime(entry.createdAt, `assignment createdAt at index ${index}`),
    };
  });
  for (const assignment of assignments) {
    if (!taskIdSet.has(assignment.taskBackupId) || !resourceIdSet.has(assignment.resourceBackupId)) {
      throw new Error('Assignment references missing task or resource');
    }
  }

  const progressEntries = requireArray(data.progressEntries, 'progressEntries').map((entry, index): BackupProgressEntry => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid progress entry at index ${index}`);
    }
    const taskBackupId = asTrimmedString(entry.taskBackupId);
    if (!taskBackupId) {
      throw new Error(`Invalid progress entry at index ${index}`);
    }
    return {
      taskBackupId,
      entryDate: assertIsoDate(entry.entryDate, `progress entry date at index ${index}`),
      amount: assertNumber(entry.amount, `progress amount at index ${index}`),
      createdAt: assertIsoDateTime(entry.createdAt, `progress createdAt at index ${index}`),
      updatedAt: assertIsoDateTime(entry.updatedAt, `progress updatedAt at index ${index}`),
    };
  });
  for (const entry of progressEntries) {
    if (!taskIdSet.has(entry.taskBackupId)) {
      throw new Error('Progress entry references missing task');
    }
  }

  const financeSettings = requireArray(data.financeSettings, 'financeSettings').map((entry, index): BackupFinanceSetting => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid finance setting at index ${index}`);
    }
    const taskBackupId = asTrimmedString(entry.taskBackupId);
    const currencyCode = asTrimmedString(entry.currencyCode);
    if (!taskBackupId || !currencyCode) {
      throw new Error(`Invalid finance setting at index ${index}`);
    }
    return {
      taskBackupId,
      plannedCost: assertNumber(entry.plannedCost, `finance plannedCost at index ${index}`),
      currencyCode,
      allocationMode: assertEnum(entry.allocationMode, financeAllocationModeValues, 'finance allocation mode'),
      allocationParentTaskBackupId: asNullableTrimmedString(entry.allocationParentTaskBackupId),
      createdAt: assertIsoDateTime(entry.createdAt, `finance createdAt at index ${index}`),
      updatedAt: assertIsoDateTime(entry.updatedAt, `finance updatedAt at index ${index}`),
    };
  });
  for (const setting of financeSettings) {
    if (!taskIdSet.has(setting.taskBackupId)) {
      throw new Error('Finance setting references missing task');
    }
    if (setting.allocationParentTaskBackupId && !taskIdSet.has(setting.allocationParentTaskBackupId)) {
      throw new Error('Finance setting references missing allocation parent task');
    }
  }

  const fundingEvents = requireArray(data.fundingEvents, 'fundingEvents').map((entry, index): BackupFundingEvent => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid funding event at index ${index}`);
    }
    const taskBackupId = asTrimmedString(entry.taskBackupId);
    if (!taskBackupId) {
      throw new Error(`Invalid funding event at index ${index}`);
    }
    return {
      taskBackupId,
      eventDate: assertIsoDate(entry.eventDate, `funding eventDate at index ${index}`),
      amount: assertNumber(entry.amount, `funding amount at index ${index}`),
      comment: typeof entry.comment === 'string' ? entry.comment : null,
      createdAt: assertIsoDateTime(entry.createdAt, `funding createdAt at index ${index}`),
      updatedAt: assertIsoDateTime(entry.updatedAt, `funding updatedAt at index ${index}`),
    };
  });
  for (const event of fundingEvents) {
    if (!taskIdSet.has(event.taskBackupId)) {
      throw new Error('Funding event references missing task');
    }
  }

  const baselines = requireArray(data.baselines, 'baselines').map((entry, index): BackupBaseline => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid baseline at index ${index}`);
    }

    const backupId = asTrimmedString(entry.backupId);
    const name = asTrimmedString(entry.name);
    if (!backupId || !name) {
      throw new Error(`Invalid baseline at index ${index}`);
    }

    const baselineTasks = requireArray(entry.tasks, `baseline tasks at index ${index}`).map((taskEntry, taskIndex): BackupBaselineTask => {
      if (!isRecord(taskEntry)) {
        throw new Error(`Invalid baseline task at baseline ${index}, task ${taskIndex}`);
      }
      const taskBackupId = asTrimmedString(taskEntry.taskBackupId);
      const taskName = asTrimmedString(taskEntry.name);
      if (!taskBackupId || !taskName) {
        throw new Error(`Invalid baseline task at baseline ${index}, task ${taskIndex}`);
      }
      return {
        taskBackupId,
        name: taskName,
        startDate: assertIsoDate(taskEntry.startDate, `baseline task startDate at baseline ${index}, task ${taskIndex}`),
        endDate: assertIsoDate(taskEntry.endDate, `baseline task endDate at baseline ${index}, task ${taskIndex}`),
        type: assertEnum(taskEntry.type, taskTypeValues, 'baseline task type'),
        color: asNullableTrimmedString(taskEntry.color),
        progress: assertNumber(taskEntry.progress, `baseline task progress at baseline ${index}, task ${taskIndex}`),
        parentTaskBackupId: asNullableTrimmedString(taskEntry.parentTaskBackupId),
        sortOrder: assertNumber(taskEntry.sortOrder, `baseline task sortOrder at baseline ${index}, task ${taskIndex}`),
      };
    });

    const baselineTaskIdSet = new Set<string>();
    for (const task of baselineTasks) {
      if (baselineTaskIdSet.has(task.taskBackupId)) {
        throw new Error(`Duplicate baseline task id "${task.taskBackupId}" in baseline "${backupId}"`);
      }
      baselineTaskIdSet.add(task.taskBackupId);
    }
    for (const task of baselineTasks) {
      if (task.parentTaskBackupId && !baselineTaskIdSet.has(task.parentTaskBackupId)) {
        throw new Error(`Baseline "${backupId}" references missing parent task "${task.parentTaskBackupId}"`);
      }
    }

    const baselineDependencies = requireArray(entry.dependencies, `baseline dependencies at index ${index}`).map((dependencyEntry, dependencyIndex): BackupBaselineDependency => {
      if (!isRecord(dependencyEntry)) {
        throw new Error(`Invalid baseline dependency at baseline ${index}, dependency ${dependencyIndex}`);
      }
      const taskBackupId = asTrimmedString(dependencyEntry.taskBackupId);
      const depTaskBackupId = asTrimmedString(dependencyEntry.depTaskBackupId);
      if (!taskBackupId || !depTaskBackupId) {
        throw new Error(`Invalid baseline dependency at baseline ${index}, dependency ${dependencyIndex}`);
      }
      return {
        dependencyBackupId: asTrimmedString(dependencyEntry.dependencyBackupId) ?? `baseline-dependency-${dependencyIndex + 1}`,
        taskBackupId,
        depTaskBackupId,
        type: assertEnum(dependencyEntry.type, dependencyTypeValues, 'baseline dependency type'),
        lag: assertNumber(dependencyEntry.lag, `baseline dependency lag at baseline ${index}, dependency ${dependencyIndex}`),
      };
    });
    for (const dependency of baselineDependencies) {
      if (!baselineTaskIdSet.has(dependency.taskBackupId) || !baselineTaskIdSet.has(dependency.depTaskBackupId)) {
        throw new Error(`Baseline "${backupId}" dependency references missing tasks`);
      }
    }

    return {
      backupId,
      name,
      source: assertEnum(entry.source, baselineSourceValues, 'baseline source'),
      sourceHistoryGroupId: asNullableTrimmedString(entry.sourceHistoryGroupId),
      createdAt: assertIsoDateTime(entry.createdAt, `baseline createdAt at index ${index}`),
      tasks: baselineTasks,
      dependencies: baselineDependencies,
    };
  });

  const calendarDays = requireArray(project.calendarDays, 'calendarDays').map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid calendar day at index ${index}`);
    }
    return {
      date: assertIsoDate(entry.date, `calendar day date at index ${index}`),
      kind: assertEnum(entry.kind, calendarDayKindValues, 'calendar day kind'),
    };
  });

  const timelineMarkers = normalizeTimelineMarkersInput(project.timelineMarkers);
  if (timelineMarkers === null) {
    throw new Error('Invalid timeline markers');
  }

  return {
    format: BACKUP_FILE_KIND,
    version: BACKUP_FILE_VERSION,
    exportedAt: assertIsoDateTime(input.exportedAt, 'exportedAt'),
    source: {
      projectId: asTrimmedString(source.projectId) ?? (() => { throw new Error('Invalid source projectId'); })(),
      userId: asTrimmedString(source.userId) ?? (() => { throw new Error('Invalid source userId'); })(),
      groupId: asNullableTrimmedString(source.groupId),
    },
    project: {
      name: asTrimmedString(project.name) ?? (() => { throw new Error('Invalid project name'); })(),
      ganttDayMode: assertEnum(project.ganttDayMode, ganttDayModeValues, 'gantt day mode'),
      calendarDays,
      timelineMarkers,
    },
    data: {
      tasks,
      dependencies,
      resources,
      assignments,
      progressEntries,
      financeSettings,
      fundingEvents,
      baselines,
    },
  };
}

export async function buildProjectBackup(projectId: string): Promise<ProjectBackupFile> {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, groupId: true, name: true, ganttDayMode: true, timelineMarkers: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const [tasks, dependencies, assignments, progressEntries, financeSettings, fundingEvents, baselines, projectCalendar] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.dependency.findMany({
      where: { task: { projectId } },
      orderBy: [{ taskId: 'asc' }, { depTaskId: 'asc' }],
    }),
    prisma.taskAssignment.findMany({
      where: { projectId },
      orderBy: [{ taskId: 'asc' }, { resourceId: 'asc' }],
    }),
    prisma.taskProgressEntry.findMany({
      where: { projectId },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.taskFinanceSetting.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taskFundingEvent.findMany({
      where: { projectId },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.baseline.findMany({
      where: { projectId },
      include: {
        tasks: {
          orderBy: { sortOrder: 'asc' },
        },
        dependencies: {
          orderBy: [{ taskId: 'asc' }, { depTaskId: 'asc' }],
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    getProjectCalendarSettings(prisma, projectId),
  ]);

  const resourceIds = Array.from(new Set(assignments.map((assignment) => assignment.resourceId)));
  const resources = await prisma.resource.findMany({
    where: {
      OR: [
        { projectId },
        ...(resourceIds.length > 0 ? [{ id: { in: resourceIds } }] : []),
      ],
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const timelineMarkers = normalizeTimelineMarkersInput(project.timelineMarkers) ?? [];

  return {
    format: BACKUP_FILE_KIND,
    version: BACKUP_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      projectId: project.id,
      userId: project.userId,
      groupId: project.groupId,
    },
    project: {
      name: project.name,
      ganttDayMode: project.ganttDayMode as GanttDayMode,
      calendarDays: projectCalendar.calendarDays,
      timelineMarkers,
    },
    data: {
      tasks: tasks.map((task) => ({
        backupId: task.id,
        name: task.name,
        startDate: task.startDate.toISOString().slice(0, 10),
        endDate: task.endDate.toISOString().slice(0, 10),
        type: task.type ?? 'task',
        color: task.color ?? null,
        parentBackupId: task.parentId ?? null,
        status: normalizeStoredTaskStatus(task.status),
        progress: task.progress,
        workVolume: task.workVolume === null ? null : Number(task.workVolume),
        workUnit: task.workUnit ?? null,
        completedVolume: task.completedVolume ?? 0,
        sortOrder: task.sortOrder,
      })),
      dependencies: dependencies.map((dependency) => ({
        backupId: dependency.id,
        taskBackupId: dependency.taskId,
        depTaskBackupId: dependency.depTaskId,
        type: dependency.type as DependencyType,
        lag: dependency.lag,
      })),
      resources: resources.map((resource) => ({
        backupId: resource.id,
        name: resource.name,
        type: resource.type as ResourceType,
        scope: resource.projectId ? 'project' : 'shared',
        isActive: resource.isActive,
        deactivatedAt: resource.deactivatedAt ? resource.deactivatedAt.toISOString() : null,
      })),
      assignments: assignments.map((assignment) => ({
        taskBackupId: assignment.taskId,
        resourceBackupId: assignment.resourceId,
        createdAt: assignment.createdAt.toISOString(),
      })),
      progressEntries: progressEntries.map((entry) => ({
        taskBackupId: entry.taskId,
        entryDate: entry.entryDate.toISOString().slice(0, 10),
        amount: entry.amount,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
      financeSettings: financeSettings.map((setting) => ({
        taskBackupId: setting.taskId,
        plannedCost: Number(setting.plannedCost),
        currencyCode: setting.currencyCode,
        allocationMode: setting.allocationMode as TaskFinanceAllocationMode,
        allocationParentTaskBackupId: setting.allocationParentTaskId ?? null,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString(),
      })),
      fundingEvents: fundingEvents.map((event) => ({
        taskBackupId: event.taskId,
        eventDate: event.eventDate.toISOString().slice(0, 10),
        amount: Number(event.amount),
        comment: event.comment ?? null,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
      })),
      baselines: baselines.map((baseline) => ({
        backupId: baseline.id,
        name: baseline.name,
        source: baseline.source as BaselineSource,
        sourceHistoryGroupId: baseline.sourceHistoryGroupId ?? null,
        createdAt: baseline.createdAt.toISOString(),
        tasks: baseline.tasks.map((task) => ({
          taskBackupId: task.taskId,
          name: task.name,
          startDate: task.startDate.toISOString().slice(0, 10),
          endDate: task.endDate.toISOString().slice(0, 10),
          type: task.type ?? 'task',
          color: task.color ?? null,
          progress: task.progress,
          parentTaskBackupId: task.parentId ?? null,
          sortOrder: task.sortOrder,
        })),
        dependencies: baseline.dependencies.map((dependency) => ({
          dependencyBackupId: dependency.dependencyId,
          taskBackupId: dependency.taskId,
          depTaskBackupId: dependency.depTaskId,
          type: dependency.type as DependencyType,
          lag: dependency.lag,
        })),
      })),
    },
  };
}

async function replaceProjectCalendar(
  tx: any,
  projectId: string,
  projectName: string,
  calendarDays: Array<{ date: string; kind: CalendarDayKind }>,
): Promise<string | null> {
  const ownedCalendars = await tx.workCalendar.findMany({
    where: { projectId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (calendarDays.length === 0) {
    if (ownedCalendars.length > 0) {
      const ownedCalendarIds = ownedCalendars.map((calendar: { id: string }) => calendar.id);
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
        name: `${projectName} backup calendar`,
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
        name: `${projectName} backup calendar`,
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
    const staleIds = ownedCalendars.slice(1).map((calendar: { id: string }) => calendar.id);
    await tx.calendarDay.deleteMany({ where: { calendarId: { in: staleIds } } });
    await tx.workCalendar.deleteMany({ where: { id: { in: staleIds } } });
  }

  return calendarId;
}

export async function importProjectBackup(projectId: string, backup: ProjectBackupFile): Promise<ImportProjectBackupSummary> {
  const prisma = getPrisma();
  const taskIdMap = new Map(backup.data.tasks.map((task) => [task.backupId, randomUUID()]));
  const resourceIdMap = new Map(backup.data.resources.map((resource) => [resource.backupId, randomUUID()]));

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, groupId: true },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    await tx.shareLink.deleteMany({ where: { projectId } });
    await tx.message.deleteMany({ where: { projectId } });
    await tx.baseline.deleteMany({ where: { projectId } });
    await tx.projectEvent.deleteMany({ where: { projectId } });
    await tx.mutationGroup.deleteMany({ where: { projectId } });
    await tx.task.deleteMany({ where: { projectId } });
    await tx.resource.deleteMany({ where: { projectId } });

    const calendarId = await replaceProjectCalendar(tx, projectId, backup.project.name, backup.project.calendarDays);

    await tx.project.update({
      where: { id: projectId },
      data: {
        name: backup.project.name,
        ganttDayMode: backup.project.ganttDayMode,
        calendarId,
        timelineMarkers: backup.project.timelineMarkers as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    if (backup.data.tasks.length > 0) {
      await tx.task.createMany({
        data: backup.data.tasks.map((task) => ({
          id: taskIdMap.get(task.backupId)!,
          projectId,
          name: task.name,
          startDate: new Date(`${task.startDate}T00:00:00.000Z`),
          endDate: new Date(`${task.endDate}T00:00:00.000Z`),
          type: task.type,
          status: task.status,
          color: task.color,
          progress: task.progress,
          workVolume: task.workVolume,
          workUnit: task.workUnit,
          completedVolume: task.completedVolume,
          parentId: task.parentBackupId ? taskIdMap.get(task.parentBackupId)! : null,
          sortOrder: task.sortOrder,
        })),
      });
    }

    if (backup.data.dependencies.length > 0) {
      await tx.dependency.createMany({
        data: backup.data.dependencies.map((dependency) => ({
          id: randomUUID(),
          taskId: taskIdMap.get(dependency.taskBackupId)!,
          depTaskId: taskIdMap.get(dependency.depTaskBackupId)!,
          type: dependency.type,
          lag: dependency.lag,
        })),
      });
    }

    if (backup.data.resources.length > 0) {
      await tx.resource.createMany({
        data: backup.data.resources.map((resource) => ({
          id: resourceIdMap.get(resource.backupId)!,
          userId: project.userId,
          projectId: resource.scope === 'project' ? projectId : null,
          projectGroupId: resource.scope === 'shared' ? project.groupId : null,
          name: resource.name,
          type: resource.type,
          isActive: resource.isActive,
          deactivatedAt: resource.deactivatedAt ? new Date(resource.deactivatedAt) : null,
        })),
      });
    }

    if (backup.data.assignments.length > 0) {
      await tx.taskAssignment.createMany({
        data: backup.data.assignments.map((assignment) => ({
          id: randomUUID(),
          projectId,
          taskId: taskIdMap.get(assignment.taskBackupId)!,
          resourceId: resourceIdMap.get(assignment.resourceBackupId)!,
          createdAt: new Date(assignment.createdAt),
        })),
      });
    }

    if (backup.data.progressEntries.length > 0) {
      await tx.taskProgressEntry.createMany({
        data: backup.data.progressEntries.map((entry) => ({
          id: randomUUID(),
          projectId,
          taskId: taskIdMap.get(entry.taskBackupId)!,
          entryDate: new Date(`${entry.entryDate}T00:00:00.000Z`),
          amount: entry.amount,
          createdAt: new Date(entry.createdAt),
          updatedAt: new Date(entry.updatedAt),
        })),
      });
    }

    if (backup.data.financeSettings.length > 0) {
      await tx.taskFinanceSetting.createMany({
        data: backup.data.financeSettings.map((setting) => ({
          id: randomUUID(),
          projectId,
          taskId: taskIdMap.get(setting.taskBackupId)!,
          plannedCost: setting.plannedCost,
          currencyCode: setting.currencyCode,
          allocationMode: setting.allocationMode,
          allocationParentTaskId: setting.allocationParentTaskBackupId ? taskIdMap.get(setting.allocationParentTaskBackupId)! : null,
          createdAt: new Date(setting.createdAt),
          updatedAt: new Date(setting.updatedAt),
        })),
      });
    }

    if (backup.data.fundingEvents.length > 0) {
      await tx.taskFundingEvent.createMany({
        data: backup.data.fundingEvents.map((event) => ({
          id: randomUUID(),
          projectId,
          taskId: taskIdMap.get(event.taskBackupId)!,
          eventDate: new Date(`${event.eventDate}T00:00:00.000Z`),
          amount: event.amount,
          comment: event.comment,
          createdAt: new Date(event.createdAt),
          updatedAt: new Date(event.updatedAt),
        })),
      });
    }

    for (const baseline of backup.data.baselines) {
      const baselineId = randomUUID();
      const mapBaselineTaskId = (baselineTaskBackupId: string) => taskIdMap.get(baselineTaskBackupId) ?? baselineTaskBackupId;

      await tx.baseline.create({
        data: {
          id: baselineId,
          projectId,
          name: baseline.name,
          source: baseline.source,
          sourceHistoryGroupId: null,
          createdAt: new Date(baseline.createdAt),
        },
      });

      if (baseline.tasks.length > 0) {
        await tx.baselineTask.createMany({
          data: baseline.tasks.map((task) => ({
            id: randomUUID(),
            baselineId,
            taskId: mapBaselineTaskId(task.taskBackupId),
            name: task.name,
            startDate: new Date(`${task.startDate}T00:00:00.000Z`),
            endDate: new Date(`${task.endDate}T00:00:00.000Z`),
            type: task.type,
            color: task.color,
            progress: task.progress,
            parentId: task.parentTaskBackupId ? mapBaselineTaskId(task.parentTaskBackupId) : null,
            sortOrder: task.sortOrder,
          })),
        });
      }

      if (baseline.dependencies.length > 0) {
        await tx.baselineDependency.createMany({
          data: baseline.dependencies.map((dependency) => ({
            id: randomUUID(),
            baselineId,
            dependencyId: dependency.dependencyBackupId,
            taskId: mapBaselineTaskId(dependency.taskBackupId),
            depTaskId: mapBaselineTaskId(dependency.depTaskBackupId),
            type: dependency.type,
            lag: dependency.lag,
          })),
        });
      }
    }

    return {
      taskCount: backup.data.tasks.length,
      resourceCount: backup.data.resources.length,
      assignmentCount: backup.data.assignments.length,
      progressEntryCount: backup.data.progressEntries.length,
      financeSettingCount: backup.data.financeSettings.length,
      fundingEventCount: backup.data.fundingEvents.length,
      baselineCount: backup.data.baselines.length,
    };
  });
}

export function buildBackupDownloadFileName(projectName: string, value = new Date()): string {
  const safeProjectName = projectName.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim() || 'project';
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  const hours = String(value.getUTCHours()).padStart(2, '0');
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  return `${safeProjectName} - backup ${year}-${month}-${day} ${hours}-${minutes}.gantt.json`;
}
