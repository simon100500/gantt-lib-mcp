import type { RefObject } from 'react';
import { useEffect, useMemo, useCallback, useRef } from 'react';
import type { TaskDateChangeMode, TaskListColumn, TaskListColumnId, TaskListColumnWidthMap } from 'gantt-lib';

import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar, type ToolbarTaskListColumnRow } from '../layout/Toolbar.tsx';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import { TASK_LIST_COLUMN_WIDTHS } from '../../lib/taskListColumns.ts';
import type { StartScreenSendResult } from '../StartScreen.tsx';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import type { CalendarDay, CalendarWeeklyPattern, Task, ValidationResult } from '../../types.ts';
import { buildCustomDays, getProjectWeekendPredicate } from '../../lib/projectScheduleOptions.ts';
import { TaskCompletedVolumeCell, TaskWorkMetadataCell } from './TaskWorkColumns.tsx';
import { useTaskWorkProgressMutations } from './useTaskWorkProgressMutations.ts';
import {
  buildFactByDate,
  buildPlanEntriesByTaskId,
  buildPlanByDate,
  numberMapsEqual,
  omitPlanFactFields,
  toDateKey,
  type PlanFactTask,
} from './projectFactAdapter.ts';

const FACT_TASK_LIST_COLUMN_ROWS: ToolbarTaskListColumnRow[] = [
  { id: 'number', label: 'Номер' },
  { id: 'name', label: 'Имя' },
  { id: 'startDate', label: 'Начало' },
  { id: 'endDate', label: 'Окончание' },
  { id: 'duration', label: 'Дни' },
  { id: 'progress', label: '% выполнения' },
  { id: 'plan-fact-volume', label: 'Объём' },
  { id: 'plan-fact-fact', label: 'Факт' },
];

const FACT_TASK_LIST_COLUMN_IDS = new Set(FACT_TASK_LIST_COLUMN_ROWS.map((column) => column.id));
const FACT_ALWAYS_HIDDEN_TASK_LIST_COLUMNS: TaskListColumnId[] = [
  'dependencies',
  'work-volume',
  'completed-volume',
  'status',
  'assigned-resources',
];
const FACT_TASK_LIST_COLUMN_WIDTHS: Record<string, number> = {
  ...TASK_LIST_COLUMN_WIDTHS,
  'plan-fact-volume': 96,
  'plan-fact-fact': 82,
};

interface ProjectFactWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  accessToken?: string | null;
  sharedProject: SharedTaskProject | null;
  shareToken: string | null;
  hasShareToken: boolean;
  isAuthenticated: boolean;
  batchUpdate?: UseBatchTaskUpdateResult;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onExportBackup?: () => void;
  onImportExcel?: () => void;
  onImportBackup?: () => void;
  isExportExcelLoading?: boolean;
  onValidation: (result: ValidationResult) => void;
  readOnly?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  projectIdOverride?: string | null;
  hiddenTaskListColumnsDefaultOverride?: string[] | null;
  viewportOffsetPx?: number;
  calendarWeeklyPattern: CalendarWeeklyPattern;
  calendarDays: CalendarDay[];
}

function normalizeTaskListColumnWidthMap(value: unknown): TaskListColumnWidthMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number'
      && Number.isFinite(entry[1])
      && entry[1] > 0
    )),
  );
}

