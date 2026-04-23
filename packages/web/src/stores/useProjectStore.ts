import { create } from 'zustand';
import type { Task, ProjectState, ProjectSnapshot, FrontendProjectCommand, PendingCommand } from '../types';
import type { ProjectResource, TaskAssignmentRecord } from '../lib/apiTypes';
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
  assignmentError: string | null;
  setConfirmed: (version: number, snapshot: ProjectSnapshot) => void;
  mergeConfirmedSnapshot: (snapshot: ProjectSnapshot, version?: number) => void;
  hydrateConfirmed: (version: number, snapshot: ProjectSnapshot, extras?: { resources?: ProjectResource[]; assignments?: TaskAssignmentRecord[] }) => void;
  addPending: (pending: PendingCommand) => void;
  resolvePending: (requestId: string, newVersion: number, snapshot: ProjectSnapshot) => void;
  rejectPending: (requestId: string) => void;
  setDragPreview: (preview: { commands: FrontendProjectCommand[]; snapshot: ProjectSnapshot } | undefined) => void;
  clearTransientState: () => void;
  scheduleOptions: ProjectScheduleOptions;
  setScheduleOptions: (options: ProjectScheduleOptions) => void;
  setResources: (resources: ProjectResource[]) => void;
  setAssignments: (assignments: TaskAssignmentRecord[]) => void;
  setAssignmentError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  confirmed: { version: 0, snapshot: { tasks: [], dependencies: [] } },
  resources: [],
  assignments: [],
  assignmentError: null,
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
    resources: extras?.resources ?? [],
    assignments: extras?.assignments ?? [],
    assignmentError: null,
    pending: [],
    dragPreview: undefined,
  }),
  addPending: (pending) => set((state) => ({ pending: [...state.pending, pending] })),
  resolvePending: (requestId, newVersion, snapshot) => set((state) => ({
    ...(newVersion >= state.confirmed.version
      ? { confirmed: { version: newVersion, snapshot } }
      : {}),
    pending: state.pending.filter((p) => p.requestId !== requestId),
    dragPreview: undefined,
  })),
  rejectPending: (requestId) => set((state) => ({
    pending: state.pending.filter((p) => p.requestId !== requestId),
    dragPreview: undefined,
  })),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  clearTransientState: () => set({ pending: [], dragPreview: undefined }),
  setScheduleOptions: (options) => set({ scheduleOptions: options }),
  setResources: (resources) => set({ resources }),
  setAssignments: (assignments) => set({ assignments }),
  setAssignmentError: (assignmentError) => set({ assignmentError }),
}));
