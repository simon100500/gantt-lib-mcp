import { useMemo, useRef, useState } from 'react';
import type { TaskListColumn } from 'gantt-lib';

import type { TaskProgressEntry } from '../../lib/apiTypes.ts';
import type { Task } from '../../types.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';

type TaskWorkMutationResult = {
  task: Task;
  progressEntries?: TaskProgressEntry[];
};

const SUGGESTED_WORK_UNITS = ['м', 'м2', 'м3', 'шт', 'кг', 'т', 'компл', 'пог.м', 'л', 'смена', 'ч'];

export interface CreateTaskWorkColumnsOptions {
  progressEntries: TaskProgressEntry[];
  readOnly?: boolean;
  onUpdateWorkMetadata: (
    task: Task,
    patch: { workVolume?: number | null; workUnit?: string | null },
  ) => Promise<TaskWorkMutationResult>;
  onAddProgressEntry: (
    task: Task,
    input: { entryDate: string; value: number; inputMode: 'volume' | 'percent' },
  ) => Promise<TaskWorkMutationResult>;
}

function formatMetricValue(value: number | null | undefined, maximumFractionDigits: number = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

function formatVolumeWithUnit(task: Task): string {
  const volumeLabel = formatMetricValue(task.workVolume);
  const unitLabel = task.workUnit?.trim();
  if (volumeLabel === '—') {
    return '—';
  }
  return unitLabel ? `${volumeLabel} ${unitLabel}` : volumeLabel;
}

function TaskWorkMetadataCell({
  task,
  readOnly = false,
  compact = false,
  onSubmit,
}: {
  task: Task;
  readOnly?: boolean;
  compact?: boolean;
  onSubmit: (task: Task, patch: { workVolume?: number | null; workUnit?: string | null }) => Promise<TaskWorkMutationResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volumeValue, setVolumeValue] = useState(task.workVolume === null || task.workVolume === undefined ? '' : String(task.workVolume));
  const [unitValue, setUnitValue] = useState(task.workUnit ?? '');
  const unitInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Popover onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setError(null);
        setVolumeValue(task.workVolume === null || task.workVolume === undefined ? '' : String(task.workVolume));
        setUnitValue(task.workUnit ?? '');
      }
    }} open={open}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex w-full items-center justify-start rounded-md py-1 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent ${compact ? 'px-0' : 'px-2'}`}
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          {formatVolumeWithUnit(task)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" onClick={(event) => event.stopPropagation()}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);

            try {
              const trimmedVolume = volumeValue.trim();
              let parsedVolume: number | null = null;
              if (trimmedVolume.length > 0) {
                parsedVolume = Number.parseFloat(trimmedVolume.replace(',', '.'));
                if (!Number.isFinite(parsedVolume) || parsedVolume < 0) {
                  throw new Error('Введите корректный объём.');
                }
              } else {
                parsedVolume = null;
              }
              await onSubmit(task, {
                workVolume: parsedVolume,
                workUnit: unitValue.trim() || null,
              });
              setOpen(false);
            } catch (submissionError) {
              setError(submissionError instanceof Error ? submissionError.message : 'Не удалось сохранить значение.');
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-900">Исходный объём</h4>
            <p className="text-sm text-slate-500">{task.name}</p>
          </div>
          <div className="grid grid-cols-[1.3fr_1fr] gap-2">
            <Input
              autoFocus
              disabled={pending}
              inputMode="decimal"
              onKeyDown={(event) => {
                if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
                  return;
                }

                if (/[\p{L}]/u.test(event.key)) {
                  event.preventDefault();
                  const nextUnitValue = `${unitValue}${event.key}`;
                  setUnitValue(nextUnitValue);
                  window.requestAnimationFrame(() => {
                    unitInputRef.current?.focus();
                    unitInputRef.current?.setSelectionRange(nextUnitValue.length, nextUnitValue.length);
                  });
                }
              }}
              onChange={(event) => setVolumeValue(event.target.value)}
              placeholder="Объём"
              step="0.01"
              type="number"
              value={volumeValue}
            />
            <Input
              disabled={pending}
              list="work-unit-suggestions"
              ref={unitInputRef}
              onChange={(event) => setUnitValue(event.target.value)}
              placeholder="Ед. изм."
              type="text"
              value={unitValue}
            />
            <datalist id="work-unit-suggestions">
              {SUGGESTED_WORK_UNITS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </div>
          <p className="text-[11px] text-slate-500">
            Можно выбрать из списка или ввести свою единицу вручную.
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button disabled={pending} size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button disabled={pending} size="sm" type="submit">
              Сохранить
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function TaskCompletedVolumeCell({
  task,
  entries,
  readOnly = false,
  onSubmit,
}: {
  task: Task;
  entries: TaskProgressEntry[];
  readOnly?: boolean;
  onSubmit: (
    task: Task,
    input: { entryDate: string; value: number; inputMode: 'volume' | 'percent' },
  ) => Promise<TaskWorkMutationResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(todayIsoDate());
  const [value, setValue] = useState('');
  const [inputMode, setInputMode] = useState<'volume' | 'percent'>('volume');

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => right.entryDate.localeCompare(left.entryDate)),
    [entries],
  );

  return (
    <Popover onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setPending(false);
        setError(null);
        setEntryDate(todayIsoDate());
        setValue('');
        setInputMode('volume');
      }
    }} open={open}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex w-full items-center justify-start rounded-md px-2 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent"
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <span>{formatMetricValue(task.completedVolume ?? 0)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" onClick={(event) => event.stopPropagation()}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsedValue = Number.parseFloat(value.replace(',', '.'));
            if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
              setError('Введите корректное положительное значение.');
              return;
            }

            setPending(true);
            setError(null);
            try {
              await onSubmit(task, { entryDate, value: parsedValue, inputMode });
              setOpen(false);
            } catch (submissionError) {
              setError(submissionError instanceof Error ? submissionError.message : 'Не удалось сохранить факт выполнения.');
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-900">Выполненный объём</h4>
            <p className="text-sm text-slate-500">{task.name}</p>
            <p className="text-sm text-slate-500">
              Всего: {formatMetricValue(task.workVolume)} {task.workUnit?.trim() || ''}
            </p>
          </div>

          {!task.workVolume || task.workVolume <= 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Сначала задайте общий объём работы, после этого можно вносить факт по датам.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm text-slate-600">
                  <span>Дата</span>
                  <Input disabled={pending} onChange={(event) => setEntryDate(event.target.value)} type="date" value={entryDate} />
                </label>
                <label className="space-y-1 text-sm text-slate-600">
                  <span>Значение</span>
                  <Input
                    disabled={pending}
                    inputMode="decimal"
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={inputMode === 'volume' ? 'Например, 35' : 'Например, 12.5'}
                    step="0.01"
                    type="number"
                    value={value}
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={pending}
                  size="sm"
                  type="button"
                  variant={inputMode === 'volume' ? 'default' : 'outline'}
                  onClick={() => setInputMode('volume')}
                >
                  В объёме
                </Button>
                <Button
                  disabled={pending}
                  size="sm"
                  type="button"
                  variant={inputMode === 'percent' ? 'default' : 'outline'}
                  onClick={() => setInputMode('percent')}
                >
                  В процентах
                </Button>
              </div>

              <p className="text-[11px] text-slate-500">
                Новое значение добавится к уже внесённому факту за выбранную дату.
              </p>
            </>
          )}

          {sortedEntries.length > 0 ? (
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-slate-500">Последние записи</p>
              <div className="space-y-1">
                {sortedEntries.slice(0, 5).map((entry) => (
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-700" key={entry.id}>
                    <span>{entry.entryDate}</span>
                    <span>{formatMetricValue(entry.amount)} {task.workUnit?.trim() || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button disabled={pending} size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button disabled={pending || !task.workVolume || task.workVolume <= 0} size="sm" type="submit">
              Добавить
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function createTaskWorkColumns({
  progressEntries,
  readOnly = false,
  onUpdateWorkMetadata,
  onAddProgressEntry,
}: CreateTaskWorkColumnsOptions): TaskListColumn<Task>[] {
  return [
    {
      id: 'work-volume',
      header: 'Объём',
      width: 124,
      minWidth: 110,
      after: 'duration',
      renderCell: ({ task }) => (
        <TaskWorkMetadataCell
          compact={true}
          onSubmit={onUpdateWorkMetadata}
          readOnly={readOnly}
          task={task}
        />
      ),
    },
    {
      id: 'completed-volume',
      header: 'Вып.',
      width: 110,
      minWidth: 100,
      after: 'work-volume',
      renderCell: ({ task }) => (
        <TaskCompletedVolumeCell
          entries={progressEntries.filter((entry) => entry.taskId === task.id)}
          onSubmit={onAddProgressEntry}
          readOnly={readOnly}
          task={task}
        />
      ),
    },
  ];
}
