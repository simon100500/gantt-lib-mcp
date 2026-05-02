import { create } from 'zustand';
import type { ProjectDependency, Task } from '../types';
import type { TemplateItem, TemplateWorkspaceResponse } from '../lib/apiTypes';

interface TemplateStoreState {
  templates: TemplateItem[];
  activeTemplate: TemplateWorkspaceResponse | null;
  loadingList: boolean;
  loadingTemplate: boolean;
  savingTemplate: boolean;
  error: string | null;
  setTemplates: (templates: TemplateItem[]) => void;
  setActiveTemplate: (template: TemplateWorkspaceResponse | null) => void;
  updateActiveTemplateTasks: (tasks: Task[]) => void;
  updateActiveTemplateMetadata: (metadata: Partial<TemplateItem>) => void;
  setLoadingList: (loading: boolean) => void;
  setLoadingTemplate: (loading: boolean) => void;
  setSavingTemplate: (saving: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useTemplateStore = create<TemplateStoreState>((set) => ({
  templates: [],
  activeTemplate: null,
  loadingList: false,
  loadingTemplate: false,
  savingTemplate: false,
  error: null,
  setTemplates: (templates) => set({ templates }),
  setActiveTemplate: (activeTemplate) => set({ activeTemplate }),
  updateActiveTemplateTasks: (tasks) => set((state) => (
    state.activeTemplate
      ? {
          activeTemplate: {
            ...state.activeTemplate,
            snapshot: {
              tasks,
              dependencies: buildDependencies(tasks),
            },
          },
        }
      : state
  )),
  updateActiveTemplateMetadata: (metadata) => set((state) => (
    state.activeTemplate
      ? {
          activeTemplate: {
            ...state.activeTemplate,
            metadata: {
              ...state.activeTemplate.metadata,
              ...metadata,
            },
          },
        }
      : state
  )),
  setLoadingList: (loadingList) => set({ loadingList }),
  setLoadingTemplate: (loadingTemplate) => set({ loadingTemplate }),
  setSavingTemplate: (savingTemplate) => set({ savingTemplate }),
  setError: (error) => set({ error }),
  clear: () => set({
    templates: [],
    activeTemplate: null,
    loadingList: false,
    loadingTemplate: false,
    savingTemplate: false,
    error: null,
  }),
}));

function buildDependencies(tasks: Task[]): ProjectDependency[] {
  return tasks.flatMap((task, index) => (
    (task.dependencies ?? []).map((dependency, depIndex) => ({
      id: `${task.id}:${dependency.taskId}:${index}:${depIndex}`,
      taskId: task.id,
      depTaskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    }))
  ));
}
