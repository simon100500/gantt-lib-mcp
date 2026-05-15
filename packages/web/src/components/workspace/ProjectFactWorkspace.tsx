import type { RefObject } from 'react';
import { useEffect, useMemo, useCallback, useRef } from 'react';
import type { TaskDateChangeMode, TaskListColumn, TaskListColumnId, TaskListColumnWidthMap } from 'gantt-lib';

import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import {
  TASK_LIST_COLUMN_WIDTHS,
  normalizeHiddenTaskListColumns,
  resolveHiddenTaskListColumns,
} from '../../lib/taskListColumns.ts';
import type { StartScreenSendResult } from '../StartScreen.tsx';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import type { Task, ValidationResult } from '../../types.ts';
import { TaskCompletedVolumeCell, TaskWorkMetadataCell } from './TaskWorkColumns.tsx';
import { useTaskWorkProgressMutations } from './useTaskWorkProgressMutations.ts';
import {
  buildFactByDate,
  buildPlanByDate,
  numberMapsEqual,
  omitPlanFactFields,
  type PlanFactTask,
} from './projectFactAdapter.ts';

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
  sharedProject,
  shareToken,
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
  projectIdOverride = null,
  hiddenTaskListColumnsDefaultOverride = null,
  viewportOffsetPx = 0,
}: ProjectFactWorkspaceProps) {
  const workspace = useUIStore((state) => state.workspace);
  const searchResults = useUIStore((state) => state.searchResults);
  const tempHighlightedTaskId = useUIStore((state) => state.tempHighlightedTaskId);
  const aiMutationLock = useUIStore((state) => state.aiMutationLock);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const projectStates = useProjectUIStore((state) => state.projectStates);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const authProject = useAuthStore((state) => state.project);
  const progressEntries = useProjectStore((state) => state.progressEntries);
  const ganttSectionRef = useRef<HTMLDivElement | null>(null);

  const projectId = workspace.kind === 'project' ? workspace.projectId : null;
  const persistedProjectId = projectIdOverride ?? projectId;
  const effectiveReadOnly = readOnly || aiMutationLock.active;
  const workspaceViewportHeight = `calc(100dvh - ${132 + viewportOffsetPx}px)`;

  useFilterPersistence();
  const taskFilter = useTaskFilter();

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

  const projectHiddenTaskListColumnsDefault = useMemo<TaskListColumnId[]>(() => {
    const configuredDefaults = hiddenTaskListColumnsDefaultOverride ?? (
      hasShareToken
        ? sharedProject?.hiddenTaskListColumnsDefault
        : (persistedProjectId && authProject?.id === persistedProjectId ? authProject.hiddenTaskListColumnsDefault : null)
    );
    return resolveHiddenTaskListColumns({
      userOverrideInitialized: false,
      projectHiddenTaskListColumnsDefault: configuredDefaults,
    });
  }, [authProject, hasShareToken, hiddenTaskListColumnsDefaultOverride, persistedProjectId, sharedProject]);

  const hiddenTaskListColumns = useMemo<TaskListColumnId[]>(() => {
    if (!projectId) {
      return [...projectHiddenTaskListColumnsDefault];
    }

    const projectState = projectStates[projectId];
    if (!projectState?.taskListColumnsInitialized) {
      return [...projectHiddenTaskListColumnsDefault];
    }

    return normalizeHiddenTaskListColumns(projectState.hiddenTaskListColumns);
  }, [projectHiddenTaskListColumnsDefault, projectId, projectStates]);

  const factHiddenTaskListColumns = useMemo<TaskListColumnId[]>(() => {
    const hiddenColumns = new Set<TaskListColumnId>(hiddenTaskListColumns);
    hiddenColumns.delete('startDate');
    hiddenColumns.delete('endDate');
    hiddenColumns.delete('progress');
    for (const columnId of [
      'dependencies',
      'duration',
      'work-volume',
      'completed-volume',
      'status',
      'assigned-resources',
    ] as TaskListColumnId[]) {
      hiddenColumns.add(columnId);
    }
    return Array.from(hiddenColumns);
  }, [hiddenTaskListColumns]);

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
    Object.entries(TASK_LIST_COLUMN_WIDTHS).reduce(
      (width, [columnId]) => factHiddenTaskListColumns.includes(columnId as TaskListColumnId) ? width : width + (taskListColumnWidths[columnId] ?? 0),
      0,
    ) + 232
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
      planByDate: buildPlanByDate(task, parentTaskIds),
      factByDate: buildFactByDate(task.id, progressEntriesByTaskId.get(task.id) ?? []),
    }))
  ), [tasks, parentTaskIds, progressEntriesByTaskId]);

  const additionalColumns = useMemo<TaskListColumn<Task>[]>(() => [
    {
      id: 'plan-fact-volume',
      header: 'Объём',
      width: 96,
      minWidth: 55,
      after: 'endDate',
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

  const handleTaskDateChangeModeChange = useCallback((mode: TaskDateChangeMode) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskDateChangeMode: mode,
    });
  }, [projectId, setProjectState]);

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

  const setPlanFactValueForDate = useCallback(async (task: Task, dateKey: string, nextValue: number | undefined) => {
    if (parentTaskIds.has(task.id)) {
      return;
    }

    const existingEntry = progressEntries.find((entry) => entry.taskId === task.id && entry.entryDate === dateKey);
    const currentAmount = existingEntry?.amount ?? 0;
    const nextAmount = nextValue ?? 0;
    if (Math.abs(nextAmount - currentAmount) <= 0.000001) {
      return;
    }

    await runWithWorkProgressLoader(task.id, async () => {
      if (nextAmount <= 0.000001) {
        if (existingEntry) {
          await handleDeleteTaskProgressEntry(task, existingEntry);
        }
        return;
      }

      if (existingEntry) {
        await handleUpdateTaskProgressEntry(task, existingEntry, {
          entryDate: dateKey,
          amount: Number(nextAmount.toFixed(6)),
        });
        return;
      }

      await handleAddTaskProgressEntry(task, {
        entryDate: dateKey,
        value: Number(nextAmount.toFixed(6)),
        inputMode: 'volume',
      });
    });
  }, [
    handleAddTaskProgressEntry,
    handleDeleteTaskProgressEntry,
    handleUpdateTaskProgressEntry,
    parentTaskIds,
    progressEntries,
    runWithWorkProgressLoader,
  ]);

  const handlePlanFactTasksChange = useCallback(async (changedTasks: Task[]) => {
    const passthroughTasks: Task[] = [];
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
        const dateKeys = new Set([
          ...Object.keys(originalPlanFactTask.factByDate ?? {}),
          ...Object.keys(rawChangedTask.factByDate ?? {}),
        ]);
        for (const dateKey of dateKeys) {
          const nextValue = rawChangedTask.factByDate?.[dateKey];
          const previousValue = originalPlanFactTask.factByDate?.[dateKey];
          if (Math.abs((nextValue ?? 0) - (previousValue ?? 0)) <= 0.000001) {
            continue;
          }
          await setPlanFactValueForDate(originalTask, dateKey, nextValue);
        }
      }

      if (nonMatrixChanged || (!factChanged && !planChanged)) {
        passthroughTasks.push(strippedTask);
      }
    }

    if (passthroughTasks.length > 0) {
      const progressPassthroughTasks = await applyProgressColumnVolumeDeltas(passthroughTasks);
      if (progressPassthroughTasks.length > 0) {
        await batchUpdate?.handleTasksChange(progressPassthroughTasks);
      }
    }
  }, [applyProgressColumnVolumeDeltas, batchUpdate, planFactTasks, setPlanFactValueForDate, tasks]);

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
          onExportBackup={onExportBackup}
          onImportExcel={onImportExcel}
          onImportBackup={onImportBackup}
          isExportExcelLoading={isExportExcelLoading}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
          readOnly={effectiveReadOnly}
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
