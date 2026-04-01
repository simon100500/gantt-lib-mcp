import { create } from 'zustand';
import type { Task, ProjectState, ProjectSnapshot, FrontendProjectCommand, PendingCommand } from '../types';
import { replayProjectCommand } from '../lib/projectCommandReplay';

export interface ProjectScheduleOptions {
  businessDays: boolean;
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

  return pending.reduce(
    (snapshot, pendingCommand) => replayProjectCommand(snapshot, pendingCommand.command, options, pendingCommand.requestId),
    confirmedSnapshot,
  );
}

interface ProjectStoreState extends ProjectState {
  setConfirmed: (version: number, snapshot: ProjectSnapshot) => void;
  hydrateConfirmed: (version: number, snapshot: ProjectSnapshot) => void;
  addPending: (pending: PendingCommand) => void;
  resolvePending: (requestId: string, newVersion: number, snapshot: ProjectSnapshot) => void;
  rejectPending: (requestId: string) => void;
  setDragPreview: (preview: { commands: FrontendProjectCommand[]; snapshot: ProjectSnapshot } | undefined) => void;
  clearTransientState: () => void;
  scheduleOptions: ProjectScheduleOptions;
  setScheduleOptions: (options: ProjectScheduleOptions) => void;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  confirmed: { version: 0, snapshot: { tasks: [], dependencies: [] } },
  pending: [],
  dragPreview: undefined,
  scheduleOptions: { businessDays: true },

  setConfirmed: (version, snapshot) => set({ confirmed: { version, snapshot } }),
  hydrateConfirmed: (version, snapshot) => set({
    confirmed: { version, snapshot },
    pending: [],
    dragPreview: undefined,
  }),
  addPending: (pending) => set((state) => ({ pending: [...state.pending, pending] })),
  resolvePending: (requestId, newVersion, snapshot) => set((state) => ({
    confirmed: { version: newVersion, snapshot },
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
}));
