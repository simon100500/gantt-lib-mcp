import { create } from 'zustand';
import type { Task, ProjectState, ProjectSnapshot, FrontendProjectCommand, PendingCommand } from '../types';
import type { PlannerScope, ProjectResource, ResourcePlannerResult, TaskAssignmentRecord, TaskProgressEntry } from '../lib/apiTypes';
import { replayProjectCommand } from '../lib/projectCommandReplay';
import { getDefaultProjectScheduleOptions } from '../lib/projectScheduleOptions';
import type { ScheduleCommandOptions } from 'gantt-lib/core/scheduling';

export type ProjectScheduleOptions = ScheduleCommandOptions;

export function deriveOptimisticSnapshot(
  confirmedSnapshot: ProjectSnapshot,
  pending: PendingCommand[],
  options: ProjectScheduleOptions,
): ProjectSnapshot {
  return pending.reduce(
    (snapshot, pendingCommand) => replayProjectCommand(snapshot, pendingCommand.command, options, pendingCommand.requestId),
    confirmedSnapshot,
  );
}

export function deriveVisibleSnapshot(
  confirmedSnapshot: ProjectSnapshot,
  pending: PendingCommand[],
  dragPreview: ProjectState['dragPreview'],
  options: ProjectScheduleOptions,
): ProjectSnapshot {
  if (dragPreview) {
    return dragPreview.snapshot;
  }

  return deriveOptimisticSnapshot(confirmedSnapshot, pending, options);
}

interface ProjectStoreState extends ProjectState {
  resources: ProjectResource[];
  assignments: TaskAssignmentRecord[];
  progressEntries: TaskProgressEntry[];
  assignmentError: string | null;
  resourcePlannerCache: Record<string, ResourcePlannerResult>;
  setConfirmed: (version: number, snapshot: ProjectSnapshot) => void;
  mergeConfirmedSnapshot: (snapshot: ProjectSnapshot, version?: number) => void;
  hydrateConfirmed: (
    version: number,
    snapshot: ProjectSnapshot,
    extras?: { resources?: ProjectResource[]; assignments?: TaskAssignmentRecord[]; progressEntries?: TaskProgressEntry[] }
  ) => void;
  addPending: (pending: PendingCommand) => void;
  hydratePending: (pending: PendingCommand[]) => void;
  updatePendingStatus: (requestId: string, status: NonNullable<PendingCommand['status']>) => void;
  resolvePending: (requestId: string, newVersion: number, result: ProjectSnapshot | {
    changedTasks?: Task[];
    changedDependencyIds?: string[];
  }) => void;
  rejectPending: (requestId: string) => void;
  setDragPreview: (preview: ProjectState['dragPreview']) => void;
  clearTransientState: () => void;
  scheduleOptions: ProjectScheduleOptions;
  setScheduleOptions: (options: ProjectScheduleOptions) => void;
  setResources: (resources: ProjectResource[]) => void;
  upsertResource: (resource: ProjectResource) => void;
  removeResource: (resourceId: string) => void;
  setAssignments: (assignments: TaskAssignmentRecord[]) => void;
  setProgressEntries: (progressEntries: TaskProgressEntry[]) => void;
  replaceProgressEntriesForTask: (taskId: string, progressEntries: TaskProgressEntry[]) => void;
  replaceAssignmentsForTask: (taskId: string, assignments: TaskAssignmentRecord[]) => void;
  replaceAssignmentsForTasks: (taskIds: string[], assignments: TaskAssignmentRecord[]) => void;
  removeAssignmentsByResource: (resourceId: string) => void;
  setAssignmentError: (error: string | null) => void;
  setResourcePlannerCache: (projectId: string, scope: PlannerScope, data: ResourcePlannerResult) => void;
  mutateResourcePlannerCache: (projectId: string, scope: PlannerScope, mutate: (data: ResourcePlannerResult) => ResourcePlannerResult) => void;
  clearResourcePlannerCache: () => void;
}

function getResourcePlannerCacheKey(projectId: string, scope: PlannerScope): string {
  return `${projectId}:${scope}`;
}

