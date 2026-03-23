import { forwardRef, useRef, useImperativeHandle } from 'react';
import { GanttChart as GanttLibChart } from 'gantt-lib';
import type { Task, ValidationResult } from '../types.ts';
import type { CustomDayConfig } from 'gantt-lib';

export interface GanttChartProps {
  tasks: Task[];
  onTasksChange?: (tasks: Task[]) => void;
  dayWidth?: number;
  rowHeight?: number;
  containerHeight?: string | number;
  showTaskList?: boolean;
  showChart?: boolean;
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
  taskFilter?: import('gantt-lib').TaskPredicate;
  highlightedTaskIds?: Set<string>;
  filterMode?: 'highlight' | 'hide';
}

export interface GanttChartRef {
  scrollToToday: () => void;
  scrollToTask: (taskId: string) => void;
  scrollToRow: (taskId: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
}

export const GanttChart = forwardRef<GanttChartRef, GanttChartProps>(({
  tasks,
  onTasksChange,
  dayWidth,
  rowHeight,
  containerHeight,
  showTaskList,
  showChart,
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
  taskFilter,
  highlightedTaskIds,
  filterMode,
}, ref) => {
  const ganttLibRef = useRef<{
    scrollToToday: () => void;
    scrollToTask: (taskId: string) => void;
    scrollToRow: (taskId: string) => void;
    collapseAll: () => void;
    expandAll: () => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => ganttLibRef.current?.scrollToToday(),
    scrollToTask: (taskId: string) => ganttLibRef.current?.scrollToTask(taskId),
    scrollToRow: (taskId: string) => ganttLibRef.current?.scrollToRow(taskId),
    collapseAll: () => ganttLibRef.current?.collapseAll(),
    expandAll: () => ganttLibRef.current?.expandAll(),
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
      onDelete={(taskId) => {
        console.log('%c[GanttChart] onDelete called', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;', taskId);
        console.log('[GanttChart] CALLER:', new Error().stack?.split('\n')[2]?.trim());
        console.log('[GanttChart] FULL STACK:', new Error().stack);
        onDelete?.(taskId);
      }}
      onInsertAfter={onInsertAfter}
      onReorder={onReorder}
      onPromoteTask={onPromoteTask}
      onDemoteTask={onDemoteTask}
      customDays={customDays}
      taskFilter={taskFilter}
      highlightedTaskIds={highlightedTaskIds}
      filterMode={filterMode}
    />
  );
});

GanttChart.displayName = 'GanttChart';
