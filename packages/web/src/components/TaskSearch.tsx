import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X, Search, CornerDownLeft } from 'lucide-react';

import { Button } from './ui/button';
import { useUIStore } from '../stores/useUIStore';
import { useTaskStore } from '../stores/useTaskStore';
import { deriveVisibleSnapshot, useProjectStore } from '../stores/useProjectStore.ts';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectCommands } from '../hooks/useProjectCommands';
import type { Task } from '../types';
import { extractTaskNames, isMultilineTaskInput } from '../lib/taskSearchInput';

interface TaskSearchProps {
  onTaskNavigate?: (taskId: string) => void;
  readOnly?: boolean;
}

export function TaskSearch({ onTaskNavigate, readOnly = false }: TaskSearchProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoNavigatedRef = useRef<string>('');

  const searchQuery = useUIStore((state) => state.searchQuery);
  const searchResults = useUIStore((state) => state.searchResults);
  const searchIndex = useUIStore((state) => state.searchIndex);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const navNext = useUIStore((state) => state.navNext);
  const navPrev = useUIStore((state) => state.navPrev);
  const clearSearch = useUIStore((state) => state.clearSearch);
  const setTempHighlightedTaskId = useUIStore((state) => state.setTempHighlightedTaskId);

  const accessToken = useAuthStore((state) => state.accessToken);
  const activeSource = useTaskStore((state) => state.activeSource);
  const setTasks = useTaskStore((state) => state.setTasks);
  const taskStoreTasks = useTaskStore((state) => state.tasks);
  const confirmedSnapshot = useProjectStore((state) => state.confirmed.snapshot);
  const pendingCommands = useProjectStore((state) => state.pending);
  const dragPreview = useProjectStore((state) => state.dragPreview);
  const scheduleOptions = useProjectStore((state) => state.scheduleOptions);
  const [inputValue, setInputValue] = useState(searchQuery);
  const tasks = useMemo(() => (
    activeSource === 'auth'
      ? deriveVisibleSnapshot(confirmedSnapshot, pendingCommands, dragPreview, scheduleOptions).tasks
      : taskStoreTasks
  ), [activeSource, confirmedSnapshot, dragPreview, pendingCommands, scheduleOptions, taskStoreTasks]);
  const { createTasks } = useProjectCommands(accessToken);

  const multilineMode = isMultilineTaskInput(inputValue);
  const parsedTaskNames = useMemo(() => extractTaskNames(inputValue), [inputValue]);
  const taskCountToCreate = parsedTaskNames.length;

  useEffect(() => {
    if (multilineMode) {
      if (searchQuery || searchResults.length > 0) {
        clearSearch();
      }
      return;
    }

    setSearchQuery(inputValue, tasks);
  }, [clearSearch, inputValue, multilineMode, searchQuery, searchResults.length, setSearchQuery, tasks]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    element.style.height = '36px';
    const nextHeight = Math.min(element.scrollHeight, 144);
    element.style.height = `${Math.max(nextHeight, 36)}px`;
  }, [inputValue]);

  useEffect(() => {
    if (multilineMode || !onTaskNavigate) {
      return;
    }

    const trimmedQuery = inputValue.trim();
    const firstResultId = searchResults[0];

    if (!trimmedQuery || !firstResultId) {
      lastAutoNavigatedRef.current = '';
      return;
    }

    const signature = `${trimmedQuery}::${firstResultId}`;
    if (lastAutoNavigatedRef.current === signature) {
      return;
    }

    lastAutoNavigatedRef.current = signature;
    requestAnimationFrame(() => {
      onTaskNavigate(firstResultId);
    });
  }, [inputValue, multilineMode, onTaskNavigate, searchResults]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (event.key === '+' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigateToIndex = (index: number) => {
    const taskId = searchResults[index];
    if (taskId && onTaskNavigate) {
      onTaskNavigate(taskId);
    }
  };

  const handleNavNext = () => {
    if (searchResults.length === 0) return;
    const newIndex = (searchIndex + 1) % searchResults.length;
    navNext();
    handleNavigateToIndex(newIndex);
  };

  const handleNavPrev = () => {
    if (searchResults.length === 0) return;
    const newIndex = searchIndex === 0 ? searchResults.length - 1 : searchIndex - 1;
    navPrev();
    handleNavigateToIndex(newIndex);
  };

  const handleClear = () => {
    clearSearch();
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleCreateTasks = async () => {
    if (readOnly) {
      return;
    }

    const taskNames = parsedTaskNames.length > 0 ? parsedTaskNames : ['Новая задача'];
    const today = new Date().toISOString().split('T')[0];
    const newTasks: Task[] = taskNames.map((taskName) => ({
      id: crypto.randomUUID(),
      name: taskName,
      startDate: today,
      endDate: today,
    }));

    if (activeSource !== 'auth') {
      setTasks(prev => [...prev, ...newTasks]);
    }

    clearSearch();
    setInputValue('');

    const lastTempTaskId = newTasks[newTasks.length - 1]?.id;

    requestAnimationFrame(() => {
      if (lastTempTaskId && onTaskNavigate) {
        onTaskNavigate(lastTempTaskId);
      }
    });

    setTempHighlightedTaskId(lastTempTaskId ?? null);
    setTimeout(() => {
      setTempHighlightedTaskId(null);
    }, 2000);

    if (accessToken) {
      try {
        const createdTasks = await createTasks(newTasks.map((task) => ({
          id: task.id,
          name: task.name,
          startDate: task.startDate as string,
          endDate: task.endDate as string,
        })));

        if (activeSource !== 'auth') {
          const tempToCreated = new Map(
            newTasks.map((task, index) => [task.id, createdTasks[index]] as const).filter((entry) => Boolean(entry[1])),
          );
          setTasks(prev => prev.map((task) => tempToCreated.get(task.id) ?? task));
        }

        const lastCreatedTask = createdTasks[createdTasks.length - 1];
        if (lastCreatedTask && lastCreatedTask.id !== lastTempTaskId) {
          setTempHighlightedTaskId(lastCreatedTask.id);
          setTimeout(() => {
            setTempHighlightedTaskId(null);
          }, 2000);
          requestAnimationFrame(() => {
            if (onTaskNavigate) {
              onTaskNavigate(lastCreatedTask.id);
            }
          });
        }
      } catch (error) {
        console.error('Failed to create tasks:', error);
        if (activeSource !== 'auth') {
          const tempIds = new Set(newTasks.map((task) => task.id));
          setTasks(prev => prev.filter((task) => !tempIds.has(task.id)));
        }
        setTempHighlightedTaskId(null);
      }
    }
  };

  const hasResults = searchResults.length > 0;
  const showCounter = inputValue.trim().length > 0 && !multilineMode;
  const createHintVisible = inputValue.trim().length > 0 && !hasResults && !readOnly;
  const createButtonLabel = taskCountToCreate > 1 ? `+ ${taskCountToCreate} задач` : '+ Задача';
  const createButtonTitle = taskCountToCreate > 1 ? `Создать ${taskCountToCreate} задач` : 'Создать задачу';

  return (
    <div className="relative flex min-w-0 w-full max-w-[43rem] shrink items-start gap-2 overflow-visible">
      <div className="relative flex h-9 min-w-0 flex-1 items-start overflow-visible">
        <div className="absolute inset-x-0 top-0 z-20 min-w-0 group">
          <div className="absolute left-3 top-[18px] z-10 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none group-focus-within:text-indigo-500">
            <Search size={16} strokeWidth={2.2} />
          </div>

          <textarea
            ref={inputRef}
            value={inputValue}
            rows={1}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleCreateTasks();
              } else if (!multilineMode && event.key === 'ArrowDown') {
                event.preventDefault();
                handleNavNext();
              } else if (!multilineMode && event.key === 'ArrowUp') {
                event.preventDefault();
                handleNavPrev();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                if (inputValue) {
                  handleClear();
                } else {
                  inputRef.current?.blur();
                }
              }
            }}
            placeholder={readOnly ? 'Поиск...' : 'Поиск или новые задачи...'}
            className={`block h-9 w-full resize-none rounded-lg border border-slate-200 bg-white pl-10 pr-36 py-2 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 ${multilineMode ? 'overflow-y-auto' : 'overflow-hidden'}`}
            aria-label="Поиск задач"
            title="Ctrl+K или +. Enter добавляет строку, Ctrl+Enter создаёт задачи"
          />
          <div className="absolute right-1 top-1 flex items-center gap-0.5">
            {showCounter && hasResults && (
              <span className="mr-1 shrink-0 text-xs font-medium tabular-nums text-slate-500">
                {searchIndex + 1}/{searchResults.length}
              </span>
            )}
            {createHintVisible && (
              <div className="mr-1 flex items-center gap-1 text-xs text-slate-400">
                {multilineMode ? (
                  <span>Ctrl+Enter создать {taskCountToCreate || 1}</span>
                ) : (
                  <>
                    <kbd className="pointer-events-none select-none inline-flex h-4.5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[11px] font-medium">
                      Ctrl
                    </kbd>
                    <CornerDownLeft className="h-3 w-3" />
                    <span>создать</span>
                  </>
                )}
              </div>
            )}
            {hasResults && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavPrev}
                  className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700"
                  title="Предыдущий результат"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavNext}
                  className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700"
                  title="Следующий результат"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {inputValue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                title="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {!inputValue && (
              <kbd className="relative top-1 select-none hidden sm:inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 font-sans text-[12px] font-medium text-slate-400 group-focus-within:hidden mr-1.5" title="Нажмите клавишу &quot;+&quot;">
                +
              </kbd>
            )}
          </div>
        </div>
      </div>
      {!readOnly && (
        <Button
          variant="default"
          size="sm"
          onClick={handleCreateTasks}
          title={createButtonTitle}
          className="mt-0.5 h-8 shrink-0 px-2.5 text-xs font-medium shadow-none"
        >
          {createButtonLabel}
        </Button>
      )}
    </div>
  );
}
