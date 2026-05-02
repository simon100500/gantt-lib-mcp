import { useCallback } from 'react';
import type { Task } from '../types';
import type { TemplateItem, TemplateWorkspaceResponse } from '../lib/apiTypes';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useAuthStore } from '../stores/useAuthStore';

type CreateTemplateSelectionInput = {
  name: string;
  rootTaskIds: string[];
};

type InsertTemplateInput = {
  templateId: string;
  anchorTaskId: string;
  placement: 'after' | 'inside';
};

export function useTemplates(accessToken: string | null) {
  const templates = useTemplateStore((state) => state.templates);
  const activeTemplate = useTemplateStore((state) => state.activeTemplate);
  const loadingList = useTemplateStore((state) => state.loadingList);
  const loadingTemplate = useTemplateStore((state) => state.loadingTemplate);
  const savingTemplate = useTemplateStore((state) => state.savingTemplate);
  const error = useTemplateStore((state) => state.error);
  const setTemplates = useTemplateStore((state) => state.setTemplates);
  const setActiveTemplate = useTemplateStore((state) => state.setActiveTemplate);
  const updateActiveTemplateTasks = useTemplateStore((state) => state.updateActiveTemplateTasks);
  const updateActiveTemplateMetadata = useTemplateStore((state) => state.updateActiveTemplateMetadata);
  const setLoadingList = useTemplateStore((state) => state.setLoadingList);
  const setLoadingTemplate = useTemplateStore((state) => state.setLoadingTemplate);
  const setSavingTemplate = useTemplateStore((state) => state.setSavingTemplate);
  const setError = useTemplateStore((state) => state.setError);

  const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    let token = accessToken ?? localStorage.getItem('gantt_access_token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const perform = async (bearer: string) => fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${bearer}`,
      },
    });

    let response = await perform(token);
    if (response.status === 401) {
      const refreshed = await useAuthStore.getState().refreshAccessToken();
      if (!refreshed) {
        throw new Error('Unauthorized');
      }
      token = refreshed;
      response = await perform(token);
    }

    return response;
  }, [accessToken]);

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/templates');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as { templates: TemplateItem[] };
      setTemplates(data.templates);
      return data.templates;
    } finally {
      setLoadingList(false);
    }
  }, [fetchWithAuth, setError, setLoadingList, setTemplates]);

  const openTemplate = useCallback(async (templateId: string) => {
    setLoadingTemplate(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/templates/${templateId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as TemplateWorkspaceResponse;
      setActiveTemplate(data);
      return data;
    } finally {
      setLoadingTemplate(false);
    }
  }, [fetchWithAuth, setActiveTemplate, setError, setLoadingTemplate]);

  const createTemplateFromProject = useCallback(async (name: string) => {
    const response = await fetchWithAuth('/api/templates/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    await loadTemplates();
  }, [fetchWithAuth, loadTemplates]);

  const createTemplateFromSelection = useCallback(async (input: CreateTemplateSelectionInput) => {
    const response = await fetchWithAuth('/api/templates/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    await loadTemplates();
  }, [fetchWithAuth, loadTemplates]);

  const renameTemplate = useCallback(async (templateId: string, name: string) => {
    const response = await fetchWithAuth(`/api/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const updated = await response.json() as TemplateItem;
    setTemplates(templates.map((template) => template.id === templateId ? updated : template));
    if (activeTemplate?.metadata.id === templateId) {
      updateActiveTemplateMetadata({ name: updated.name, updatedAt: updated.updatedAt });
    }
  }, [activeTemplate?.metadata.id, fetchWithAuth, setTemplates, templates, updateActiveTemplateMetadata]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    const response = await fetchWithAuth(`/api/templates/${templateId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    setTemplates(templates.filter((template) => template.id !== templateId));
    if (activeTemplate?.metadata.id === templateId) {
      setActiveTemplate(null);
    }
  }, [activeTemplate?.metadata.id, fetchWithAuth, setActiveTemplate, setTemplates, templates]);

  const saveTemplateSnapshot = useCallback(async (tasks: Task[], name?: string) => {
    if (!activeTemplate) {
      return;
    }
    setSavingTemplate(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/templates/${activeTemplate.metadata.id}/snapshot`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name ?? activeTemplate.metadata.name,
          snapshot: {
            tasks,
            dependencies: tasks.flatMap((task, index) => (
              (task.dependencies ?? []).map((dependency, depIndex) => ({
                id: `${task.id}:${dependency.taskId}:${index}:${depIndex}`,
                taskId: task.id,
                depTaskId: dependency.taskId,
                type: dependency.type,
                lag: dependency.lag ?? 0,
              }))
            )),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      updateActiveTemplateTasks(tasks);
      await loadTemplates();
    } finally {
      setSavingTemplate(false);
    }
  }, [activeTemplate, fetchWithAuth, loadTemplates, setError, setSavingTemplate, updateActiveTemplateTasks]);

  const insertTemplateIntoProject = useCallback(async (input: InsertTemplateInput) => {
    const response = await fetchWithAuth(`/api/templates/${input.templateId}/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anchorTaskId: input.anchorTaskId,
        placement: input.placement,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<{
      accepted: true;
      newVersion: number;
      snapshot?: { tasks: Task[]; dependencies: Array<{ id: string; taskId: string; depTaskId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }> };
    }>;
  }, [fetchWithAuth]);

  return {
    templates,
    activeTemplate,
    loadingList,
    loadingTemplate,
    savingTemplate,
    error,
    loadTemplates,
    openTemplate,
    createTemplateFromProject,
    createTemplateFromSelection,
    renameTemplate,
    deleteTemplate,
    saveTemplateSnapshot,
    insertTemplateIntoProject,
  };
}