function sortResources(resources: ProjectResource[]): ProjectResource[] {
  return [...resources].sort((left, right) => (
    Number(right.isActive) - Number(left.isActive)
    || left.name.localeCompare(right.name)
    || left.createdAt.localeCompare(right.createdAt)
  ));
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  confirmed: { version: 0, snapshot: { tasks: [], dependencies: [] } },
  resources: [],
  assignments: [],
  progressEntries: [],
  assignmentError: null,
  resourcePlannerCache: {},
  pending: [],
  dragPreview: undefined,
  scheduleOptions: getDefaultProjectScheduleOptions(),

  setConfirmed: (version, snapshot) => set((state) => (
    version >= state.confirmed.version
      ? { confirmed: { version, snapshot } }
      : state
  )),
  mergeConfirmedSnapshot: (snapshot, version) => set((state) => {
    const nextVersion = version ?? state.confirmed.version;
    if (nextVersion < state.confirmed.version) {
      return state;
    }

    return {
      confirmed: { version: nextVersion, snapshot },
    };
  }),
  hydrateConfirmed: (version, snapshot, extras) => set({
    confirmed: { version, snapshot },
    resources: extras?.resources ? sortResources(extras.resources) : [],
    assignments: extras?.assignments ?? [],
    progressEntries: extras?.progressEntries ?? [],
    assignmentError: null,
    resourcePlannerCache: {},
    pending: [],
    dragPreview: undefined,
  }),
  addPending: (pending) => set((state) => (
    state.pending.some((entry) => entry.requestId === pending.requestId)
      ? state
      : { pending: [...state.pending, pending] }
  )),
  hydratePending: (pending) => set({ pending, dragPreview: undefined }),
  updatePendingStatus: (requestId, status) => set((state) => ({
    pending: state.pending.map((entry) => (
      entry.requestId === requestId ? { ...entry, status } : entry
    )),
  })),
  resolvePending: (requestId, newVersion, result) => set((state) => {
    const pendingCommand = state.pending.find((entry) => entry.requestId === requestId)?.command;
    const isSnapshot = Array.isArray((result as ProjectSnapshot).tasks) && Array.isArray((result as ProjectSnapshot).dependencies);
    const nextPending = state.pending.filter((p) => p.requestId !== requestId);

    if (newVersion < state.confirmed.version) {
      return { pending: nextPending, dragPreview: undefined };
    }

    if (isSnapshot) {
      return {
        confirmed: { version: newVersion, snapshot: result as ProjectSnapshot },
        pending: nextPending,
        dragPreview: undefined,
      };
    }

    const changedTasks = (result as { changedTasks?: Task[] }).changedTasks ?? [];
    const changedTaskById = new Map(changedTasks.map((task) => [task.id, task]));
    const deleteIds = new Set<string>();

    if (pendingCommand?.type === 'delete_task') {
      deleteIds.add(pendingCommand.taskId);
    } else if (pendingCommand?.type === 'delete_tasks') {
      pendingCommand.taskIds.forEach((taskId) => deleteIds.add(taskId));
    }

    const nextTasks = state.confirmed.snapshot.tasks
      .filter((task) => !deleteIds.has(task.id))
      .map((task) => changedTaskById.get(task.id) ?? task);
    for (const task of changedTasks) {
      if (!nextTasks.some((candidate) => candidate.id === task.id)) {
        nextTasks.push(task);
      }
    }
    nextTasks.sort((left, right) => {
      const leftSort = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightSort = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return leftSort - rightSort || left.id.localeCompare(right.id);
    });

    const dependencyRows = new Map(state.confirmed.snapshot.dependencies.map((dependency) => [dependency.id, dependency]));
    const changedTaskIds = new Set(changedTasks.map((task) => task.id));
    for (const [id, dependency] of [...dependencyRows.entries()]) {
      if (changedTaskIds.has(dependency.taskId) || deleteIds.has(dependency.taskId) || deleteIds.has(dependency.depTaskId)) {
        dependencyRows.delete(id);
      }
    }
    for (const task of changedTasks) {
      for (const dependency of task.dependencies ?? []) {
        const id = `${task.id}:${dependency.taskId}`;
        dependencyRows.set(id, {
          id,
          taskId: task.id,
          depTaskId: dependency.taskId,
          type: dependency.type,
          lag: dependency.lag ?? 0,
        });
      }
    }

    return {
      confirmed: {
        version: newVersion,
        snapshot: {
          tasks: nextTasks,
          dependencies: [...dependencyRows.values()],
        },
      },
      pending: nextPending,
      dragPreview: undefined,
    };
  }),
  rejectPending: (requestId) => set((state) => ({
    pending: state.pending.filter((p) => p.requestId !== requestId),
    dragPreview: undefined,
  })),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  clearTransientState: () => set({ pending: [], dragPreview: undefined }),
  setScheduleOptions: (options) => set({ scheduleOptions: options }),
  setResources: (resources) => set({ resources: sortResources(resources) }),
  upsertResource: (resource) => set((state) => ({
    resources: sortResources(
      state.resources.some((entry) => entry.id === resource.id)
        ? state.resources.map((entry) => (entry.id === resource.id ? resource : entry))
        : [...state.resources, resource]
    ),
  })),
  removeResource: (resourceId) => set((state) => ({
    resources: state.resources.filter((resource) => resource.id !== resourceId),
  })),
  setAssignments: (assignments) => set({ assignments }),
  setProgressEntries: (progressEntries) => set({ progressEntries }),
  replaceProgressEntriesForTask: (taskId, progressEntries) => set((state) => ({
    progressEntries: [
      ...state.progressEntries.filter((entry) => entry.taskId !== taskId),
      ...progressEntries,
    ].sort((left, right) => (
      left.entryDate.localeCompare(right.entryDate)
      || left.createdAt.localeCompare(right.createdAt)
    )),
  })),
  replaceAssignmentsForTask: (taskId, assignments) => set((state) => ({
    assignments: [
      ...state.assignments.filter((assignment) => assignment.taskId !== taskId),
      ...assignments,
    ],
  })),
  replaceAssignmentsForTasks: (taskIds, assignments) => set((state) => {
    const taskIdSet = new Set(taskIds);
    return {
      assignments: [
        ...state.assignments.filter((assignment) => !taskIdSet.has(assignment.taskId)),
        ...assignments,
      ],
    };
  }),
  removeAssignmentsByResource: (resourceId) => set((state) => ({
    assignments: state.assignments.filter((assignment) => assignment.resourceId !== resourceId),
  })),
  setAssignmentError: (assignmentError) => set({ assignmentError }),
  setResourcePlannerCache: (projectId, scope, data) => set((state) => ({
    resourcePlannerCache: {
      ...state.resourcePlannerCache,
      [getResourcePlannerCacheKey(projectId, scope)]: data,
    },
  })),
  mutateResourcePlannerCache: (projectId, scope, mutate) => set((state) => {
    const key = getResourcePlannerCacheKey(projectId, scope);
    const current = state.resourcePlannerCache[key];
    if (!current) {
      return state;
    }
    return {
      resourcePlannerCache: {
        ...state.resourcePlannerCache,
        [key]: mutate(current),
      },
    };
  }),
  clearResourcePlannerCache: () => set({ resourcePlannerCache: {} }),
}));
