import { GanttChart as GanttLibChart } from 'gantt-lib';
import type { Task } from '../types.ts';

interface GanttChartProps {
  tasks: Task[];
  onChange?: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
}

export function GanttChart({ tasks, onChange }: GanttChartProps) {
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
      tasks={tasks}
      onChange={onChange}
    />
  );
}
