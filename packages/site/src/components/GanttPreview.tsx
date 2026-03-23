import { useState, useRef, useEffect } from 'react';
import { GanttChart } from 'gantt-lib';
import type { Task } from 'gantt-lib';
import 'gantt-lib/styles.css';

const DEMO_TASKS: Task[] = [
  // Parent 1: Фаза 1
  {
    id: 'phase-1',
    name: 'Фаза 1: Подготовка',
    startDate: '2026-03-24',
    endDate: '2026-04-10',
    color: '#1d4ed8',
  },
  {
    id: 'task-1-1',
    name: 'Анализ требований',
    startDate: '2026-03-24',
    endDate: '2026-03-28',
    color: '#3b82f6',
    progress: 100,
    accepted: true,
    parentId: 'phase-1',
    dependencies: [],
  },
  {
    id: 'task-1-2',
    name: 'Прототипирование',
    startDate: '2026-03-29',
    endDate: '2026-04-05',
    color: '#8b5cf6',
    progress: 40,
    parentId: 'phase-1',
    dependencies: [{ taskId: 'task-1-1', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-1-3',
    name: 'Согласование',
    startDate: '2026-04-06',
    endDate: '2026-04-10',
    color: '#06b6d4',
    progress: 0,
    parentId: 'phase-1',
    dependencies: [{ taskId: 'task-1-2', type: 'FS' as const, lag: 0 }],
  },

  // Parent 2: Фаза 2
  {
    id: 'phase-2',
    name: 'Фаза 2: Разработка',
    startDate: '2026-04-11',
    endDate: '2026-05-05',
    color: '#7c3aed',
    dependencies: [{ taskId: 'phase-1', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-2-1',
    name: 'Frontend разработка',
    startDate: '2026-04-11',
    endDate: '2026-04-25',
    color: '#a78bfa',
    progress: 60,
    parentId: 'phase-2',
    dependencies: [{ taskId: 'task-1-3', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-2-2',
    name: 'Backend API',
    startDate: '2026-04-15',
    endDate: '2026-04-28',
    color: '#6366f1',
    progress: 30,
    parentId: 'phase-2',
    dependencies: [{ taskId: 'task-1-3', type: 'SS' as const, lag: 5 }],
  },
  {
    id: 'task-2-3',
    name: 'Интеграция',
    startDate: '2026-04-29',
    endDate: '2026-05-05',
    color: '#3b82f6',
    progress: 0,
    parentId: 'phase-2',
    dependencies: [
      { taskId: 'task-2-1', type: 'FS' as const, lag: 0 },
      { taskId: 'task-2-2', type: 'FS' as const, lag: 0 },
    ],
  },

  // Independent tasks
  {
    id: 'task-design',
    name: 'Дизайн UI',
    startDate: '2026-04-01',
    endDate: '2026-04-12',
    color: '#ec4899',
    progress: 80,
    accepted: true,
    dependencies: [{ taskId: 'task-1-1', type: 'SS' as const, lag: 5 }],
  },
  {
    id: 'task-qa',
    name: 'QA тестирование',
    startDate: '2026-05-06',
    endDate: '2026-05-12',
    color: '#ea580c',
    progress: 0,
    dependencies: [{ taskId: 'task-2-3', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-deploy',
    name: 'Деплой на прод',
    startDate: '2026-05-13',
    endDate: '2026-05-15',
    color: '#16a34a',
    progress: 0,
    dependencies: [{ taskId: 'task-qa', type: 'FS' as const, lag: 0 }],
  },
];

const DAY_WIDTHS = {
  day: 28,
  week: 8,
  month: 3,
};

export default function GanttPreview() {
  const [tasks, setTasks] = useState(DEMO_TASKS);
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const ganttRef = useRef<{ scrollToToday: () => void }>(null);

  useEffect(() => {
    // Scroll to today after component mounts
    setTimeout(() => {
      ganttRef.current?.scrollToToday();
    }, 100);
  }, []);

  const handleChange = (updatedTasks: Task[]) => {
    setTasks(prev => updatedTasks);
  };

  const handleToggleCollapse = (parentId: string) => {
    setCollapsedParentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parentId)) {
        newSet.delete(parentId);
      } else {
        newSet.add(parentId);
      }
      return newSet;
    });
  };

  const handleScrollToToday = () => {
    ganttRef.current?.scrollToToday();
  };

  return (
    <div className="mx-auto w-[90%]">
      {/* Subtitle */}
      <p className="text-center text-sm text-slate-500 mb-3">
        Полностью редактируемый график — перетаскивайте задачи, растягивайте края, сворачивайте группы
      </p>

      {/* Gantt Chart Container */}
      <div className="border border-slate-200 rounded-xl shadow-md bg-white overflow-hidden">
        {/* Chart header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          {/* Project name */}
          <span className="text-sm font-medium text-slate-700" style={{ fontFamily: 'Cascadia Mono, monospace' }}>
            Разработка платформы
          </span>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Today button */}
            <button
              type="button"
              onClick={handleScrollToToday}
              className="flex h-8 items-center px-3 text-xs font-medium transition-colors focus-visible:outline-none border border-slate-300 text-slate-600 rounded-md hover:border-primary hover:text-primary"
            >
              Сегодня
            </button>

            {/* View mode toggle */}
            <div className="inline-flex rounded-md">
              {(['day', 'week', 'month'] as const).map((nextMode, index) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => setViewMode(nextMode)}
                  className={`flex h-8 items-center px-3 text-xs font-medium transition-colors focus-visible:outline-none border ${
                    index === 0 ? 'rounded-l-md' : ''
                  } ${index === 2 ? 'rounded-r-md' : ''} ${
                    viewMode === nextMode
                      ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
                      : 'border-slate-300 text-slate-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {nextMode === 'day' && (
                    <>
                      <span className="hidden sm:inline">День</span>
                      <span className="sm:hidden">Д</span>
                    </>
                  )}
                  {nextMode === 'week' && (
                    <>
                      <span className="hidden sm:inline">Неделя</span>
                      <span className="sm:hidden">Н</span>
                    </>
                  )}
                  {nextMode === 'month' && (
                    <>
                      <span className="hidden sm:inline">Месяц</span>
                      <span className="sm:hidden">М</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Gantt Chart */}
        <div className="overflow-x-auto">
          <GanttChart
            ref={ganttRef}
            tasks={tasks}
            month={new Date('2026-03-01')}
            dayWidth={DAY_WIDTHS[viewMode]}
            rowHeight={36}
            containerHeight="500px"
            onChange={handleChange}
            collapsedParentIds={collapsedParentIds}
            onToggleCollapse={handleToggleCollapse}
            showTaskList={true}
            taskListWidth={140}
            viewMode={viewMode}
          />
        </div>
      </div>
    </div>
  );
}