export function ProjectFactWorkspace({
  ganttRef,
  tasks,
  setTasks,
  loading,
  accessToken = null,
  hasShareToken,
  isAuthenticated,
  batchUpdate,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onExportPdf,
  onExportExcel,
  onExportBackup,
  onImportExcel,
  onImportBackup,
  isExportExcelLoading = false,
  onValidation,
  readOnly = false,
  shareStatus = 'idle',
  onCreateShareLink,
  viewportOffsetPx = 0,
  calendarWeeklyPattern,
  calendarDays,
}: ProjectFactWorkspaceProps) {
  const workspace = useUIStore((state) => state.workspace);
  const searchResults = useUIStore((state) => state.searchResults);
  const tempHighlightedTaskId = useUIStore((state) => state.tempHighlightedTaskId);
  const aiMutationLock = useUIStore((state) => state.aiMutationLock);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const projectStates = useProjectUIStore((state) => state.projectStates);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const progressEntries = useProjectStore((state) => state.progressEntries);
  const planEntries = useProjectStore((state) => state.planEntries);
  const replaceProgressEntriesForTask = useProjectStore((state) => state.replaceProgressEntriesForTask);
  const replacePlanEntriesForTask = useProjectStore((state) => state.replacePlanEntriesForTask);
  const mergeConfirmedSnapshot = useProjectStore((state) => state.mergeConfirmedSnapshot);
  const ganttSectionRef = useRef<HTMLDivElement | null>(null);

  const projectId = workspace.kind === 'project' ? workspace.projectId : null;
  const effectiveReadOnly = readOnly || aiMutationLock.active;
  const workspaceViewportHeight = `calc(100dvh - ${132 + viewportOffsetPx}px)`;

  useFilterPersistence();
  const taskFilter = useTaskFilter();
  const customDays = useMemo(() => buildCustomDays(calendarDays), [calendarDays]);
  const weekendPredicate = useMemo(
    () => getProjectWeekendPredicate(calendarWeeklyPattern, calendarDays),
    [calendarDays, calendarWeeklyPattern],
  );

  const parentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) {
        ids.add(task.parentId);
      }
    }
    return ids;
  }, [tasks]);

  const progressEntriesByTaskId = useMemo(() => {
    const entriesByTaskId = new Map<string, typeof progressEntries>();
    for (const entry of progressEntries) {
      const taskEntries = entriesByTaskId.get(entry.taskId);
      if (taskEntries) {
        taskEntries.push(entry);
      } else {
        entriesByTaskId.set(entry.taskId, [entry]);
      }
    }
    return entriesByTaskId;
  }, [progressEntries]);
  const planEntriesByTaskId = useMemo(() => buildPlanEntriesByTaskId(planEntries), [planEntries]);

  const {
    workProgressLoadingTaskIds,
    handleUpdateTaskWorkMetadata,
    handleAddTaskProgressEntry,
    handleUpdateTaskProgressEntry,
    handleDeleteTaskProgressEntry,
    runWithWorkProgressLoader,
    applyProgressColumnVolumeDeltas,
  } = useTaskWorkProgressMutations({
    accessToken,
    projectId,
    workspaceKind: workspace.kind,
    tasks,
    setTasks,
    parentTaskIds,
    progressEntries,
  });

  const hiddenFactTaskListColumns = useMemo<TaskListColumnId[]>(() => {
    if (!projectId) {
      return [];
    }

    const projectState = projectStates[projectId];
    if (!projectState?.factTaskListColumnsInitialized) {
      return [];
    }

    return (projectState.hiddenFactTaskListColumns ?? []).flatMap((columnId) => (
      FACT_TASK_LIST_COLUMN_IDS.has(columnId) ? [columnId as TaskListColumnId] : []
    ));
  }, [projectId, projectStates]);

  const factHiddenTaskListColumns = useMemo<TaskListColumnId[]>(() => [
    ...FACT_ALWAYS_HIDDEN_TASK_LIST_COLUMNS,
    ...hiddenFactTaskListColumns,
  ], [hiddenFactTaskListColumns]);

  const taskListColumnWidths = useMemo<TaskListColumnWidthMap>(() => {
    if (!projectId) {
      return TASK_LIST_COLUMN_WIDTHS;
    }

    const storedWidths = normalizeTaskListColumnWidthMap(projectStates[projectId]?.taskListColumnWidths);
    return {
      ...TASK_LIST_COLUMN_WIDTHS,
      ...storedWidths,
    };
  }, [projectId, projectStates]);

  const taskListWidth = useMemo(() => (
    Object.entries(FACT_TASK_LIST_COLUMN_WIDTHS).reduce(
      (width, [columnId, defaultWidth]) => (
        factHiddenTaskListColumns.includes(columnId as TaskListColumnId)
          ? width
          : width + (taskListColumnWidths[columnId] ?? defaultWidth)
      ),
      0,
    )
  ), [factHiddenTaskListColumns, taskListColumnWidths]);

  const taskDateChangeMode = useMemo<TaskDateChangeMode>(() => {
    if (!projectId) {
      return 'preserve-duration';
    }

    return projectStates[projectId]?.taskDateChangeMode ?? 'preserve-duration';
  }, [projectId, projectStates]);

  const collapsedParentIds = useMemo<Set<string>>(() => {
    if (!projectId) {
      return new Set<string>();
    }
    return new Set(projectStates[projectId]?.collapsedParentIds ?? []);
  }, [projectId, projectStates]);

  const highlightedTaskIds = useMemo(() => {
    const ids = new Set(searchResults);
    if (tempHighlightedTaskId) {
      ids.add(tempHighlightedTaskId);
    }
    return ids;
  }, [searchResults, tempHighlightedTaskId]);

  const planFactTasks = useMemo<PlanFactTask[]>(() => (
    tasks.map((task) => ({
      ...task,
      planByDate: buildPlanByDate(task, parentTaskIds, planEntriesByTaskId.get(task.id) ?? [], calendarWeeklyPattern, calendarDays),
      factByDate: buildFactByDate(task.id, progressEntriesByTaskId.get(task.id) ?? []),
    }))
  ), [calendarDays, calendarWeeklyPattern, tasks, parentTaskIds, planEntriesByTaskId, progressEntriesByTaskId]);

  const additionalColumns = useMemo<TaskListColumn<Task>[]>(() => [
    {
      id: 'plan-fact-volume',
      header: 'Объём',
      width: 96,
      minWidth: 55,
      after: 'duration',
      renderCell: ({ task }) => (
        <TaskWorkMetadataCell
          compact={true}
          disabled={parentTaskIds.has(task.id)}
          onSubmit={handleUpdateTaskWorkMetadata}
          readOnly={effectiveReadOnly}
          task={task}
        />
      ),
    },
    {
      id: 'plan-fact-fact',
      header: 'Факт',
      width: 82,
      minWidth: 50,
      after: 'plan-fact-volume',
      renderCell: ({ task }) => (
        <TaskCompletedVolumeCell
          entries={progressEntriesByTaskId.get(task.id) ?? []}
          disabled={parentTaskIds.has(task.id)}
          loading={workProgressLoadingTaskIds.has(task.id)}
          onUpdateMetadata={handleUpdateTaskWorkMetadata}
          onSubmit={handleAddTaskProgressEntry}
          onUpdateEntry={handleUpdateTaskProgressEntry}
          onDeleteEntry={handleDeleteTaskProgressEntry}
          readOnly={effectiveReadOnly}
          task={task}
        />
      ),
    },
  ], [effectiveReadOnly, handleUpdateTaskWorkMetadata, parentTaskIds, progressEntriesByTaskId, workProgressLoadingTaskIds]);

  const handleTaskListColumnWidthsChange = useCallback((widths: TaskListColumnWidthMap) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskListColumnWidths: normalizeTaskListColumnWidthMap(widths),
    });
  }, [projectId, setProjectState]);

  const handleToggleTaskListColumn = useCallback((columnId: string) => {
    if (!projectId || !FACT_TASK_LIST_COLUMN_IDS.has(columnId)) {
      return;
    }

    const projectState = getProjectState(projectId);
    const currentHiddenColumns = projectState?.factTaskListColumnsInitialized
      ? (projectState.hiddenFactTaskListColumns ?? [])
      : [];
    const nextHiddenColumns = new Set(currentHiddenColumns.filter((id) => FACT_TASK_LIST_COLUMN_IDS.has(id)));
    if (nextHiddenColumns.has(columnId)) {
      nextHiddenColumns.delete(columnId);
    } else {
      nextHiddenColumns.add(columnId);
    }

    setProjectState(projectId, {
      factTaskListColumnsInitialized: true,
      hiddenFactTaskListColumns: Array.from(nextHiddenColumns),
    });
  }, [getProjectState, projectId, setProjectState]);

  const handleSetAllTaskListColumnsVisible = useCallback((visible: boolean) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      factTaskListColumnsInitialized: true,
      hiddenFactTaskListColumns: visible ? [] : FACT_TASK_LIST_COLUMN_ROWS.map((column) => column.id),
    });
  }, [projectId, setProjectState]);

  const handleResetTaskListColumns = useCallback(() => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      factTaskListColumnsInitialized: false,
      hiddenFactTaskListColumns: [],
    });
  }, [projectId, setProjectState]);

  const handleTaskDateChangeModeChange = useCallback((mode: TaskDateChangeMode) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskDateChangeMode: mode,
    });
  }, [projectId, setProjectState]);

  const mergeConfirmedTasks = useCallback((changedTasks: Task[]) => {
    if (changedTasks.length === 0) {
      return;
    }

    const confirmedSnapshot = useProjectStore.getState().confirmed.snapshot;
    const changedTaskById = new Map(changedTasks.map((task) => [task.id, task]));
    mergeConfirmedSnapshot({
      ...confirmedSnapshot,
      tasks: confirmedSnapshot.tasks.map((task) => (
        changedTaskById.has(task.id)
          ? { ...task, ...changedTaskById.get(task.id)! }
          : task
      )),
    });
  }, [mergeConfirmedSnapshot]);

  const handleToggleCollapse = useCallback((parentId: string) => {
    if (!projectId) {
      return;
    }

    const newSet = new Set(collapsedParentIds);
    if (newSet.has(parentId)) {
      newSet.delete(parentId);
    } else {
      newSet.add(parentId);
    }

    setProjectState(projectId, {
      collapsedParentIds: Array.from(newSet),
    });
  }, [collapsedParentIds, projectId, setProjectState]);

  const saveTaskFactByDate = useCallback(async (
    originalTask: Task,
    nextFactByDate: Record<string, number> | undefined,
  ) => {
    if (!accessToken || !projectId || parentTaskIds.has(originalTask.id)) {
      return;
    }

    await runWithWorkProgressLoader(originalTask.id, async () => {
      const response = await fetch(`/api/tasks/${encodeURIComponent(originalTask.id)}/progress-entries/batch`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ factByDate: nextFactByDate ?? {} }),
      });
      const body = await response.json().catch(() => null) as {
        error?: string;
        task?: {
          completedVolume: number;
          progress: number;
          workVolume: number | null;
          workUnit: string | null;
          status: Task['status'];
        };
        progressEntries?: Array<{
          id: string;
          projectId: string;
          taskId: string;
          entryDate: string;
          amount: number;
          createdAt: string;
          updatedAt: string;
        }>;
      } | null;

      if (!response.ok || !body?.task) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }

      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === originalTask.id
          ? {
              ...task,
              workVolume: body.task!.workVolume,
              workUnit: body.task!.workUnit,
              completedVolume: body.task!.completedVolume,
              progress: body.task!.progress ?? 0,
              status: body.task!.status ?? task.status,
            }
          : task
      )));
      mergeConfirmedTasks([{
        ...originalTask,
        workVolume: body.task!.workVolume,
        workUnit: body.task!.workUnit,
        completedVolume: body.task!.completedVolume,
        progress: body.task!.progress ?? 0,
        status: body.task!.status ?? originalTask.status,
      }]);
      replaceProgressEntriesForTask(originalTask.id, body.progressEntries ?? []);
    });
  }, [
    accessToken,
    mergeConfirmedTasks,
    parentTaskIds,
    projectId,
    replaceProgressEntriesForTask,
    runWithWorkProgressLoader,
    setTasks,
  ]);

  const saveTaskPlanByDate = useCallback(async (
    originalTask: Task,
    originalPlanByDate: Record<string, number> | undefined,
    nextTask: Task,
    nextPlanByDate: Record<string, number> | undefined,
  ) => {
    if (!accessToken || !projectId || parentTaskIds.has(originalTask.id)) {
      return;
    }

    const previousTaskSnapshot = {
      startDate: originalTask.startDate,
      endDate: originalTask.endDate,
      workVolume: originalTask.workVolume ?? null,
      workUnit: originalTask.workUnit ?? null,
      completedVolume: originalTask.completedVolume ?? 0,
      progress: originalTask.progress ?? 0,
      status: originalTask.status,
    };
    const previousPlanEntries = planEntriesByTaskId.get(originalTask.id) ?? [];

    await runWithWorkProgressLoader(originalTask.id, async () => {
      const optimisticPlanEntries = Object.entries(nextPlanByDate ?? {})
        .map(([entryDate, amount], index) => ({
          id: `optimistic-plan:${originalTask.id}:${entryDate}:${index}`,
          projectId,
          taskId: originalTask.id,
          entryDate,
          amount,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === originalTask.id
          ? {
              ...task,
              startDate: nextTask.startDate,
              endDate: nextTask.endDate,
              workVolume: nextTask.workVolume ?? task.workVolume ?? null,
            }
          : task
      )));
      replacePlanEntriesForTask(originalTask.id, optimisticPlanEntries);

      const response = await fetch(`/api/tasks/${encodeURIComponent(originalTask.id)}/plan-entries`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          basePlanByDate: originalPlanByDate ?? {},
          nextPlanByDate: nextPlanByDate ?? {},
          startDate: toDateKey(nextTask.startDate),
          endDate: toDateKey(nextTask.endDate),
          workVolume: nextTask.workVolume ?? null,
        }),
      });

      if (!response.ok) {
        setTasks((currentTasks) => currentTasks.map((task) => (
          task.id === originalTask.id
            ? { ...task, ...previousTaskSnapshot }
            : task
        )));
        replacePlanEntriesForTask(originalTask.id, previousPlanEntries);
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json() as {
        task: {
          id: string;
          startDate: string;
          endDate: string;
          workVolume: number | null;
          workUnit: string | null;
          completedVolume: number;
          progress: number;
          status: Task['status'];
        };
        planEntries: Array<{
          id: string;
          projectId: string;
          taskId: string;
          entryDate: string;
          amount: number;
          createdAt: string;
          updatedAt: string;
        }>;
        changedTasks?: Task[];
      };

      const changedTaskById = new Map((body.changedTasks ?? []).map((changedTask) => [changedTask.id, changedTask]));
      const updatedTargetTask = {
        ...originalTask,
        startDate: body.task.startDate,
        endDate: body.task.endDate,
        workVolume: body.task.workVolume,
        workUnit: body.task.workUnit,
        completedVolume: body.task.completedVolume,
        progress: body.task.progress ?? 0,
        status: body.task.status ?? originalTask.status,
      };
      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === body.task.id
          ? { ...task, ...updatedTargetTask }
          : changedTaskById.has(task.id)
            ? { ...task, ...changedTaskById.get(task.id)! }
          : task
      )));
      mergeConfirmedTasks([
        updatedTargetTask,
        ...(body.changedTasks ?? []).filter((changedTask) => changedTask.id !== body.task.id),
      ]);
      replacePlanEntriesForTask(originalTask.id, body.planEntries);
    });
  }, [
    accessToken,
    mergeConfirmedTasks,
    parentTaskIds,
    planEntriesByTaskId,
    projectId,
    replacePlanEntriesForTask,
    runWithWorkProgressLoader,
    setTasks,
  ]);

  const handlePlanFactTasksChange = useCallback(async (changedTasks: Task[]) => {
    const passthroughTasks: Task[] = [];
    const taskPlanRecomputes: Array<{
      originalTask: Task;
      originalPlanByDate?: Record<string, number>;
      nextTask: Task;
      nextPlanByDate?: Record<string, number>;
    }> = [];
    for (const rawChangedTask of changedTasks as PlanFactTask[]) {
      const originalTask = tasks.find((task) => task.id === rawChangedTask.id);
      const originalPlanFactTask = planFactTasks.find((task) => task.id === rawChangedTask.id);
      if (!originalTask || !originalPlanFactTask) {
        passthroughTasks.push(omitPlanFactFields(rawChangedTask));
        continue;
      }

      const factChanged = !numberMapsEqual(originalPlanFactTask.factByDate, rawChangedTask.factByDate);
      const planChanged = !numberMapsEqual(originalPlanFactTask.planByDate, rawChangedTask.planByDate);
      const strippedTask = omitPlanFactFields(rawChangedTask);
      const nonMatrixChanged = Object.keys(strippedTask).some((key) => {
        const taskKey = key as keyof Task;
        return strippedTask[taskKey] !== originalTask[taskKey];
      });

      if (factChanged) {
        await saveTaskFactByDate(originalTask, rawChangedTask.factByDate);
      }

      if (planChanged) {
        taskPlanRecomputes.push({
          originalTask,
          originalPlanByDate: originalPlanFactTask.planByDate,
          nextTask: {
            ...originalTask,
            ...strippedTask,
          },
          nextPlanByDate: rawChangedTask.planByDate,
        });
      }

      if (nonMatrixChanged || (!factChanged && !planChanged)) {
        passthroughTasks.push(strippedTask);
      }

      if (
        !planChanged
        && !parentTaskIds.has(originalTask.id)
        && (
          toDateKey(strippedTask.startDate) !== toDateKey(originalTask.startDate)
          || toDateKey(strippedTask.endDate) !== toDateKey(originalTask.endDate)
          || (strippedTask.workVolume ?? null) !== (originalTask.workVolume ?? null)
        )
      ) {
        taskPlanRecomputes.push({
          originalTask,
          originalPlanByDate: originalPlanFactTask.planByDate,
          nextTask: strippedTask,
          nextPlanByDate: originalPlanFactTask.planByDate,
        });
      }
    }

    if (passthroughTasks.length > 0) {
      const progressPassthroughTasks = await applyProgressColumnVolumeDeltas(passthroughTasks);
      if (progressPassthroughTasks.length > 0) {
        await batchUpdate?.handleTasksChange(progressPassthroughTasks);
      }
    }

    for (const planRecompute of taskPlanRecomputes) {
      await saveTaskPlanByDate(
        planRecompute.originalTask,
        planRecompute.originalPlanByDate,
        planRecompute.nextTask,
        planRecompute.nextPlanByDate,
      );
    }
  }, [applyProgressColumnVolumeDeltas, batchUpdate, parentTaskIds, planFactTasks, saveTaskFactByDate, saveTaskPlanByDate, tasks]);

  useEffect(() => {
    if (!projectId || loading) {
      return;
    }

    const ganttScrollElement = ganttSectionRef.current?.querySelector('.gantt-scrollContainer');
    if (!(ganttScrollElement instanceof HTMLElement)) {
      return;
    }

    const persistedState = getProjectState(projectId);
    if (persistedState && (persistedState.ganttScrollLeft !== 0 || persistedState.ganttScrollTop !== 0)) {
      ganttScrollElement.scrollLeft = persistedState.ganttScrollLeft;
      ganttScrollElement.scrollTop = persistedState.ganttScrollTop;
    }

    let persistTimer: number | null = null;
    let lastScrollLeft = ganttScrollElement.scrollLeft;
    let lastScrollTop = ganttScrollElement.scrollTop;

    const persistScroll = () => {
      persistTimer = null;
      setProjectState(projectId, {
        ganttScrollLeft: lastScrollLeft,
        ganttScrollTop: lastScrollTop,
      });
    };

    const handleScroll = () => {
      lastScrollLeft = ganttScrollElement.scrollLeft;
      lastScrollTop = ganttScrollElement.scrollTop;
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
      }
      persistTimer = window.setTimeout(persistScroll, 160);
    };

    ganttScrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      ganttScrollElement.removeEventListener('scroll', handleScroll);
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
      }
    };
  }, [getProjectState, loading, projectId, setProjectState]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]" data-testid="project-fact-workspace">
      <div className="px-3 md:px-4">
        <Toolbar
          onScrollToToday={onScrollToToday}
          onCollapseAll={onCollapseAll}
          onExpandAll={onExpandAll}
          onExportPdf={onExportPdf}
          onExportExcel={onExportExcel}
          onImportExcel={onImportExcel}
          isExportExcelLoading={isExportExcelLoading}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
          readOnly={effectiveReadOnly}
          taskListColumnRows={FACT_TASK_LIST_COLUMN_ROWS}
          hiddenTaskListColumns={factHiddenTaskListColumns}
          onToggleTaskListColumn={handleToggleTaskListColumn}
          onSetAllTaskListColumnsVisible={handleSetAllTaskListColumnsVisible}
          onResetTaskListColumnOverride={handleResetTaskListColumns}
          taskListColumnResetLabel="По умолчанию"
          showChatToggle={false}
          showBaselineControls={false}
          showDataMenuControl={false}
          showViewScaleControl={false}
          showTaskChartToggle={false}
        />
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="min-h-0 flex-1 overflow-hidden bg-white" ref={ganttSectionRef}>
              {loading ? (
                <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                  Загрузка...
                </div>
              ) : (
                <GanttChart
                  ref={ganttRef as RefObject<GanttChartRef>}
                  tasks={planFactTasks}
                  mode="plan-fact"
                  taskFilter={taskFilter}
                  additionalColumns={additionalColumns}
                  hiddenTaskListColumns={factHiddenTaskListColumns}
                  taskListColumnWidths={taskListColumnWidths}
                  onTaskListColumnWidthsChange={handleTaskListColumnWidthsChange}
                  taskDateChangeMode={taskDateChangeMode}
                  onTaskDateChangeModeChange={handleTaskDateChangeModeChange}
                  onTasksChange={effectiveReadOnly ? undefined : handlePlanFactTasksChange}
                  dayWidth={42}
                  rowHeight={46}
                  containerHeight={workspaceViewportHeight}
                  showTaskList={true}
                  showChart={true}
                  taskListWidth={Math.max(520, taskListWidth)}
                  onValidateDependencies={onValidation}
                  disableTaskNameEditing={effectiveReadOnly}
                  disableDependencyEditing={effectiveReadOnly}
                  disableTaskDrag={true}
                  headerHeight={40}
                  viewMode="day"
                  collapsedParentIds={collapsedParentIds}
                  onToggleCollapse={handleToggleCollapse}
                  highlightedTaskIds={highlightedTaskIds}
                  filterMode="highlight"
                  businessDays={true}
                  customDays={customDays}
                  isWeekend={weekendPredicate}
                />
              )}
            </div>

            <footer className="flex h-6 shrink-0 select-none items-center gap-3 border-t border-slate-200 bg-white px-3">
              {tasks.length > 0 && (
                <span className="font-mono text-[11px] text-slate-400">
                  {tasks.length} задач
                </span>
              )}
              <span className="font-mono text-[11px] text-slate-400">Факт по дням</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
