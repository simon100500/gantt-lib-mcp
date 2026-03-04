import type { Task } from '../types.ts';

interface GanttChartProps {
  tasks: Task[];
}

export function GanttChart({ tasks }: GanttChartProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
        <p>No tasks yet. Start a conversation to create your Gantt chart.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <p style={{ color: '#888' }}>{tasks.length} task(s) loaded. Gantt chart coming soon.</p>
    </div>
  );
}
