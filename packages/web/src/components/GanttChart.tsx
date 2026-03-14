import { forwardRef, useRef, useImperativeHandle } from 'react';
import { GanttChart as GanttLibChart } from 'gantt-lib';
import type { Task, ValidationResult } from '../types.ts';

export interface GanttChartProps {
  tasks: Task[];
  onTasksChange?: (tasks: Task[]) => void;
  dayWidth?: number;
  rowHeight?: number;
  containerHeight?: string | number;
  showTaskList?: boolean;
  taskListWidth?: number;
  onValidateDependencies?: (result: ValidationResult) => void;
  enableAutoSchedule?: boolean;
  disableConstraints?: boolean;
  onCascade?: (tasks: Task[]) => void;
  disableTaskNameEditing?: boolean;
  disableDependencyEditing?: boolean;
  highlightExpiredTasks?: boolean;
  headerHeight?: number;
  onAdd?: (newTask: Task) => void;
  onDelete?: (taskId: string) => void;
  onInsertAfter?: (taskId: string, newTask: Task) => void;
  onReorder?: (tasks: Task[], movedTaskId?: string, inferredParentId?: string) => void;
  onPromoteTask?: (taskId: string) => void;
  onDemoteTask?: (taskId: string, newParentId: string) => void;
}

export interface GanttChartRef {
  scrollToToday: () => void;
  scrollToTask: (taskId: string) => void;
}

export const GanttChart = forwardRef<GanttChartRef, GanttChartProps>(({
  tasks,
  onTasksChange,
  dayWidth,
  rowHeight,
  containerHeight,
  showTaskList,
  taskListWidth,
  onValidateDependencies,
  enableAutoSchedule,
  disableConstraints,
  onCascade,
  disableTaskNameEditing,
  disableDependencyEditing,
  highlightExpiredTasks,
  headerHeight,
  onAdd,
  onDelete,
  onInsertAfter,
  onReorder,
  onPromoteTask,
  onDemoteTask,
}, ref) => {
  const ganttLibRef = useRef<{ scrollToToday: () => void; scrollToTask: (taskId: string) => void } | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => ganttLibRef.current?.scrollToToday(),
    scrollToTask: (taskId: string) => ganttLibRef.current?.scrollToTask(taskId),
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
      taskListWidth={taskListWidth}
      onValidateDependencies={onValidateDependencies}
      enableAutoSchedule={enableAutoSchedule}
      disableConstraints={disableConstraints}
      onCascade={onCascade}
      disableTaskNameEditing={disableTaskNameEditing}
      disableDependencyEditing={disableDependencyEditing}
      highlightExpiredTasks={highlightExpiredTasks}
      headerHeight={headerHeight}
      onAdd={onAdd}
      onDelete={onDelete}
      onInsertAfter={onInsertAfter}
      onReorder={onReorder}
      onPromoteTask={onPromoteTask}
      onDemoteTask={onDemoteTask}
    />
  );
});

GanttChart.displayName = 'GanttChart';
