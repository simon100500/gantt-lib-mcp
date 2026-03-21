import { create } from 'zustand';

import type { DependencyError, Task } from '../types';

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
  // Filter state
  filterWithoutDeps: boolean;
  filterExpired: boolean;
  filterSearchText: string;
  filterDateFrom: string;
  filterDateTo: string;
  // Search state
  searchQuery: string;
  searchResults: string[];
  searchIndex: number;
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
  // Filter actions
  setFilterWithoutDeps: (value: boolean) => void;
  setFilterExpired: (value: boolean) => void;
  setFilterSearchText: (value: string) => void;
  setFilterDateFrom: (value: string) => void;
  setFilterDateTo: (value: string) => void;
  resetFilters: () => void;
  // Search actions
  setSearchQuery: (query: string, tasks: Task[]) => void;
  navNext: () => void;
  navPrev: () => void;
  clearSearch: () => void;
}

const initialWorkspace: WorkspaceMode = { kind: 'guest' };

export const useUIStore = create<UIState>()((set, get) => ({
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
  filterWithoutDeps: false,
  filterExpired: false,
  filterSearchText: '',
  filterDateFrom: '',
  filterDateTo: '',
  searchQuery: '',
  searchResults: [],
  searchIndex: -1,
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
  setFilterWithoutDeps: (filterWithoutDeps) => set({ filterWithoutDeps }),
  setFilterExpired: (filterExpired) => set({ filterExpired }),
  setFilterSearchText: (filterSearchText) => set({ filterSearchText }),
  setFilterDateFrom: (filterDateFrom) => set({ filterDateFrom }),
  setFilterDateTo: (filterDateTo) => set({ filterDateTo }),
  resetFilters: () => set({
    filterWithoutDeps: false,
    filterExpired: false,
    filterSearchText: '',
    filterDateFrom: '',
    filterDateTo: '',
  }),
  setSearchQuery: (query, tasks) => {
    const normalizedQuery = query.trim().toLowerCase();
    const results = normalizedQuery
      ? tasks
        .filter((task) =>
          task.name
            .toLowerCase()
            .split(/\s+/)
            .some((word) => word.startsWith(normalizedQuery))
        )
        .map((task) => task.id)
      : [];
    set({
      searchQuery: query,
      searchResults: results,
      searchIndex: results.length > 0 ? 0 : -1,
    });
  },
  navNext: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const nextIndex = (state.searchIndex + 1) % state.searchResults.length;
    set({ searchIndex: nextIndex });
  },
  navPrev: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const prevIndex = state.searchIndex === 0 ? state.searchResults.length - 1 : state.searchIndex - 1;
    set({ searchIndex: prevIndex });
  },
  clearSearch: () => set({
    searchQuery: '',
    searchResults: [],
    searchIndex: -1,
  }),
}));
