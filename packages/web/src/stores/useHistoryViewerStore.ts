import { create } from 'zustand';

import type { ProjectSnapshot } from '../types';

export type HistoryViewerState =
  | { mode: 'inactive' }
  | {
      mode: 'preview';
      groupId: string;
      snapshot: ProjectSnapshot;
      isCurrent: boolean;
    };

interface HistoryViewerStoreState {
  historyViewer: HistoryViewerState;
  enterPreview: (preview: { groupId: string; snapshot: ProjectSnapshot; isCurrent: boolean }) => void;
  exitPreview: () => void;
  clearAfterRestore: () => void;
}

const inactiveState: HistoryViewerState = { mode: 'inactive' };

export const useHistoryViewerStore = create<HistoryViewerStoreState>((set) => ({
  historyViewer: inactiveState,
  enterPreview: ({ groupId, snapshot, isCurrent }) => set({
    historyViewer: {
      mode: 'preview',
      groupId,
      snapshot,
      isCurrent,
    },
  }),
  exitPreview: () => set({ historyViewer: inactiveState }),
  clearAfterRestore: () => set({ historyViewer: inactiveState }),
}));
