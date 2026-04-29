import type { Ref, RefObject } from 'react';
import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { Check, ListTree, LoaderCircle, MessageSquare, WandSparkles } from 'lucide-react';
import { reflowTasksOnModeSwitch } from 'gantt-lib';
import type { TaskListColumn, TaskListMenuCommand } from 'gantt-lib';

import { ChatSidebar } from '../ChatSidebar.tsx';
import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { HistoryPanel } from '../HistoryPanel.tsx';
import { SplitTaskModal } from '../SplitTaskModal.tsx';
import { TaskChatModal } from '../TaskChatModal.tsx';
import { CreateResourceModal } from './CreateResourceModal.tsx';
import { ResourceAssignmentModal } from './ResourceAssignmentModal.tsx';
import { createAssignedResourcesColumn } from './AssignedResourcesColumn.tsx';
import type { StartScreenSendResult } from '../StartScreen.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { buildCustomDays, getProjectWeekendPredicate } from '../../lib/projectScheduleOptions.ts';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useProjectHistory } from '../../hooks/useProjectHistory.ts';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import type { SubscriptionStatus, UsageStatus } from '../../stores/useBillingStore.ts';
import { useHistoryViewerStore } from '../../stores/useHistoryViewerStore.ts';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { cn } from '../../lib/utils.ts';
import { buildDefaultBaselineName } from '../../lib/baselineNaming.ts';
import { useProjectBaselines } from '../../hooks/useProjectBaselines.ts';
import type { BaselineSnapshotResponse, ProjectResource, ResourceScope, ResourceType, TaskAssignmentRecord } from '../../lib/apiTypes.ts';
import type { CalendarDay, Task, ValidationResult } from '../../types.ts';
import {
  collectDescendantLeafIds,
  getAssignableResources,
  getInitialSelectedResourceIds,
  getTaskAssignmentResourceGroups,
} from './resourceAssignmentUtils.ts';

interface ProjectWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  accessToken?: string | null;
  sharedProject: SharedTaskProject | null;
  shareToken: string | null;
  hasShareToken: boolean;
  displayConnected: boolean;
  isAuthenticated: boolean;
  chatUsage?: UsageStatus | SubscriptionStatus | null;
  chatDisabled?: boolean;
  chatDisabledReason?: string | null;
  batchUpdate?: UseBatchTaskUpdateResult;
  onSend?: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
  onLoginRequired: () => void;
  onCloseChat?: () => void;
  onToggleChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  isExportExcelLoading?: boolean;
  onValidation: (result: ValidationResult) => void;
  onCascade?: (shiftedTasks: Task[]) => void;
  readOnly?: boolean;
  showChat?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  ganttDayMode: 'business' | 'calendar';
  displayGanttDayMode?: 'business' | 'calendar';
  calendarDays?: CalendarDay[];
  onGanttDayModeChange?: (mode: 'business' | 'calendar') => void;
  previewState?: 'idle' | 'rendering' | 'failed';
  previewMessage?: string | null;
  onSplitTask?: (task: Task, details: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
}

function formatTaskCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} задач`;
  }

  if (mod10 === 1) {
    return `${count} задача`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} задачи`;
  }

  return `${count} задач`;
}

function normalizeProjectResource(payload: unknown): ProjectResource | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const resource = payload as Partial<ProjectResource>;
  if (
    typeof resource.id !== 'string'
    || typeof resource.userId !== 'string'
    || !(typeof resource.projectId === 'string' || resource.projectId === null)
    || !(resource.scope === 'shared' || resource.scope === 'project')
    || typeof resource.name !== 'string'
    || !(resource.type === 'human' || resource.type === 'equipment' || resource.type === 'material' || resource.type === 'other')
    || typeof resource.isActive !== 'boolean'
    || typeof resource.createdAt !== 'string'
    || typeof resource.updatedAt !== 'string'
    || !(typeof resource.deactivatedAt === 'string' || resource.deactivatedAt === null)
  ) {
    return null;
  }

  return resource as ProjectResource;
}

