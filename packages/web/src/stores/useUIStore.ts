import { create } from 'zustand';

import type { DependencyError, Task } from '../types';

export type SidebarMode = 'closed' | 'overlay' | 'sidebar';
export type SavingState = 'idle' | 'saving' | 'saved' | 'error';
export type ShareStatus = 'idle' | 'creating' | 'copied' | 'error';
export type ViewMode = 'day' | 'week' | 'month';
const SIDEBAR_STATE_KEY = 'gantt_sidebar_state';
const PROJECT_CHAT_OPEN_KEY = 'gantt_project_chat_open';

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readSidebarState(): SidebarMode {
  if (!canUseDOM()) {
    return 'closed';
  }

  const stored = window.localStorage.getItem(SIDEBAR_STATE_KEY);
  return stored === 'overlay' || stored === 'sidebar' || stored === 'closed'
    ? stored
    : 'closed';
}

function persistSidebarState(sidebarState: SidebarMode): void {
  if (!canUseDOM()) {
    return;
  }

  window.localStorage.setItem(SIDEBAR_STATE_KEY, sidebarState);
}

export function readProjectChatOpenState(): boolean {
  if (!canUseDOM()) {
    return false;
  }

  return window.localStorage.getItem(PROJECT_CHAT_OPEN_KEY) === 'true';
}

function persistProjectChatOpenState(chatOpen: boolean): void {
  if (!canUseDOM()) {
    return;
  }

  window.localStorage.setItem(PROJECT_CHAT_OPEN_KEY, String(chatOpen));
}

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

export type PendingPostAuthAction =
  | {
    kind: 'send_prompt';
    prompt: string;
    sourceProjectState: 'empty' | 'non_empty';
  }
  | null;

interface UIState {
  workspace: WorkspaceMode;
  pendingPostAuthAction: PendingPostAuthAction;
  showOtpModal: boolean;
  showEditProjectModal: boolean;
  showBillingPage: boolean;
  sidebarState: SidebarMode;
  viewMode: ViewMode;
  showTaskList: boolean;
  showChart: boolean;
  autoSchedule: boolean;
  highlightExpiredTasks: boolean;
  disableTaskDrag: boolean;
  validationErrors: DependencyError[];
  shareStatus: ShareStatus;
  shareLinkUrl: string | null;
  savingState: SavingState;
  showHistoryPanel: boolean;
  historyRefreshRevision: number;
  // Filter state
  filterWithoutDeps: boolean;
  filterExpired: boolean;
  filterSearchText: string;
  filterDateFrom: string;
  filterDateTo: string;
  filterMode: 'highlight' | 'hide';
  // Search state
  searchQuery: string;
  searchResults: string[];
  searchIndex: number;
  tempHighlightedTaskId: string | null;
  setWorkspace: (workspace: WorkspaceMode | ((current: WorkspaceMode) => WorkspaceMode)) => void;
  setPendingPostAuthAction: (action: PendingPostAuthAction) => void;
  setShowOtpModal: (visible: boolean) => void;
  setShowEditProjectModal: (visible: boolean) => void;
  setShowBillingPage: (visible: boolean) => void;
  setSidebarState: (state: SidebarMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setShowTaskList: (visible: boolean) => void;
  setShowChart: (visible: boolean) => void;
  setAutoSchedule: (enabled: boolean) => void;
  setHighlightExpiredTasks: (enabled: boolean) => void;
  setDisableTaskDrag: (enabled: boolean) => void;
  setValidationErrors: (errors: DependencyError[]) => void;
  setShareStatus: (status: ShareStatus) => void;
  setShareLinkUrl: (url: string | null) => void;
  setSavingState: (status: SavingState) => void;
  setShowHistoryPanel: (visible: boolean) => void;
  bumpHistoryRefreshRevision: () => void;
  // Filter actions
  setFilterWithoutDeps: (value: boolean) => void;
  setFilterExpired: (value: boolean) => void;
  setFilterSearchText: (value: string) => void;
  setFilterDateFrom: (value: string) => void;
  setFilterDateTo: (value: string) => void;
  setFilterMode: (value: 'highlight' | 'hide') => void;
  resetFilters: () => void;
  // Search actions
  setSearchQuery: (query: string, tasks: Task[]) => void;
  navNext: () => void;
  navPrev: () => void;
  clearSearch: () => void;
  setTempHighlightedTaskId: (taskId: string | null) => void;
}

const initialWorkspace: WorkspaceMode = { kind: 'guest' };

export const useUIStore = create<UIState>()((set, get) => ({
  workspace: initialWorkspace,
  pendingPostAuthAction: null,
  showOtpModal: false,
  showEditProjectModal: false,
  showBillingPage: false,
  sidebarState: readSidebarState(),
  viewMode: 'day',
  showTaskList: true,
  showChart: true,
  autoSchedule: true,
  highlightExpiredTasks: true,
  disableTaskDrag: false,
  validationErrors: [],
  shareStatus: 'idle',
  shareLinkUrl: null,
  savingState: 'idle',
  showHistoryPanel: false,
  historyRefreshRevision: 0,
  filterWithoutDeps: false,
  filterExpired: false,
  filterSearchText: '',
  filterDateFrom: '',
  filterDateTo: '',
  filterMode: 'highlight',
  searchQuery: '',
  searchResults: [],
  searchIndex: -1,
  tempHighlightedTaskId: null,
  setWorkspace: (workspace) => {
    set((state) => {
      const nextWorkspace = typeof workspace === 'function' ? workspace(state.workspace) : workspace;

      if (nextWorkspace.kind === 'project') {
        persistProjectChatOpenState(nextWorkspace.chatOpen);
      }

      return { workspace: nextWorkspace };
    });
  },
  setPendingPostAuthAction: (pendingPostAuthAction) => set({ pendingPostAuthAction }),
  setShowOtpModal: (showOtpModal) => set({ showOtpModal }),
  setShowEditProjectModal: (showEditProjectModal) => set({ showEditProjectModal }),
  setShowBillingPage: (showBillingPage) => set({ showBillingPage }),
  setSidebarState: (sidebarState) => {
    persistSidebarState(sidebarState);
    set({ sidebarState });
  },
  setViewMode: (viewMode) => set({ viewMode }),
  setShowTaskList: (showTaskList) => set({ showTaskList }),
  setShowChart: (showChart) => set({ showChart }),
  setAutoSchedule: (autoSchedule) => set({ autoSchedule }),
  setHighlightExpiredTasks: (highlightExpiredTasks) => set({ highlightExpiredTasks }),
  setDisableTaskDrag: (disableTaskDrag) => set({ disableTaskDrag }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
  setShareStatus: (shareStatus) => set({ shareStatus }),
  setShareLinkUrl: (shareLinkUrl) => set({ shareLinkUrl }),
  setSavingState: (savingState) => set({ savingState }),
  setShowHistoryPanel: (showHistoryPanel) => set({ showHistoryPanel }),
  bumpHistoryRefreshRevision: () => set((state) => ({ historyRefreshRevision: state.historyRefreshRevision + 1 })),
  setFilterWithoutDeps: (filterWithoutDeps) => set({ filterWithoutDeps }),
  setFilterExpired: (filterExpired) => set({ filterExpired }),
  setFilterSearchText: (filterSearchText) => set({ filterSearchText }),
  setFilterDateFrom: (filterDateFrom) => set({ filterDateFrom }),
  setFilterDateTo: (filterDateTo) => set({ filterDateTo }),
  setFilterMode: (filterMode) => set({ filterMode }),
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
  setTempHighlightedTaskId: (taskId) => set({ tempHighlightedTaskId: taskId }),
}));
