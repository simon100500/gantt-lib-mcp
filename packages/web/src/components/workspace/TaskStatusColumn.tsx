import { useState } from 'react';
import type { TaskListColumn } from 'gantt-lib';

import type { Task, TaskStatus } from '../../types.ts';
import { Button } from '../ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В работе',
  done: 'Выполнено',
  closed: 'Закрыто',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  not_started: 'text-slate-400',
  in_progress: 'text-amber-700',
  done: 'text-emerald-700',
  closed: 'text-slate-700',
};

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
          className={`inline-flex w-full items-center justify-start rounded-md px-2 py-1 text-sm transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent ${STATUS_STYLES[status]}`}
        >
          {status === 'not_started' ? '—' : STATUS_LABELS[status]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-2">
          {(['not_started', 'in_progress', 'done', 'closed'] as TaskStatus[]).map((candidate) => (
            <Button
              key={candidate}
              type="button"
              variant={candidate === status ? 'default' : 'outline'}
              size="sm"
              disabled={pending}
              className="justify-start"
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
              {STATUS_LABELS[candidate]}
            </Button>
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
    width: 108,
    minWidth: 76,
    after: 'completed-volume',
    renderCell: ({ task }) => (
      <TaskStatusCell task={task} readOnly={readOnly} onUpdateStatus={onUpdateStatus} />
    ),
  }];
}
