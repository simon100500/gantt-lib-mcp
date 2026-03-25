import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { GanttChart } from 'gantt-lib';
import type { Task, GanttChartHandle } from 'gantt-lib';
import 'gantt-lib/styles.css';


const DAY_WIDTHS = {
  day: 22,
  week: 8,
  month: 3,
};

const collectParentIds = (tasks: Task[]): Set<string> =>
  new Set(tasks.filter(task => isTaskParent(task.id, tasks)).map(task => task.id));

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
  title?: string;
}

function GanttPreview({ initialTasks, title }: GanttPreviewProps) {
  const allTasks = initialTasks ?? [];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [showTaskList, setShowTaskList] = useState(true);
  const ganttRef = useRef<GanttChartHandle>(null);
  const previewRootRef = useRef<HTMLDivElement>(null);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingTasksRef = useRef<Task[] | null>(null);
  const frameRef = useRef<number | null>(null);

  // Hide task list on mobile screens
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    setShowTaskList(!mql.matches);

    const listener = (e: MediaQueryListEvent) => setShowTaskList(!e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  // Reveal tasks one by one when the selected template changes.
  useEffect(() => {
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];
    setTasks([]);
    setCollapsedParentIds(new Set());
    pendingTasksRef.current = null;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!allTasks.length) {
      return;
    }

    let i = 0;
    const reveal = () => {
      i++;
      setTasks(allTasks.slice(0, i));
      if (i < allTasks.length) {
        revealTimersRef.current.push(setTimeout(reveal, 110));
      }
    };
    revealTimersRef.current.push(setTimeout(reveal, 150));

    return () => {
      revealTimersRef.current.forEach(clearTimeout);
      revealTimersRef.current = [];
    };
  }, [allTasks]);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    const container = previewRootRef.current?.querySelector<HTMLElement>('.gantt-container');
    if (!container) return;
    container.style.setProperty('--gantt-container-border-radius', '0px 0px 12px 12px');
    container.style.borderRadius = '0px 0px 12px 12px';
  }, [tasks.length, viewMode, showTaskList]);

  // Scroll to first task once it appears
  useEffect(() => {
    if (tasks.length === 1 && allTasks[0]) {
      ganttRef.current?.scrollToTask(allTasks[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length]);

  const handleChange = useCallback((updatedTasks: Task[]) => {
    pendingTasksRef.current = updatedTasks;

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      const pendingTasks = pendingTasksRef.current;
      pendingTasksRef.current = null;
      frameRef.current = null;

      if (!pendingTasks || pendingTasks.length === 0) {
        return;
      }

      setTasks(prev => {
        // gantt-lib emits partial task updates during drag; merge once per frame.
        const updatedMap = new Map(pendingTasks.map(t => [t.id, t]));
        return prev.map(t => updatedMap.get(t.id) ?? t);
      });
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

  const handleCollapseAll = useCallback(() => {
    setCollapsedParentIds(collectParentIds(tasks));
  }, [tasks]);

  const handleExpandAll = useCallback(() => {
    setCollapsedParentIds(new Set());
  }, []);

  return (
    <div ref={previewRootRef} className="mx-auto w-[90%]">
      {/* Gantt Chart Container */}
      <div className="border border-slate-200 rounded-xl shadow-md bg-white overflow-hidden">
        {/* Chart header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          {/* Project name */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700" style={{ fontFamily: 'Cascadia Mono, monospace' }}>
              {title ?? 'Мой проект'}
            </span>
            <div className="flex items-center gap-1 sm:ml-3">
              <button
                type="button"
                onClick={handleCollapseAll}
                aria-label="Свернуть все"
                title="Свернуть все родительские задачи"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-transparent text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleExpandAll}
                aria-label="Развернуть все"
                title="Развернуть все родительские задачи"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-transparent text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleScrollToToday}
                aria-label="Прокрутить к сегодня"
                title="Сегодня"
                className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-transparent px-2.5 text-[12px] font-medium text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5" /></svg>
                <span className="hidden sm:inline">Сегодня</span>
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="ml-2 inline-flex rounded-md sm:ml-3">
              {(['day', 'week', 'month'] as const).map((nextMode, index) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => setViewMode(nextMode)}
                  className={`flex h-8 items-center px-3 text-xs font-medium transition-colors focus-visible:outline-none border ${index === 0 ? 'rounded-l-md' : ''
                    } ${index === 2 ? 'rounded-r-md' : ''} ${viewMode === nextMode
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
        <div>
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center text-slate-400 text-sm animate-pulse" style={{ height: '500px' }}>
              Генерирую график…
            </div>
          ) : <GanttChart
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
            taskListWidth={550}
            viewMode={viewMode}
            businessDays={true}
            highlightExpiredTasks={true}
          />}
        </div>
      </div>
    </div>
  );
}

export default memo(GanttPreview);
