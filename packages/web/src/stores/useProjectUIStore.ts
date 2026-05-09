import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ViewMode } from './useUIStore.ts';
import type { ResourceTableColumnWidthMap, TaskDateChangeMode, TaskListColumnWidthMap } from 'gantt-lib';

interface ProjectBaselineSelectionState {
  id: string;
  label: string;
  snapshot: {
    tasks: unknown[];
    dependencies: unknown[];
    resources?: unknown[];
    assignments?: unknown[];
  };
}

interface ProjectUIState {
  viewMode: ViewMode;
  activeWorkspace: 'project' | 'planner' | 'finance';
  collapsedParentIds: string[];
  disableTaskDrag: boolean;
  taskDateChangeMode: TaskDateChangeMode;
  hiddenTaskListColumns: string[];
  hiddenFinanceTaskListColumns: string[];
  taskListColumnWidths: TaskListColumnWidthMap;
  financeTaskListColumnWidths: TaskListColumnWidthMap;
  plannerResourceTableColumnWidths: ResourceTableColumnWidthMap;
  selectedBaseline: ProjectBaselineSelectionState | null;
  selectedBaselineVisible: boolean;
  plannerSelectedAssignmentId: string | null;
  ganttScrollLeft: number;
  ganttScrollTop: number;
  plannerScrollLeft: number;
  plannerScrollTop: number;
  financeScrollLeft: number;
  financeScrollTop: number;
}

interface ProjectUIStore {
  projectStates: Record<string, ProjectUIState>;
  getProjectState: (projectId: string) => ProjectUIState | null;
  setProjectState: (projectId: string, state: Partial<ProjectUIState>) => void;
  clearProjectState: (projectId: string) => void;
}

export const DEFAULT_NEW_PROJECT_HIDDEN_TASK_LIST_COLUMNS = [
  'work-volume',
  'completed-volume',
  'status',
  'assigned-resources',
] as const;

const DEFAULT_STATE: ProjectUIState = {
  viewMode: 'day',
  activeWorkspace: 'project',
  collapsedParentIds: [],
  disableTaskDrag: false,
  taskDateChangeMode: 'preserve-duration',
  hiddenTaskListColumns: [],
  hiddenFinanceTaskListColumns: [],
  taskListColumnWidths: {},
  financeTaskListColumnWidths: {},
  plannerResourceTableColumnWidths: {},
  selectedBaseline: null,
  selectedBaselineVisible: false,
  plannerSelectedAssignmentId: null,
  ganttScrollLeft: 0,
  ganttScrollTop: 0,
  plannerScrollLeft: 0,
  plannerScrollTop: 0,
  financeScrollLeft: 0,
  financeScrollTop: 0,
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
        set((store) => {
          const currentState = store.projectStates[projectId];
          return {
            projectStates: {
              ...store.projectStates,
              [projectId]: {
                ...DEFAULT_STATE,
                ...currentState,
                ...partialState,
              },
            },
          };
        });
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
