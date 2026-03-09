import { forwardRef, useRef, useImperativeHandle, useState } from 'react';
import { GanttChart as GanttLibChart } from 'gantt-lib';
import { ArrowUp } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { cn } from '@/lib/utils';
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
  disableConstraints?: boolean;
  onCascade?: (tasks: Task[]) => void;
  disableTaskNameEditing?: boolean;
  disableDependencyEditing?: boolean;
  highlightExpiredTasks?: boolean;
  headerHeight?: number;
  onAdd?: (newTask: Task) => void;
  onDelete?: (taskId: string) => void;
  onInsertAfter?: (taskId: string, newTask: Task) => void;
  onPromptSubmit?: (prompt: string) => void;
  onStartEmpty?: () => void;
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
  disableConstraints,
  onCascade,
  disableTaskNameEditing,
  disableDependencyEditing,
  highlightExpiredTasks,
  headerHeight,
  onAdd,
  onDelete,
  onInsertAfter,
  onPromptSubmit,
  onStartEmpty,
}, ref) => {
  const ganttLibRef = useRef<{ scrollToToday: () => void; scrollToTask: (taskId: string) => void } | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => ganttLibRef.current?.scrollToToday(),
    scrollToTask: (taskId: string) => ganttLibRef.current?.scrollToTask(taskId),
  }));

  const handleSubmitPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptValue.trim();
    if (!trimmed) return;
    onPromptSubmit?.(trimmed);
    setPromptValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    const newHeight = el.scrollHeight;
    el.style.height = newHeight + 'px';
    // Only show scrollbar when content actually overflows (max ~5 rows)
    el.style.overflowY = newHeight > 120 ? 'auto' : 'hidden';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitPrompt(e);
    }
  };

  // Preserve empty state for better UX with interactive start screen
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <form onSubmit={handleSubmitPrompt} className="flex flex-col items-center gap-3 w-full max-w-[420px]">
          <h2 className="text-lg font-semibold text-slate-800">С чего начнём?</h2>

          <textarea
            ref={textareaRef}
            name="prompt"
            rows={1}
            value={promptValue}
            onChange={e => setPromptValue(e.target.value)}
            onInput={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Опишите ваш проект..."
            autoComplete="off"
            spellCheck={false}
            style={{ maxHeight: '7.5rem' }}
            className={cn(
              'w-full px-3 py-2.5 text-sm rounded-md',
              'border border-slate-200 bg-slate-50 placeholder:text-slate-400',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-transparent',
              'resize-none overflow-y-auto leading-relaxed',
            )}
          />

          <div className="flex items-center gap-2 w-full">
            <Button
              type="submit"
              disabled={!promptValue.trim()}
              className="flex-1 h-9 gap-1.5"
            >
              Создать по описанию
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">или</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onStartEmpty}
            className="w-full h-9 border-slate-200 text-slate-600 hover:text-slate-900"
          >
            Пустой график
          </Button>
        </form>
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
      disableConstraints={disableConstraints}
      onCascade={onCascade}
      disableTaskNameEditing={disableTaskNameEditing}
      disableDependencyEditing={disableDependencyEditing}
      highlightExpiredTasks={highlightExpiredTasks}
      headerHeight={headerHeight}
      onAdd={onAdd}
      onDelete={onDelete}
      onInsertAfter={onInsertAfter}
    />
  );
});

GanttChart.displayName = 'GanttChart';
