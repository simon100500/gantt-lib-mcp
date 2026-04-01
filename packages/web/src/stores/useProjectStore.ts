import { create } from 'zustand';
import type { Task, ProjectState, ProjectSnapshot, FrontendProjectCommand, PendingCommand } from '../types';
import { replayProjectCommand } from '../lib/projectCommandReplay';

interface ProjectStoreState extends ProjectState {
  setConfirmed: (version: number, snapshot: ProjectSnapshot) => void;
  addPending: (pending: PendingCommand) => void;
  resolvePending: (requestId: string, newVersion: number, snapshot: ProjectSnapshot) => void;
  rejectPending: (requestId: string) => void;
  setDragPreview: (preview: { command: FrontendProjectCommand; snapshot: ProjectSnapshot } | undefined) => void;
  getVisibleTasks: () => Task[];
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  confirmed: { version: 0, snapshot: { tasks: [], dependencies: [] } },
  pending: [],
  dragPreview: undefined,

  setConfirmed: (version, snapshot) => set({ confirmed: { version, snapshot } }),
  addPending: (pending) => set((state) => ({ pending: [...state.pending, pending] })),
  resolvePending: (requestId, newVersion, snapshot) => set((state) => ({
    confirmed: { version: newVersion, snapshot },
    pending: state.pending.filter((p) => p.requestId !== requestId),
  })),
  rejectPending: (requestId) => set((state) => ({
    pending: state.pending.filter((p) => p.requestId !== requestId),
  })),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  getVisibleTasks: () => {
    const state = get();
    if (state.dragPreview) return state.dragPreview.snapshot.tasks;

    const visibleSnapshot = state.pending.reduce(
      (snapshot, pending) => replayProjectCommand(snapshot, pending.command, { businessDays: false }, pending.requestId),
      state.confirmed.snapshot,
    );

    return visibleSnapshot.tasks;
  },
}));
