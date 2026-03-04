import { forwardRef, useRef, useImperativeHandle } from 'react';
import { GanttChart as GanttLibChart } from 'gantt-lib';
import type { Task, ValidationResult } from '../types.ts';

export interface GanttChartProps {
  tasks: Task[];
  onChange?: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  dayWidth?: number;
  rowHeight?: number;
  containerHeight?: string | number;
  showTaskList?: boolean;
  taskListWidth?: number;
  onValidateDependencies?: (result: ValidationResult) => void;
  enableAutoSchedule?: boolean;
  onCascade?: (tasks: Task[]) => void;
  disableTaskNameEditing?: boolean;
  disableDependencyEditing?: boolean;
  highlightExpiredTasks?: boolean;
  headerHeight?: number;
}

export interface GanttChartRef {
  scrollToToday: () => void;
  scrollToTask: (taskId: string) => void;
}

export const GanttChart = forwardRef<GanttChartRef, GanttChartProps>(({
  tasks,
  onChange,
  dayWidth,
  rowHeight,
  containerHeight,
  showTaskList,
  taskListWidth,
  onValidateDependencies,
  enableAutoSchedule,
  onCascade,
  disableTaskNameEditing,
  disableDependencyEditing,
  highlightExpiredTasks,
  headerHeight,
}, ref) => {
  const ganttLibRef = useRef<{ scrollToToday: () => void; scrollToTask: (taskId: string) => void } | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => ganttLibRef.current?.scrollToToday(),
    scrollToTask: (taskId: string) => ganttLibRef.current?.scrollToTask(taskId),
  }));

  // Preserve empty state for better UX
  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
        <p>No tasks yet. Start a conversation to create your Gantt chart.</p>
      </div>
    );
  }

  return (
    <GanttLibChart
      ref={ganttLibRef}
      tasks={tasks}
      onChange={onChange}
      dayWidth={dayWidth}
      rowHeight={rowHeight}
      containerHeight={containerHeight}
      showTaskList={showTaskList}
      taskListWidth={taskListWidth}
      onValidateDependencies={onValidateDependencies}
      enableAutoSchedule={enableAutoSchedule}
      onCascade={onCascade}
      disableTaskNameEditing={disableTaskNameEditing}
      disableDependencyEditing={disableDependencyEditing}
      highlightExpiredTasks={highlightExpiredTasks}
      headerHeight={headerHeight}
    />
  );
});

GanttChart.displayName = 'GanttChart';
