import { forwardRef, useRef, useImperativeHandle } from 'react';
import { GanttChart as GanttLibChart } from 'gantt-lib';
import type { Task, ValidationResult } from '../types.ts';
import type { CustomDayConfig, TaskDateChangeMode, TaskListColumn, TaskListColumnId, TaskListColumnWidthMap, TaskListMenuCommand } from 'gantt-lib';

export interface ExportToPdfHeaderOptions {
  logoUrl?: string;
  logoHref?: string;
  serviceName?: string;
  serviceHref?: string;
  projectName?: string;
  exportDate?: string | Date;
}

export interface ExportToPdfOptions {
  header?: ExportToPdfHeaderOptions;
  fileName?: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  includeTaskList?: boolean;
  includeChart?: boolean;
}

export interface GanttChartProps {
  tasks: Task[];
  onTasksChange?: (tasks: Task[]) => void;
  dayWidth?: number;
  rowHeight?: number;
  containerHeight?: string | number;
  showTaskList?: boolean;
  showChart?: boolean;
  showBaseline?: boolean;
  taskListWidth?: number;
  onValidateDependencies?: (result: ValidationResult) => void;
  enableAutoSchedule?: boolean;
  disableConstraints?: boolean;
  onCascade?: (tasks: Task[]) => void;
  disableTaskNameEditing?: boolean;
  disableDependencyEditing?: boolean;
  disableTaskDrag?: boolean;
  highlightExpiredTasks?: boolean;
  headerHeight?: number;
  viewMode?: 'day' | 'week' | 'month';
  customDays?: CustomDayConfig[];
  collapsedParentIds?: Set<string>;
  onToggleCollapse?: (parentId: string) => void;
  onAdd?: (newTask: Task) => void;
  onDelete?: (taskId: string) => void;
  onInsertAfter?: (taskId: string, newTask: Task) => void;
  onReorder?: (tasks: Task[], movedTaskId?: string, inferredParentId?: string) => void;
  onPromoteTask?: (taskId: string) => void;
  onDemoteTask?: (taskId: string, newParentId: string) => void;
  onUngroupTask?: (taskId: string) => void;
  taskFilter?: import('gantt-lib').TaskPredicate;
  highlightedTaskIds?: Set<string>;
  enableTaskMultiSelect?: boolean;
  selectedTaskIds?: Set<string>;
  onSelectedTaskIdsChange?: (taskIds: Set<string>) => void;
  filterMode?: 'highlight' | 'hide';
  businessDays?: boolean;
  taskListMenuCommands?: TaskListMenuCommand<Task>[];
  additionalColumns?: TaskListColumn<Task>[];
  hiddenTaskListColumns?: TaskListColumnId[];
  taskListColumnWidths?: TaskListColumnWidthMap;
  onTaskListColumnWidthsChange?: (widths: TaskListColumnWidthMap) => void;
  taskDateChangeMode?: TaskDateChangeMode;
  onTaskDateChangeModeChange?: (mode: TaskDateChangeMode) => void;
}

export interface ScrollToRowOptions {
  select?: boolean;
  behavior?: ScrollBehavior;
  clearSelectionAfterMs?: number;
}

export interface GanttChartRef {
  scrollToToday: () => void;
  scrollToTask: (taskId: string) => void;
  scrollToRow: (taskId: string, options?: ScrollToRowOptions) => void;
  collapseAll: () => void;
  expandAll: () => void;
  exportToPdf: (options?: ExportToPdfOptions) => Promise<void>;
}

export const GanttChart = forwardRef<GanttChartRef, GanttChartProps>(({
  tasks,
  onTasksChange,
  dayWidth,
  rowHeight,
  containerHeight,
  showTaskList,
  showChart,
  showBaseline,
  taskListWidth,
  onValidateDependencies,
  enableAutoSchedule,
  disableConstraints,
  onCascade,
  disableTaskNameEditing,
  disableDependencyEditing,
  disableTaskDrag,
  highlightExpiredTasks,
  headerHeight,
  viewMode,
  customDays,
  collapsedParentIds,
  onToggleCollapse,
  onAdd,
  onDelete,
  onInsertAfter,
  onReorder,
  onPromoteTask,
  onDemoteTask,
  onUngroupTask,
  taskFilter,
  highlightedTaskIds,
  enableTaskMultiSelect,
  selectedTaskIds,
  onSelectedTaskIdsChange,
  filterMode,
  businessDays,
  taskListMenuCommands,
  additionalColumns,
  hiddenTaskListColumns,
  taskListColumnWidths,
  onTaskListColumnWidthsChange,
  taskDateChangeMode,
  onTaskDateChangeModeChange,
}, ref) => {
  const ganttLibRef = useRef<{
    scrollToToday: () => void;
    scrollToTask: (taskId: string) => void;
    scrollToRow: (taskId: string, options?: ScrollToRowOptions) => void;
    collapseAll: () => void;
    expandAll: () => void;
    exportToPdf: (options?: ExportToPdfOptions) => Promise<void>;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => ganttLibRef.current?.scrollToToday(),
    scrollToTask: (taskId: string) => ganttLibRef.current?.scrollToTask(taskId),
    scrollToRow: (taskId: string, options?: ScrollToRowOptions) => ganttLibRef.current?.scrollToRow(taskId, options),
    collapseAll: () => ganttLibRef.current?.collapseAll(),
    expandAll: () => ganttLibRef.current?.expandAll(),
    exportToPdf: (options) => ganttLibRef.current?.exportToPdf(options) ?? Promise.resolve(),
  }));

  return (
    <GanttLibChart
      ref={ganttLibRef}
      tasks={tasks}
      onTasksChange={onTasksChange}
      dayWidth={dayWidth}
      rowHeight={rowHeight}
      containerHeight={containerHeight}
      showTaskList={showTaskList}
      showChart={showChart}
      showBaseline={showBaseline}
      taskListWidth={taskListWidth}
      onValidateDependencies={onValidateDependencies}
      enableAutoSchedule={enableAutoSchedule}
      disableConstraints={disableConstraints}
      onCascade={onCascade}
      disableTaskNameEditing={disableTaskNameEditing}
      disableDependencyEditing={disableDependencyEditing}
      disableTaskDrag={disableTaskDrag}
      highlightExpiredTasks={highlightExpiredTasks}
      headerHeight={headerHeight}
      viewMode={viewMode}
      collapsedParentIds={collapsedParentIds}
      onToggleCollapse={onToggleCollapse}
      onAdd={onAdd}
      onDelete={onDelete}
      onInsertAfter={onInsertAfter}
      onReorder={onReorder}
      onPromoteTask={onPromoteTask}
      onDemoteTask={onDemoteTask}
      onUngroupTask={onUngroupTask}
      customDays={customDays}
      taskFilter={taskFilter}
      highlightedTaskIds={highlightedTaskIds}
      enableTaskMultiSelect={enableTaskMultiSelect}
      selectedTaskIds={selectedTaskIds}
      onSelectedTaskIdsChange={onSelectedTaskIdsChange}
      filterMode={filterMode}
      businessDays={businessDays}
      taskListMenuCommands={taskListMenuCommands}
      additionalColumns={additionalColumns}
      hiddenTaskListColumns={hiddenTaskListColumns}
      taskListColumnWidths={taskListColumnWidths}
      onTaskListColumnWidthsChange={onTaskListColumnWidthsChange}
      taskDateChangeMode={taskDateChangeMode}
      onTaskDateChangeModeChange={onTaskDateChangeModeChange}
    />
  );
});

GanttChart.displayName = 'GanttChart';
