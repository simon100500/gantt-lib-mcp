import { useState } from 'react';
import { GanttChart } from 'gantt-lib';
import type { Task } from 'gantt-lib';
import 'gantt-lib/styles.css';

const DEMO_TASKS: Task[] = [
  {
    id: '1',
    name: 'Анализ требований',
    startDate: '2026-03-24',
    endDate: '2026-03-28',
    color: '#1d4ed8',
    progress: 100,
    accepted: true,
  },
  {
    id: '2',
    name: 'Прототипирование',
    startDate: '2026-03-29',
    endDate: '2026-04-05',
    color: '#7c3aed',
    progress: 40,
  },
  {
    id: '3',
    name: 'Разработка Frontend',
    startDate: '2026-04-06',
    endDate: '2026-04-15',
    color: '#0891b2',
    progress: 0,
  },
  {
    id: '4',
    name: 'Тестирование',
    startDate: '2026-04-16',
    endDate: '2026-04-20',
    color: '#ea580c',
    progress: 0,
  },
];

export default function GanttPreview() {
  const [tasks, setTasks] = useState(DEMO_TASKS);

  const handleChange = (updatedTasks: Task[]) => {
    setTasks(prev => updatedTasks);
  };

  return (
    <div className="relative mx-auto mb-20 max-w-[900px] px-4 md:px-8">
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3 text-[12px] font-bold text-secondary-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="flex-1">Интерактивный график</span>
          <span className="font-medium text-muted-foreground">4 задачи</span>
        </div>

        {/* Gantt Chart */}
        <div className="p-4">
          <GanttChart
            tasks={tasks}
            month={new Date('2026-03-01')}
            dayWidth={40}
            rowHeight={40}
            onChange={handleChange}
          />
        </div>

        {/* Footer badge */}
        <div className="flex items-center gap-1.5 border-t border-border bg-accent-bg px-4 py-2 text-[11px] font-semibold text-primary">
          <span>&#10022;</span>
          Перетащите задачи, чтобы изменить сроки &middot; Растяните края для длительности
        </div>
      </div>
    </div>
  );
}
