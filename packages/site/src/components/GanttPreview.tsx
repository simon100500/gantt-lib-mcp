import { useState, useRef, useEffect, useCallback } from 'react';
import { GanttChart } from 'gantt-lib';
import type { Task } from 'gantt-lib';
import 'gantt-lib/styles.css';

const DEMO_TASKS: Task[] = [
  // Parent 1: Фаза 1
  {
    id: 'phase-1',
    name: 'Фаза 1: Подготовка',
    startDate: '2026-03-01',
    endDate: '2026-03-20',
  },
  {
    id: 'task-1-1',
    name: 'Анализ требований',
    startDate: '2026-03-01',
    endDate: '2026-03-08',
    progress: 100,
    accepted: true,
    parentId: 'phase-1',
    dependencies: [],
  },
  {
    id: 'task-1-2',
    name: 'Прототипирование',
    startDate: '2026-03-09',
    endDate: '2026-03-18',
    progress: 30,
    parentId: 'phase-1',
    dependencies: [{ taskId: 'task-1-1', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-1-3',
    name: 'Согласование',
    startDate: '2026-03-15',
    endDate: '2026-03-20',
    progress: 0,
    parentId: 'phase-1',
    dependencies: [{ taskId: 'task-1-2', type: 'FS' as const, lag: 0 }],
  },

  // Parent 2: Фаза 2
  {
    id: 'phase-2',
    name: 'Фаза 2: Разработка',
    startDate: '2026-03-21',
    endDate: '2026-04-20',
    dependencies: [{ taskId: 'phase-1', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-2-1',
    name: 'Frontend разработка',
    startDate: '2026-03-21',
    endDate: '2026-04-10',
    progress: 25,
    parentId: 'phase-2',
    dependencies: [{ taskId: 'task-1-3', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-2-2',
    name: 'Backend API',
    startDate: '2026-03-25',
    endDate: '2026-04-12',
    progress: 15,
    parentId: 'phase-2',
    dependencies: [{ taskId: 'task-1-3', type: 'SS' as const, lag: 5 }],
  },
  {
    id: 'task-2-3',
    name: 'Интеграция',
    startDate: '2026-04-13',
    endDate: '2026-04-20',
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
    startDate: '2026-03-10',
    endDate: '2026-03-22',
    progress: 60,
    dependencies: [{ taskId: 'task-1-1', type: 'SS' as const, lag: 5 }],
  },
  {
    id: 'task-qa',
    name: 'QA тестирование',
    startDate: '2026-04-21',
    endDate: '2026-04-28',
    progress: 0,
    dependencies: [{ taskId: 'task-2-3', type: 'FS' as const, lag: 0 }],
  },
  {
    id: 'task-deploy',
    name: 'Деплой на прод',
    startDate: '2026-04-29',
    endDate: '2026-05-02',
    progress: 0,
    dependencies: [{ taskId: 'task-qa', type: 'FS' as const, lag: 0 }],
  },
];

const DAY_WIDTHS = {
  day: 28,
  week: 8,
  month: 3,
};

// Helper function to check if task is a parent
const isTaskParent = (taskId: string, tasks: Task[]): boolean => {
  return tasks.some(t => t.parentId === taskId);
};

// Helper function to get all descendants of a parent task
const getAllDescendants = (parentId: string, tasks: Task[]): Task[] => {
  const descendants: Task[] = [];
  const children = tasks.filter(t => t.parentId === parentId);
  for (const child of children) {
    descendants.push(child);
    descendants.push(...getAllDescendants(child.id, tasks));
  }
  return descendants;
};

interface GanttPreviewProps {
  initialTasks?: Task[];
}

export default function GanttPreview({ initialTasks }: GanttPreviewProps) {
  const allTasks = initialTasks ?? DEMO_TASKS;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [showTaskList, setShowTaskList] = useState(true);
  const ganttRef = useRef<{ scrollToToday: () => void }>(null);

  // Hide task list on mobile screens
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    setShowTaskList(!mql.matches);

    const listener = (e: MediaQueryListEvent) => setShowTaskList(!e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  // Reveal tasks one by one on mount
  useEffect(() => {
    if (!allTasks.length) return;
    let i = 0;
    const reveal = () => {
      i++;
      setTasks(allTasks.slice(0, i));
      if (i < allTasks.length) {
        setTimeout(reveal, 110);
      }
    };
    const id = setTimeout(reveal, 150);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to today once first task appears
  useEffect(() => {
    if (tasks.length === 1) {
      ganttRef.current?.scrollToToday();
    }
  }, [tasks.length]);

  const handleChange = useCallback((updatedTasks: Task[]) => {
    setTasks(prev => {
      // updatedTasks contains ONLY the changed tasks - merge them into prev
      const updatedMap = new Map(updatedTasks.map(t => [t.id, t]));
      return prev.map(t => updatedMap.get(t.id) ?? t);
    });
  }, []);

  const handleAdd = useCallback((newTask: Task) => {
    setTasks(prev => [...prev, newTask]);
  }, []);

  const handleDelete = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const handleInsertAfter = useCallback((taskId: string, newTask: Task) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      if (!task) return prev;

      // Case 1: Task is a parent → insert after all descendants
      if (isTaskParent(taskId, prev)) {
        const descendants = getAllDescendants(taskId, prev);
        const lastIndex = descendants.length > 0
          ? prev.findIndex(t => t.id === descendants[descendants.length - 1].id)
          : prev.findIndex(t => t.id === taskId);
        if (lastIndex === -1) return prev;
        const newTasks = [...prev];
        newTasks.splice(lastIndex + 1, 0, { ...newTask, parentId: undefined });
        return newTasks;
      }

      // Case 2: Task is a child → insert with same parentId after current task
      const index = prev.findIndex(t => t.id === taskId);
      if (index === -1) return prev;
      const newTasks = [...prev];
      newTasks.splice(index + 1, 0, { ...newTask, parentId: task.parentId });
      return newTasks;
    });
  }, []);

  const handleReorder = useCallback((reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  }, []);

  const handleToggleCollapse = useCallback((parentId: string) => {
    setCollapsedParentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parentId)) {
        newSet.delete(parentId);
      } else {
        newSet.add(parentId);
      }
      return newSet;
    });
  }, []);

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
              aria-label="Прокрутить к сегодня"
              className="flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 border border-slate-300 text-slate-600 rounded-md hover:border-primary hover:text-primary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-flag-triangle-right"><path d="M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5"/></svg>
              <span className="hidden sm:inline">Сегодня</span>
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
            dayWidth={DAY_WIDTHS[viewMode]}
            rowHeight={36}
            containerHeight="500px"
            onTasksChange={handleChange}
            onAdd={handleAdd}
            onDelete={handleDelete}
            onInsertAfter={handleInsertAfter}
            onReorder={handleReorder}
            collapsedParentIds={collapsedParentIds}
            onToggleCollapse={handleToggleCollapse}
            showTaskList={showTaskList}
            taskListWidth={140}
            viewMode={viewMode}
            businessDays={true}
            highlightExpiredTasks={true}
          />
        </div>
      </div>
    </div>
  );
}
