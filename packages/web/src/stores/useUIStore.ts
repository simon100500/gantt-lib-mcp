import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DependencyError } from '../types';

export type SavingState = 'idle' | 'saving' | 'saved' | 'error';
export type ShareStatus = 'idle' | 'creating' | 'copied' | 'error';
export type ViewMode = 'day' | 'week' | 'month';

export type WorkspaceMode =
  | { kind: 'guest' }
  | { kind: 'shared' }
  | { kind: 'project'; projectId: string; chatOpen: boolean }
  | {
    kind: 'draft';
    draftName: string;
    queuedPrompt: string | null;
    activation: 'idle' | 'creating' | 'switching' | 'ready';
  };

interface UIState {
  workspace: WorkspaceMode;
  showOtpModal: boolean;
  showEditProjectModal: boolean;
  projectSidebarVisible: boolean;
  viewMode: ViewMode;
  showTaskList: boolean;
  autoSchedule: boolean;
  highlightExpiredTasks: boolean;
  validationErrors: DependencyError[];
  shareStatus: ShareStatus;
  savingState: SavingState;
  setWorkspace: (workspace: WorkspaceMode | ((current: WorkspaceMode) => WorkspaceMode)) => void;
  setShowOtpModal: (visible: boolean) => void;
  setShowEditProjectModal: (visible: boolean) => void;
  setProjectSidebarVisible: (visible: boolean) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setShowTaskList: (visible: boolean) => void;
  setAutoSchedule: (enabled: boolean) => void;
  setHighlightExpiredTasks: (enabled: boolean) => void;
  setValidationErrors: (errors: DependencyError[]) => void;
  setShareStatus: (status: ShareStatus) => void;
  setSavingState: (status: SavingState) => void;
}

const initialWorkspace: WorkspaceMode = { kind: 'guest' };

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      workspace: initialWorkspace,
      showOtpModal: false,
      showEditProjectModal: false,
      projectSidebarVisible: false,
      viewMode: 'day',
      showTaskList: true,
      autoSchedule: true,
      highlightExpiredTasks: true,
      validationErrors: [],
      shareStatus: 'idle',
      savingState: 'idle',
      setWorkspace: (workspace) => {
        set((state) => ({
          workspace: typeof workspace === 'function' ? workspace(state.workspace) : workspace,
        }));
      },
      setShowOtpModal: (showOtpModal) => set({ showOtpModal }),
      setShowEditProjectModal: (showEditProjectModal) => set({ showEditProjectModal }),
      setProjectSidebarVisible: (projectSidebarVisible) => set({ projectSidebarVisible }),
      setViewMode: (viewMode) => set({ viewMode }),
      setShowTaskList: (showTaskList) => set({ showTaskList }),
      setAutoSchedule: (autoSchedule) => set({ autoSchedule }),
      setHighlightExpiredTasks: (highlightExpiredTasks) => set({ highlightExpiredTasks }),
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      setShareStatus: (shareStatus) => set({ shareStatus }),
      setSavingState: (savingState) => set({ savingState }),
    }),
    {
      name: 'gantt_ui_storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        showTaskList: state.showTaskList,
        autoSchedule: state.autoSchedule,
        highlightExpiredTasks: state.highlightExpiredTasks,
      }),
    }
  )
);
