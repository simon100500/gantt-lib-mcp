import { useCallback, useState } from 'react';

import type { Task } from '../../types.ts';
import { collectTaskSubtreeIds } from '../../lib/shareLinkSelection.ts';
import { useUIStore } from '../../stores/useUIStore.ts';

type SaveTemplateDraft = {
  mode: 'project' | 'selection';
  initialName: string;
  taskCount: number;
  rootTaskIds: string[];
} | null;

type InsertTemplateDraft = {
  anchorTaskId: string;
  anchorTaskName: string;
} | null;

export function useShareTemplateSelectionController(params: {
  visibleTasks: Task[];
  accessToken: string | null;
  project: { id: string; name: string } | null;
}) {
  const { visibleTasks, accessToken, project } = params;
  const setShareStatus = useUIStore((state) => state.setShareStatus);

  // Partial-share and template-selection local workflow state.
  const [shareSelectionMode, setShareSelectionMode] = useState(false);
  const [selectedShareTaskIds, setSelectedShareTaskIds] = useState<Set<string>>(new Set());
  const [templateSelectionMode, setTemplateSelectionMode] = useState(false);
  const [selectedTemplateTaskIds, setSelectedTemplateTaskIds] = useState<Set<string>>(new Set());
  const [saveTemplateDraft, setSaveTemplateDraft] = useState<SaveTemplateDraft>(null);
  const [insertTemplateDraft, setInsertTemplateDraft] = useState<InsertTemplateDraft>(null);
  const [saveTemplatePending, setSaveTemplatePending] = useState(false);
  const [insertTemplatePending, setInsertTemplatePending] = useState(false);

  const resetShareSelection = useCallback(() => {
    setSelectedShareTaskIds(new Set());
    setShareSelectionMode(false);
    setShareStatus('idle');
  }, [setShareStatus]);

  const resetTemplateSelection = useCallback(() => {
    setSelectedTemplateTaskIds(new Set());
    setTemplateSelectionMode(false);
  }, []);

  const handleStartPartialShareSelection = useCallback(() => {
    setTemplateSelectionMode(false);
    setSelectedTemplateTaskIds(new Set());
    setSelectedShareTaskIds(new Set());
    setShareSelectionMode(true);
    useUIStore.getState().setShowShareManager(false);
    setShareStatus('idle');
  }, [setShareStatus]);

  const handlePartialShareSelectionChange = useCallback((nextSelectedTaskIds: Set<string>) => {
    setSelectedShareTaskIds((previousSelectedTaskIds) => {
      const added = Array.from(nextSelectedTaskIds).filter((id) => !previousSelectedTaskIds.has(id));
      const removed = Array.from(previousSelectedTaskIds).filter((id) => !nextSelectedTaskIds.has(id));
      if (added.length + removed.length !== 1) {
        return nextSelectedTaskIds;
      }

      const changedTaskId = added[0] ?? removed[0];
      if (!changedTaskId) {
        return nextSelectedTaskIds;
      }

      const subtreeIds = collectTaskSubtreeIds(visibleTasks, changedTaskId);
      if (subtreeIds.length <= 1) {
        return nextSelectedTaskIds;
      }

      const normalized = new Set(nextSelectedTaskIds);
      const shouldSelect = added.length === 1;
      for (const taskId of subtreeIds) {
        if (shouldSelect) {
          normalized.add(taskId);
        } else {
          normalized.delete(taskId);
        }
      }
      return normalized;
    });
  }, [visibleTasks]);

  const handleStartTemplateSelection = useCallback(() => {
    setShareSelectionMode(false);
    setSelectedShareTaskIds(new Set());
    setSelectedTemplateTaskIds(new Set());
    setTemplateSelectionMode(true);
  }, []);

  const handleTemplateSelectionChange = useCallback((nextSelectedTaskIds: Set<string>) => {
    setSelectedTemplateTaskIds((previousSelectedTaskIds) => {
      const added = Array.from(nextSelectedTaskIds).filter((id) => !previousSelectedTaskIds.has(id));
      const removed = Array.from(previousSelectedTaskIds).filter((id) => !nextSelectedTaskIds.has(id));
      if (added.length + removed.length !== 1) {
        return nextSelectedTaskIds;
      }

      const changedTaskId = added[0] ?? removed[0];
      if (!changedTaskId) {
        return nextSelectedTaskIds;
      }

      const subtreeIds = collectTaskSubtreeIds(visibleTasks, changedTaskId);
      if (subtreeIds.length <= 1) {
        return nextSelectedTaskIds;
      }

      const normalized = new Set(nextSelectedTaskIds);
      const shouldSelect = added.length === 1;
      for (const taskId of subtreeIds) {
        if (shouldSelect) {
          normalized.add(taskId);
        } else {
          normalized.delete(taskId);
        }
      }
      return normalized;
    });
  }, [visibleTasks]);

  const handleConfirmTemplateSelection = useCallback(() => {
    if (selectedTemplateTaskIds.size === 0) {
      return;
    }

    const selectedTasks = visibleTasks.filter((task) => selectedTemplateTaskIds.has(task.id));
    const initialName = selectedTasks.find((task) => !task.parentId || !selectedTemplateTaskIds.has(task.parentId))?.name ?? 'Новый шаблон';
    setSaveTemplateDraft({
      mode: 'selection',
      initialName,
      taskCount: selectedTasks.length,
      rootTaskIds: Array.from(selectedTemplateTaskIds),
    });
  }, [selectedTemplateTaskIds, visibleTasks]);

  const handleCreateTemplateFromTask = useCallback((task: Task) => {
    setShareSelectionMode(false);
    setSelectedShareTaskIds(new Set());
    setSelectedTemplateTaskIds(new Set(collectTaskSubtreeIds(visibleTasks, task.id)));
    setTemplateSelectionMode(true);
  }, [visibleTasks]);

  // Partial-share submission and completion state.
  const handleSubmitPartialShareSelection = useCallback(async () => {
    if (!accessToken || !project || selectedShareTaskIds.size === 0) {
      return;
    }

    try {
      setShareStatus('creating');
      const response = await fetch(`/api/projects/${project.id}/share-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'task_selection',
          includedTaskIds: Array.from(selectedShareTaskIds),
          label: project.name,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setSelectedShareTaskIds(new Set());
      setShareSelectionMode(false);
      useUIStore.getState().setShowShareManager(true);
      setShareStatus('idle');
    } catch (error) {
      console.error('Failed to create partial share link:', error);
      setShareStatus('error');
      window.setTimeout(() => {
        if (useUIStore.getState().shareStatus === 'error') {
          useUIStore.getState().setShareStatus('idle');
        }
      }, 2500);
    }
  }, [accessToken, project, selectedShareTaskIds, setShareStatus]);

  return {
    shareSelectionMode,
    selectedShareTaskIds,
    templateSelectionMode,
    selectedTemplateTaskIds,
    saveTemplateDraft,
    insertTemplateDraft,
    saveTemplatePending,
    insertTemplatePending,
    setSaveTemplateDraft,
    setInsertTemplateDraft,
    setSaveTemplatePending,
    setInsertTemplatePending,
    setSelectedTemplateTaskIds,
    setShareSelectionMode,
    setTemplateSelectionMode,
    resetShareSelection,
    resetTemplateSelection,
    handleStartPartialShareSelection,
    handlePartialShareSelectionChange,
    handleStartTemplateSelection,
    handleTemplateSelectionChange,
    handleConfirmTemplateSelection,
    handleCreateTemplateFromTask,
    handleSubmitPartialShareSelection,
  };
}
