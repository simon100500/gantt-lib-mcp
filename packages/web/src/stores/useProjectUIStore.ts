import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ViewMode } from './useUIStore.ts';

interface ProjectUIState {
  viewMode: ViewMode;
  collapsedParentIds: string[];
}

interface ProjectUIStore {
  projectStates: Record<string, ProjectUIState>;
  getProjectState: (projectId: string) => ProjectUIState | null;
  setProjectState: (projectId: string, state: Partial<ProjectUIState>) => void;
  clearProjectState: (projectId: string) => void;
}

const DEFAULT_STATE: ProjectUIState = {
  viewMode: 'day',
  collapsedParentIds: [],
};

export const useProjectUIStore = create<ProjectUIStore>()(
  persist(
    (set, get) => ({
      projectStates: {},

      getProjectState: (projectId) => {
        const state = get().projectStates[projectId];
        return state || null;
      },

      setProjectState: (projectId, partialState) => {
        set((store) => ({
          projectStates: {
            ...store.projectStates,
            [projectId]: {
              ...store.projectStates[projectId],
              ...DEFAULT_STATE,
              ...partialState,
            },
          },
        }));
      },

      clearProjectState: (projectId) => {
        set((store) => {
          const newStates = { ...store.projectStates };
          delete newStates[projectId];
          return { projectStates: newStates };
        });
      },
    }),
    {
      name: 'gantt_project_ui_storage',
    }
  )
);
