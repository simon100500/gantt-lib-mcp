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
    <div className="w-full max-w-[640px] px-6">
      {/* Header */}
      <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">
        Попробуйте интерактивный график
      </h2>

      {/* Gantt Chart Container */}
      <div className="border border-slate-200 rounded-xl shadow-md bg-white overflow-hidden">
        {/* Chart header */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="flex-1 text-sm font-medium text-slate-700">Интерактивный график</span>
          <span className="text-sm text-slate-500">4 задачи</span>
        </div>

        {/* Gantt Chart */}
        <div className="p-4">
          <GanttChart
            tasks={tasks}
            month={new Date('2026-03-01')}
            dayWidth={35}
            rowHeight={42}
            containerHeight="320px"
            onChange={handleChange}
          />
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>💡</span>
          <span className="text-slate-600">Перетащите задачи или растяните края</span>
        </div>
      </div>
    </div>
  );
}