function formatHistoryVersionTimestamp(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCheckpointLabel(groupId: string, createdAt?: string): string {
  if (groupId === 'initial') {
    return 'Исходная версия';
  }

  if (createdAt) {
    return `Версия от ${formatHistoryVersionTimestamp(createdAt)}`;
  }

  return 'Версия';
}

function buildTaskChatMention(task: Task): string {
  return `[task:${task.id}|${task.name}]\n\n`;
}

export function ProjectWorkspace({
  ganttRef,
  tasks,
  setTasks,
  loading,
  accessToken = null,
  sharedProject,
  shareToken,
  hasShareToken,
  displayConnected,
  isAuthenticated,
  chatUsage = null,
  chatDisabled = false,
  chatDisabledReason = null,
  batchUpdate,
  onSend,
  onLoginRequired,
  onCloseChat,
  onToggleChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onExportPdf,
  onExportExcel,
  isExportExcelLoading = false,
  onValidation,
  onCascade,
  readOnly = false,
  showChat = true,
  shareStatus = 'idle',
  onCreateShareLink,
  ganttDayMode,
  displayGanttDayMode,
  calendarDays = [],
  onGanttDayModeChange,
  previewState = 'idle',
  previewMessage = null,
  onSplitTask,
}: ProjectWorkspaceProps) {
  const messages = useChatStore((state) => state.messages);
  const streaming = useChatStore((state) => state.streamingText);
  const aiThinking = useChatStore((state) => state.aiThinking);
  const workspace = useUIStore((state) => state.workspace);
  const savingState = useUIStore((state) => state.savingState);
  const showTaskList = useUIStore((state) => state.showTaskList);
  const showChart = useUIStore((state) => state.showChart);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const showHistoryPanel = useUIStore((state) => state.showHistoryPanel);
  const setShowHistoryPanel = useUIStore((state) => state.setShowHistoryPanel);
  const historyRefreshRevision = useUIStore((state) => state.historyRefreshRevision);
  const aiMutationLock = useUIStore((state) => state.aiMutationLock);
  const searchResults = useUIStore((state) => state.searchResults);
  const filterMode = useUIStore((state) => state.filterMode);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const setChatComposerDraft = useUIStore((state) => state.setChatComposerDraft);
  const setTempHighlightedTaskId = useUIStore((state) => state.setTempHighlightedTaskId);
  const consumePlannerCorrectionTarget = useUIStore((state) => state.consumePlannerCorrectionTarget);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);

  const projectId = workspace.kind === 'project'
    ? workspace.projectId
    : workspace.kind === 'shared'
      ? `shared:${shareToken ?? sharedProject?.id ?? 'unknown'}`
      : null;
  const chatSidebarVisible = showChat && workspace.kind === 'project' && workspace.chatOpen;

  useFilterPersistence();
  const taskFilter = useTaskFilter();

  const projectStates = useProjectUIStore((state) => state.projectStates);
  const resources = useProjectStore((state) => state.resources);
  const assignments = useProjectStore((state) => state.assignments);
  const assignmentError = useProjectStore((state) => state.assignmentError);
  const replaceAssignmentsForTask = useProjectStore((state) => state.replaceAssignmentsForTask);
  const replaceAssignmentsForTasks = useProjectStore((state) => state.replaceAssignmentsForTasks);
  const setAssignmentError = useProjectStore((state) => state.setAssignmentError);
  const clearResourcePlannerCache = useProjectStore((state) => state.clearResourcePlannerCache);
  const upsertResource = useProjectStore((state) => state.upsertResource);
  const collapsedParentIds = useMemo(() => {
    if (!projectId) return new Set<string>();
    const projectState = projectStates[projectId];
    return projectState?.collapsedParentIds
      ? new Set(projectState.collapsedParentIds)
      : new Set<string>();
  }, [projectId, projectStates]);

  const disableTaskDrag = useMemo(() => {
    if (!projectId) return false;
    return projectStates[projectId]?.disableTaskDrag ?? false;
  }, [projectId, projectStates]);
  const selectedBaselineState = useMemo(() => {
    if (!projectId) {
      return null;
    }

    return projectStates[projectId]?.selectedBaseline ?? null;
  }, [projectId, projectStates]);
  const selectedBaselineVisible = useMemo(() => {
    if (!projectId) {
      return false;
    }

    const projectState = projectStates[projectId];
    if (!projectState?.selectedBaseline) {
      return false;
    }

    return projectState.selectedBaselineVisible !== false;
  }, [projectId, projectStates]);
  const [baselineMenuOpen, setBaselineMenuOpen] = useState(false);
  const [assignmentSelectionTaskId, setAssignmentSelectionTaskId] = useState<string | null>(null);
  const [selectedAssignmentResourceIds, setSelectedAssignmentResourceIds] = useState<string[]>([]);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [createAssignmentResourceOpen, setCreateAssignmentResourceOpen] = useState(false);
  const [createAssignmentResourcePending, setCreateAssignmentResourcePending] = useState(false);
  const [createAssignmentResourceError, setCreateAssignmentResourceError] = useState<string | null>(null);
  const historyViewer = useHistoryViewerStore((state) => state.historyViewer);
  const previewModeActive = historyViewer.mode === 'preview';
  const effectiveTasks = historyViewer.mode === 'preview'
    ? historyViewer.snapshot.tasks
    : tasks;
  const previewRendering = previewState === 'rendering';
  const previewFailed = previewState === 'failed';
  const aiMutationLocked = aiMutationLock.active;
  const canOpenChatFromLoader = showChat && !chatSidebarVisible && !hasShareToken && Boolean(onToggleChat);
  const effectiveReadOnly = readOnly || aiMutationLocked || previewRendering || previewFailed || previewModeActive;
  const historyPanelDisabled = readOnly || aiMutationLocked || previewRendering || previewFailed || !accessToken;
  const hasRenderableChart = effectiveTasks.length > 0 || effectiveReadOnly;
  const effectiveDisableTaskDrag = effectiveReadOnly || disableTaskDrag;
  const effectiveChatDisabled = chatDisabled || previewModeActive;
  const effectiveChatDisabledReason = previewModeActive
    ? 'Только чтение. Вернитесь к текущей версии, чтобы продолжить.'
    : chatDisabledReason;
  const handleSetDisableTaskDrag = useCallback((enabled: boolean) => {
    if (!projectId || effectiveReadOnly) return;
    setProjectState(projectId, { disableTaskDrag: enabled });
  }, [effectiveReadOnly, projectId, setProjectState]);

  const handleToggleCollapse = useCallback((parentId: string) => {
    if (!projectId) return;

    const newSet = new Set(collapsedParentIds);
    if (newSet.has(parentId)) {
      newSet.delete(parentId);
    } else {
      newSet.add(parentId);
    }

    setProjectState(projectId, {
      collapsedParentIds: Array.from(newSet),
    });
  }, [projectId, collapsedParentIds, setProjectState]);

  useEffect(() => {
    if (projectId) {
      const projectState = getProjectState(projectId);
      if (projectState?.viewMode) {
        setViewMode(projectState.viewMode);
      }
    }
  }, [projectId, getProjectState, setViewMode]);

  const handleViewModeChange = (newViewMode: 'day' | 'week' | 'month') => {
    setViewMode(newViewMode);
    if (projectId) {
      setProjectState(projectId, { viewMode: newViewMode });
    }
  };

  const viewMode = useUIStore((state) => state.viewMode);
  const tempHighlightedTaskId = useUIStore((state) => state.tempHighlightedTaskId);
  const highlightedSearchTaskIds = useMemo(() => {
    const ids = new Set(searchResults);
    if (tempHighlightedTaskId) {
      ids.add(tempHighlightedTaskId);
    }
    return ids;
  }, [searchResults, tempHighlightedTaskId]);
  const previousGanttDayModeRef = useRef(ganttDayMode);
  const [splitTaskDraft, setSplitTaskDraft] = useState<Task | null>(null);
  const [taskChatDraft, setTaskChatDraft] = useState<Task | null>(null);
  const taskReferenceHighlightTimeoutRef = useRef<number | null>(null);
  const {
    items: historyItems,
    loading: historyLoading,
    error: historyError,
    previewingGroupId,
    restoringGroupId,
    showVersion,
    showVersionById,
    refreshHistory,
    refreshHistorySilently,
    restoreVersion,
    returnToCurrentVersion,
  } = useProjectHistory(accessToken);
  const {
    items: baselineItems,
    loading: baselinesLoading,
    error: baselinesError,
    activeBaselineId,
    refreshBaselines,
    fetchBaseline,
    createFromCurrent,
    creatingFromCurrent,
    creatingFromHistoryGroupId,
    deleteBaseline,
    deletingBaselineId,
    createFromHistory,
  } = useProjectBaselines(accessToken);
  const hasBaselineAccess = Boolean(accessToken && workspace.kind === 'project');
  const selectedBaselineLabel = selectedBaselineState?.label ?? null;
  const selectedBaselineSnapshot = useMemo(() => {
    if (!selectedBaselineState) {
      return null;
    }

    return {
      tasks: Array.isArray(selectedBaselineState.snapshot.tasks)
        ? selectedBaselineState.snapshot.tasks as Task[]
        : [],
      dependencies: Array.isArray(selectedBaselineState.snapshot.dependencies)
        ? selectedBaselineState.snapshot.dependencies as BaselineSnapshotResponse['snapshot']['dependencies']
        : [],
      resources: Array.isArray(selectedBaselineState.snapshot.resources)
        ? selectedBaselineState.snapshot.resources as BaselineSnapshotResponse['snapshot']['resources']
        : [],
      assignments: Array.isArray(selectedBaselineState.snapshot.assignments)
        ? selectedBaselineState.snapshot.assignments as BaselineSnapshotResponse['snapshot']['assignments']
        : [],
    } satisfies BaselineSnapshotResponse['snapshot'];
  }, [selectedBaselineState]);
  const selectedBaselineTaskCount = selectedBaselineSnapshot?.tasks.length ?? 0;
  const effectiveTasksWithBaseline = useMemo(() => {
    if (previewModeActive || !selectedBaselineSnapshot || !selectedBaselineVisible) {
      return effectiveTasks;
    }

    const baselineById = new Map(
      selectedBaselineSnapshot.tasks.map((task) => [task.id, task]),
    );

    return effectiveTasks.map((task) => {
      const baselineTask = baselineById.get(task.id);
      if (!baselineTask?.startDate || !baselineTask?.endDate) {
        return task;
      }

      return {
        ...task,
        baselineStartDate: baselineTask.startDate,
        baselineEndDate: baselineTask.endDate,
      } satisfies Task;
    });
  }, [effectiveTasks, previewModeActive, selectedBaselineSnapshot, selectedBaselineVisible]);
  const baselineRows = useMemo(() => {
    const rows = baselineItems.map((item) => ({
      id: item.id,
      label: item.name || 'Без названия',
      selected: item.id === selectedBaselineState?.id,
    }));

    if (selectedBaselineState && !rows.some((row) => row.id === selectedBaselineState.id)) {
      rows.unshift({
        id: selectedBaselineState.id,
        label: selectedBaselineState.label || 'Без названия',
        selected: true,
      });
    }

    return rows;
  }, [baselineItems, selectedBaselineState]);
  const customDays = useMemo(() => buildCustomDays(calendarDays), [calendarDays]);
  const weekendPredicate = useMemo(
    () => getProjectWeekendPredicate(calendarDays) ?? (() => false),
    [calendarDays],
  );

  useEffect(() => {
    const previousMode = previousGanttDayModeRef.current;
    if (previousMode === ganttDayMode) {
      return;
    }

    previousGanttDayModeRef.current = ganttDayMode;

    if (previewModeActive) {
      return;
    }

    if (tasks.length === 0) {
      return;
    }

    const reflowedTasks = reflowTasksOnModeSwitch(tasks, ganttDayMode === 'business', weekendPredicate) as Task[];

    if (effectiveReadOnly || !batchUpdate) {
      setTasks(reflowedTasks);
      return;
    }
  }, [batchUpdate, effectiveReadOnly, ganttDayMode, previewModeActive, setTasks, tasks, weekendPredicate]);

  const handleAppendTaskToChat = useCallback((task: Task) => {
    setChatComposerDraft(buildTaskChatMention(task));
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
  }, [setChatComposerDraft, setWorkspace]);

  const handleTaskReferenceClick = useCallback((taskId: string) => {
    ganttRef.current?.scrollToRow(taskId);
    setTempHighlightedTaskId(taskId);

    if (taskReferenceHighlightTimeoutRef.current !== null) {
      window.clearTimeout(taskReferenceHighlightTimeoutRef.current);
    }

    taskReferenceHighlightTimeoutRef.current = window.setTimeout(() => {
      setTempHighlightedTaskId(null);
      taskReferenceHighlightTimeoutRef.current = null;
    }, 2000);
  }, [ganttRef, setTempHighlightedTaskId]);

  useEffect(() => () => {
    if (taskReferenceHighlightTimeoutRef.current !== null) {
      window.clearTimeout(taskReferenceHighlightTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const correctionTarget = consumePlannerCorrectionTarget((target) => {
      if (!projectId || target.projectId !== projectId || !target.taskId) {
        return false;
      }
      return true;
    });
    if (!correctionTarget) {
      return;
    }

    handleTaskReferenceClick(correctionTarget.taskId);
  }, [consumePlannerCorrectionTarget, handleTaskReferenceClick, projectId]);

  const handleSplitTaskSubmit = useCallback(async (details: string) => {
    if (!splitTaskDraft || !onSplitTask) {
      return {
        accepted: false,
        message: 'Не удалось определить задачу для разбиения.',
      };
    }

    return await Promise.resolve(onSplitTask(splitTaskDraft, details));
  }, [onSplitTask, splitTaskDraft]);

  const activeResources = useMemo(
    () => getAssignableResources(resources, workspace.kind === 'project' ? workspace.projectId : null),
    [resources, workspace],
  );
  const selectedAssignmentTask = useMemo(
    () => assignmentSelectionTaskId
      ? tasks.find((task) => task.id === assignmentSelectionTaskId) ?? null
      : null,
    [assignmentSelectionTaskId, tasks],
  );

  const selectedAssignmentResourceGroups = useMemo(
    () => getTaskAssignmentResourceGroups(assignmentSelectionTaskId, resources, assignments),
    [assignmentSelectionTaskId, assignments, resources],
  );

  const openAssignmentSelector = useCallback((task: Task) => {
    if (effectiveReadOnly) {
      return;
    }

    const activeResourceIds = new Set(activeResources.map((resource) => resource.id));
    const initialSelection = getInitialSelectedResourceIds(task.id, resources, assignments)
      .filter((resourceId) => activeResourceIds.has(resourceId));

    setAssignmentSelectionTaskId(task.id);
    setSelectedAssignmentResourceIds(initialSelection);
    setAssignmentSubmitting(false);
    setAssignmentError(null);
  }, [activeResources, assignments, effectiveReadOnly, resources, setAssignmentError]);

  const closeAssignmentSelector = useCallback(() => {
    setAssignmentSelectionTaskId(null);
    setSelectedAssignmentResourceIds([]);
    setAssignmentSubmitting(false);
    setCreateAssignmentResourceOpen(false);
    setCreateAssignmentResourcePending(false);
    setCreateAssignmentResourceError(null);
  }, []);

  const handleAssignmentResourceChange = useCallback((resourceIds: string[]) => {
    setSelectedAssignmentResourceIds(resourceIds);
    setAssignmentError(null);
  }, [setAssignmentError]);

  const handleCreateAssignmentResource = useCallback(async (input: { name: string; type: ResourceType; scope: ResourceScope }) => {
    if (!accessToken || effectiveReadOnly || workspace.kind !== 'project') {
      return;
    }

    setCreateAssignmentResourcePending(true);
    setCreateAssignmentResourceError(null);

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: input.name,
          type: input.type,
          scope: input.scope,
          projectId: workspace.projectId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const created = normalizeProjectResource(body);
      if (!created) {
        throw new Error('Resource payload was malformed.');
      }

      upsertResource(created);
      clearResourcePlannerCache();
      setSelectedAssignmentResourceIds((current) => (
        created.isActive && !current.includes(created.id)
          ? [...current, created.id]
          : current
      ));
      setCreateAssignmentResourceOpen(false);
    } catch (error) {
      setCreateAssignmentResourceError(error instanceof Error ? error.message : 'Не удалось создать ресурс.');
    } finally {
      setCreateAssignmentResourcePending(false);
    }
  }, [accessToken, clearResourcePlannerCache, effectiveReadOnly, upsertResource, workspace]);

  const handleAssignResources = useCallback(async (task: Task, selectedResourceIds: string[]) => {
    if (!accessToken || effectiveReadOnly) {
      return;
    }

    const nextResourceIds = Array.from(new Set(selectedResourceIds.map((resourceId) => resourceId.trim()).filter(Boolean)));

    const state = useProjectStore.getState();
    const activeResourceIds = new Set(
      getAssignableResources(state.resources, workspace.kind === 'project' ? workspace.projectId : null)
        .map((resource) => resource.id),
    );
    if (nextResourceIds.some((resourceId) => !activeResourceIds.has(resourceId))) {
      setAssignmentError('invalid_resource_selection: Можно назначить только активный ресурс текущего проекта.');
      return;
    }
    const childLeafIds = collectDescendantLeafIds(tasks, task.id);
    const isParentTask = childLeafIds.length > 0;
    const endpoint = isParentTask
      ? `/api/tasks/${task.id}/assignments/materialize`
      : `/api/tasks/${task.id}/assignments`;

    setAssignmentError(null);
    setAssignmentSubmitting(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resourceIds: nextResourceIds }),
      });

      const data = await response.json().catch(() => ({})) as {
        error?: string;
        issue?: { code?: string };
        taskAssignments?: Array<{ assignments: TaskAssignmentRecord[] }>;
        assignments?: TaskAssignmentRecord[];
      };

      if (!response.ok) {
        const issueCode = data.issue?.code;
        setAssignmentError(issueCode ? `${issueCode}: ${data.error ?? 'assignment failed'}` : (data.error ?? `HTTP ${response.status}`));
        return;
      }

      if (isParentTask) {
        const nextAssignments = Array.isArray(data.taskAssignments)
          ? data.taskAssignments.flatMap((entry) => Array.isArray(entry.assignments) ? entry.assignments : [])
          : null;
        if (!nextAssignments) {
          setAssignmentError('malformed_assignment_response: Сервер вернул назначения в неизвестном формате.');
          return;
        }
        replaceAssignmentsForTasks(childLeafIds, nextAssignments);
        clearResourcePlannerCache();
      } else {
        if (!Array.isArray(data.assignments)) {
          setAssignmentError('malformed_assignment_response: Сервер вернул назначения в неизвестном формате.');
          return;
        }
        const nextAssignments = data.assignments;
        replaceAssignmentsForTask(task.id, nextAssignments);
        clearResourcePlannerCache();
      }

      setAssignmentError(null);
      setAssignmentSelectionTaskId(null);
      setSelectedAssignmentResourceIds([]);
    } catch {
      setAssignmentError('network_failure: Не удалось сохранить назначения ресурсов.');
    } finally {
      setAssignmentSubmitting(false);
    }
  }, [accessToken, clearResourcePlannerCache, effectiveReadOnly, replaceAssignmentsForTask, replaceAssignmentsForTasks, setAssignmentError, tasks, workspace]);

  const taskListMenuCommands = useMemo<TaskListMenuCommand<Task>[]>(() => {
    if (effectiveReadOnly || chatDisabled || !showChat) {
      return [];
    }

    const commands: TaskListMenuCommand<Task>[] = [
      {
        id: 'assign-resource',
        label: 'Назначить ресурс',
        icon: <Check className="h-4 w-4" />,
        onSelect: (row) => openAssignmentSelector(row),
      },
      {
        id: 'send-task-to-chat',
        label: 'Выполнить...',
        icon: <WandSparkles className="h-4 w-4" />,
        onSelect: (row) => setTaskChatDraft(row),
      },
    ];

    if (onSplitTask) {
      commands.push({
        id: 'split-task-with-ai',
        label: 'Разбить задачу...',
        icon: <ListTree className="h-4 w-4" />,
        scope: 'linear',
        onSelect: (row) => setSplitTaskDraft(row),
      });
    }

    return commands;
  }, [chatDisabled, effectiveReadOnly, onSplitTask, showChat, openAssignmentSelector]);

  const additionalColumns = useMemo<TaskListColumn<Task>[]>(() => [
    createAssignedResourcesColumn({
      resources,
      assignments,
      editable: !effectiveReadOnly,
      readOnly: effectiveReadOnly,
      onEdit: openAssignmentSelector,
    }),
  ], [assignments, effectiveReadOnly, openAssignmentSelector, resources]);

  const latestRestorableItem = useMemo(
    () => historyItems.find((item) => item.canRestore) ?? null,
    [historyItems],
  );
  const previewHistoryItem = useMemo(
    () => historyViewer.mode === 'preview'
      ? historyItems.find((item) => item.id === historyViewer.groupId) ?? null
      : null,
    [historyItems, historyViewer],
  );
  const historyItemsById = useMemo(
    () => new Map(historyItems.map((item) => [item.id, item])),
    [historyItems],
  );
  const chatMessages = useMemo(
    () => messages.map((message) => {
      const historyItem = message.historyGroupId ? historyItemsById.get(message.historyGroupId) : null;
      return {
        ...message,
        checkpointLabel: message.role === 'user' && message.historyGroupId
          ? buildCheckpointLabel(message.historyGroupId, historyItem?.createdAt)
          : null,
        canPreviewHistory: message.role === 'user' && Boolean(message.historyGroupId),
        canRestoreHistory: message.role === 'user' && Boolean(message.historyGroupId && historyItem?.canRestore),
        previewLoading: previewingGroupId === message.historyGroupId,
        restoreLoading: restoringGroupId === message.historyGroupId,
      };
    }),
    [historyItemsById, messages, previewingGroupId, restoringGroupId],
  );

  useEffect(() => {
    // Block Ctrl+Z / Ctrl+Shift+Z history shortcuts while preview mode is active.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!accessToken || effectiveReadOnly || event.defaultPrevented || !event.ctrlKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(
        target?.isContentEditable
        || tagName === 'input'
        || tagName === 'textarea',
      );

      if (isEditable || event.key.toLowerCase() !== 'z') {
        return;
      }

      if (event.shiftKey || historyLoading || !latestRestorableItem) {
        return;
      }

      event.preventDefault();
      void restoreVersion(latestRestorableItem.id);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accessToken, effectiveReadOnly, historyLoading, latestRestorableItem, restoreVersion]);

  useEffect(() => {
    if (!hasBaselineAccess) {
      return;
    }

    void refreshBaselines().catch(() => {});
  }, [hasBaselineAccess, refreshBaselines]);

  const handleRefreshBaselines = useCallback(async () => {
    if (!hasBaselineAccess) {
      return;
    }

    await refreshBaselines();
  }, [hasBaselineAccess, refreshBaselines]);

  const handleSelectBaseline = useCallback(async (baselineId: string) => {
    if (!projectId) {
      return;
    }

    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId) {
      return;
    }

    if (selectedBaselineState?.id === trimmedBaselineId) {
      setProjectState(projectId, { selectedBaselineVisible: true });
      return;
    }

    const baseline = await fetchBaseline(trimmedBaselineId);
    setProjectState(projectId, {
      selectedBaseline: {
        id: baseline.id,
        label: baseline.name || 'Без названия',
        snapshot: baseline.snapshot,
      },
      selectedBaselineVisible: true,
    });
  }, [fetchBaseline, projectId, selectedBaselineState?.id, setProjectState]);

  const handleCreateBaselineFromCurrent = useCallback(async () => {
    if (!projectId || creatingFromCurrent) {
      return;
    }

    try {
      const baseline = await createFromCurrent(buildDefaultBaselineName());
      setProjectState(projectId, {
        selectedBaseline: {
          id: baseline.id,
          label: baseline.name || 'Без названия',
          snapshot: baseline.snapshot,
        },
        selectedBaselineVisible: true,
      });
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [createFromCurrent, creatingFromCurrent, projectId, setProjectState]);

  const handleCreateBaselineFromHistory = useCallback(async (item: { id: string; createdAt: string }) => {
    if (!projectId || creatingFromHistoryGroupId === item.id) {
      return;
    }

    try {
      const baseline = await createFromHistory(item.id, buildDefaultBaselineName(item.createdAt));
      setProjectState(projectId, {
        selectedBaseline: {
          id: baseline.id,
          label: baseline.name || 'Без названия',
          snapshot: baseline.snapshot,
        },
        selectedBaselineVisible: true,
      });
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [createFromHistory, creatingFromHistoryGroupId, projectId, setProjectState]);

  const handleDeleteBaseline = useCallback(async (baselineId: string) => {
    if (!projectId) {
      return;
    }

    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId || deletingBaselineId === trimmedBaselineId) {
      return;
    }

    try {
      const deleted = await deleteBaseline(trimmedBaselineId);
      if (selectedBaselineState?.id === deleted.id) {
        setProjectState(projectId, { selectedBaseline: null, selectedBaselineVisible: false });
      }
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [deleteBaseline, deletingBaselineId, projectId, selectedBaselineState?.id, setProjectState]);

  const handleToggleBaselineVisibility = useCallback(() => {
    if (!projectId || !selectedBaselineState) {
      return;
    }

    setProjectState(projectId, { selectedBaselineVisible: !selectedBaselineVisible });
  }, [projectId, selectedBaselineState, selectedBaselineVisible, setProjectState]);


  useEffect(() => {
    if (!accessToken || historyRefreshRevision === 0) {
      return;
    }

    void refreshHistorySilently();
  }, [accessToken, historyRefreshRevision, refreshHistorySilently]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      {/* Toolbar on full width */}
      <div className="px-3 md:px-4">
        <Toolbar
          showChatToggle={!hasShareToken && showChat}
          isChatOpen={chatSidebarVisible}
          onToggleChat={onToggleChat}
          onScrollToToday={onScrollToToday}
          onCollapseAll={onCollapseAll}
          onExpandAll={onExpandAll}
          onExportPdf={onExportPdf}
          onExportExcel={onExportExcel}
          isExportExcelLoading={isExportExcelLoading}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          disableTaskDrag={effectiveDisableTaskDrag}
          onToggleDisableTaskDrag={handleSetDisableTaskDrag}
          ganttDayMode={displayGanttDayMode ?? ganttDayMode}
          onGanttDayModeChange={onGanttDayModeChange}
          readOnly={readOnly || aiMutationLocked}
          previewMode={previewModeActive}
          baselineMenuOpen={baselineMenuOpen}
          onBaselineMenuOpenChange={setBaselineMenuOpen}
          baselineActiveLabel={selectedBaselineLabel}
          baselineVisible={selectedBaselineVisible}
          baselineRows={baselineRows}
          baselineLoading={baselinesLoading}
          baselineActiveRequestId={activeBaselineId}
          baselineError={baselinesError}
          baselineCreateLabel="Сохранить текущий график"
          creatingBaselineFromCurrent={creatingFromCurrent}
          deletingBaselineId={deletingBaselineId}
          onCreateBaselineFromCurrent={() => {
            void handleCreateBaselineFromCurrent();
          }}
          onSelectBaseline={(baselineId) => {
            void handleSelectBaseline(baselineId);
          }}
          onToggleBaselineVisibility={handleToggleBaselineVisibility}
          onDeleteBaseline={(baselineId) => {
            void handleDeleteBaseline(baselineId);
          }}
          onRefreshBaselines={() => {
            void handleRefreshBaselines();
          }}
        />
      </div>

      {/* Chart and Chat side by side */}
      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4 lg:flex-row lg:overflow-hidden">
        {/* Chart card - hide on mobile when chat is open */}
        <div className={cn(
          "flex min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]",
          chatSidebarVisible && "hidden md:flex"
        )}>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {assignmentSelectionTaskId && selectedAssignmentTask && (
              <ResourceAssignmentModal
                activeAssignedResources={selectedAssignmentResourceGroups.activeAssignedResources}
                assignableResources={activeResources}
                error={assignmentError}
                inactiveAssignedResources={selectedAssignmentResourceGroups.inactiveAssignedResources}
                onCancel={closeAssignmentSelector}
                onCreateResource={() => {
                  setCreateAssignmentResourceError(null);
                  setCreateAssignmentResourceOpen(true);
                }}
                onSelectionChange={handleAssignmentResourceChange}
                onSubmit={(resourceIds) => {
                  void handleAssignResources(selectedAssignmentTask, resourceIds);
                }}
                pending={assignmentSubmitting}
                selectedResourceIds={selectedAssignmentResourceIds}
                task={selectedAssignmentTask}
              />
            )}
            {assignmentSelectionTaskId && selectedAssignmentTask && createAssignmentResourceOpen && (
              <CreateResourceModal
                error={createAssignmentResourceError}
                pending={createAssignmentResourcePending}
                onCancel={() => {
                  if (!createAssignmentResourcePending) {
                    setCreateAssignmentResourceOpen(false);
                    setCreateAssignmentResourceError(null);
                  }
                }}
                onSubmit={(input) => {
                  void handleCreateAssignmentResource(input);
                }}
              />
            )}

            {assignmentError && !assignmentSelectionTaskId && (
              <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="assignment-error-banner" role="alert">
                {assignmentError}
              </div>
            )}

            {loading ? (
              <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                Загрузка...
              </div>
            ) : (
              <GanttChart
                ref={ganttRef as Ref<GanttChartRef>}
                tasks={effectiveTasksWithBaseline}
                showBaseline={Boolean(selectedBaselineState && selectedBaselineVisible && !previewHistoryItem)}
                taskFilter={taskFilter}
                taskListMenuCommands={taskListMenuCommands}
                additionalColumns={additionalColumns}
                onTasksChange={effectiveReadOnly ? undefined : batchUpdate?.handleTasksChange}
                dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
                rowHeight={36}
                containerHeight="calc(100dvh - 132px)"
                showTaskList={showTaskList}
                showChart={showChart}
                taskListWidth={650}
                onValidateDependencies={onValidation}
                enableAutoSchedule={autoSchedule}
                onCascade={effectiveReadOnly ? undefined : onCascade}
                disableTaskNameEditing={effectiveReadOnly}
                disableDependencyEditing={effectiveReadOnly}
                disableTaskDrag={effectiveDisableTaskDrag}
                highlightExpiredTasks={highlightExpiredTasks}
                headerHeight={40}
                viewMode={viewMode}
                collapsedParentIds={collapsedParentIds}
                onToggleCollapse={handleToggleCollapse}
                onAdd={effectiveReadOnly ? undefined : batchUpdate?.handleAdd}
                onDelete={effectiveReadOnly ? undefined : batchUpdate?.handleDelete}
                onInsertAfter={effectiveReadOnly ? undefined : batchUpdate?.handleInsertAfter}
                onReorder={effectiveReadOnly ? undefined : batchUpdate?.handleReorder}
                onUngroupTask={effectiveReadOnly ? undefined : batchUpdate?.handleUngroupTask}
                customDays={customDays}
                highlightedTaskIds={highlightedSearchTaskIds}
                filterMode={filterMode}
                businessDays={ganttDayMode !== 'calendar'}
              />
            )}

            {aiMutationLocked && (
              <div className="pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2">
                <div className="pointer-events-auto flex min-h-14 max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                  <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">AI готовит график. Подождите</p>
                  </div>
                  {canOpenChatFromLoader && (
                    <button
                      type="button"
                      onClick={onToggleChat}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Открыть чат
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasRenderableChart && (
              <footer className="flex h-6 shrink-0 select-none items-center gap-3 border-t border-slate-200 bg-white px-3">
                {effectiveTasks.length > 0 && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTaskCount(effectiveTasks.length)}
                  </span>
                )}

                <span className="font-mono text-[11px] text-slate-400">
                  {ganttDayMode === 'calendar' ? 'Календарные дни' : 'Рабочие дни'}
                </span>

                {selectedBaselineLabel && selectedBaselineVisible && !previewHistoryItem && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
                    {selectedBaselineLabel}
                    <span className="ml-1 text-[10px] font-medium normal-case text-primary/80">
                      ({selectedBaselineTaskCount} задач)
                    </span>
                  </span>
                )}

                {previewHistoryItem && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-700">
                    Версия от {formatHistoryVersionTimestamp(previewHistoryItem.createdAt)}
                  </span>
                )}

                {(previewRendering || previewFailed) && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600">
                    {previewRendering ? 'Предпросмотр' : 'Не сохранено'}
                  </span>
                )}

                {aiMutationLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    AI занят
                  </span>
                )}

                {previewRendering && (
                  <span className="font-mono text-[11px] text-amber-600">
                    Предварительный график до финального сохранения
                  </span>
                )}

                {previewFailed && (
                  <span className="font-mono text-[11px] text-red-600">
                    {previewMessage ?? 'Предварительный график не был сохранён'}
                  </span>
                )}

                <span
                  className={cn(
                    'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                    displayConnected ? 'text-emerald-600' : 'text-amber-600',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', displayConnected ? 'bg-emerald-500' : 'bg-amber-400')} />
                  {hasShareToken ? 'Только для чтения' : displayConnected ? 'Подключено' : 'Переподключение...'}
                </span>

                {!hasShareToken && isAuthenticated && savingState !== 'idle' && (
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      savingState === 'saving' && 'text-amber-600',
                      savingState === 'saved' && 'text-emerald-600',
                      savingState === 'error' && 'text-red-600',
                    )}
                  >
                    {savingState === 'saving' && (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                        Сохранение...
                      </>
                    )}
                    {savingState === 'saved' && (
                      <>
                        <Check className="h-3 w-3 shrink-0" />
                        Сохранено
                      </>
                    )}
                    {savingState === 'error' && (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        Ошибка сохранения
                      </>
                    )}
                  </span>
                )}
              </footer>
            )}
          </div>
        </div>

        {showHistoryPanel && (
          <HistoryPanel
            items={historyItems}
            loading={historyLoading}
            error={historyError}
            disabled={historyPanelDisabled}
            previewGroupId={historyViewer.mode === 'preview' ? historyViewer.groupId : null}
            previewingGroupId={previewingGroupId}
            restoringGroupId={restoringGroupId}
            creatingBaselineFromHistoryGroupId={creatingFromHistoryGroupId}
            onClose={() => setShowHistoryPanel(false)}
            onRefresh={() => void refreshHistory()}
            onPreviewVersion={showVersion}
            onRestoreVersion={restoreVersion}
            onCreateBaselineFromHistory={(item) => {
              void handleCreateBaselineFromHistory(item);
            }}
            onReturnToCurrentVersion={returnToCurrentVersion}
          />
        )}

        {/* Chat card - full width on mobile when open, side on desktop */}
        {chatSidebarVisible && !hasShareToken && onSend && (
          <aside className="mb-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] lg:w-[360px] lg:flex-none lg:max-w-md xl:max-w-[320px]">
            <ChatSidebar
              messages={chatMessages}
              streaming={streaming}
              onSend={onSend}
              onTaskReferenceClick={handleTaskReferenceClick}
              disabled={aiThinking || effectiveChatDisabled}
              connected={displayConnected}
              usage={chatUsage}
              disabledReason={aiThinking ? null : effectiveChatDisabledReason}
              loading={aiThinking}
              onClose={onCloseChat}
              onShowChart={onCloseChat}
              showChartButton={hasRenderableChart}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
              onReturnToCurrentVersion={returnToCurrentVersion}
              showReturnToCurrentVersion={previewModeActive}
              activePreviewGroupId={historyViewer.mode === 'preview' ? historyViewer.groupId : null}
              onPreviewHistory={(groupId) => {
                void showVersionById(groupId);
              }}
              onRestoreHistory={(groupId) => {
                void restoreVersion(groupId);
              }}
            />
          </aside>
        )}
      </div>

      {splitTaskDraft && (
        <SplitTaskModal
          task={splitTaskDraft}
          onClose={() => setSplitTaskDraft(null)}
          onSubmit={handleSplitTaskSubmit}
        />
      )}

      {taskChatDraft && (
        <TaskChatModal
          task={taskChatDraft}
          onClose={() => setTaskChatDraft(null)}
          onAppendToChat={handleAppendTaskToChat}
          onSendNow={onSend}
        />
      )}
    </div>
  );
}

