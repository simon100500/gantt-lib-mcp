import { useState } from 'react';
import type { TaskListColumn } from 'gantt-lib';
import { X } from 'lucide-react';

import type { Task, TaskStatus } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В работе',
  done: 'Выполнено',
  closed: 'Закрыто',
};

const STATUS_DOT_STYLES: Record<Exclude<TaskStatus, 'not_started'>, string> = {
  in_progress: 'bg-amber-400',
  done: 'bg-emerald-500',
  closed: 'bg-slate-400',
};

const MANUAL_STATUSES: Exclude<TaskStatus, 'not_started'>[] = ['in_progress', 'done', 'closed'];

interface CreateTaskStatusColumnOptions {
  readOnly?: boolean;
  onUpdateStatus: (task: Task, status: TaskStatus) => Promise<{ task: Task }>;
}

function TaskStatusCell({
  task,
  readOnly = false,
  onUpdateStatus,
}: {
  task: Task;
  readOnly?: boolean;
  onUpdateStatus: (task: Task, status: TaskStatus) => Promise<{ task: Task }>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = task.status ?? 'not_started';
  const hasVisibleStatus = status !== 'not_started';

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex w-full items-center justify-start rounded-none px-0 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent',
            !hasVisibleStatus && 'text-slate-300',
          )}
        >
          {hasVisibleStatus ? (
            <span className="inline-flex items-center gap-1.5 px-1.5">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_STYLES[status])} />
              <span className="truncate">{STATUS_LABELS[status]}</span>
            </span>
          ) : (
            <span className="px-1.5">&nbsp;</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-44 rounded-xl border-slate-200 p-1.5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          {MANUAL_STATUSES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              disabled={pending}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60',
                candidate === status && 'bg-slate-100',
              )}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await onUpdateStatus(task, candidate);
                  setOpen(false);
                } catch (submissionError) {
                  setError(submissionError instanceof Error ? submissionError.message : 'Не удалось изменить статус.');
                } finally {
                  setPending(false);
                }
              }}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_STYLES[candidate])} />
              <span className="min-w-0 flex-1 text-left">{STATUS_LABELS[candidate]}</span>
              {candidate === status ? (
                <span
                  role="button"
                  aria-label="Снять статус"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                  onClick={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPending(true);
                    setError(null);
                    try {
                      await onUpdateStatus(task, 'not_started');
                      setOpen(false);
                    } catch (submissionError) {
                      setError(submissionError instanceof Error ? submissionError.message : 'Не удалось изменить статус.');
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          ))}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function createTaskStatusColumn({
  readOnly = false,
  onUpdateStatus,
}: CreateTaskStatusColumnOptions): TaskListColumn<Task>[] {
  return [{
    id: 'status',
    header: 'Статус',
    width: 92,
    minWidth: 58,
    after: 'progress',
    renderCell: ({ task }) => (
      <TaskStatusCell task={task} readOnly={readOnly} onUpdateStatus={onUpdateStatus} />
    ),
  }];
}
