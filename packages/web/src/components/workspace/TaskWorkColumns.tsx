import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import type { TaskListColumn } from 'gantt-lib';
import { AlertCircle, Calendar, Check, History, X } from 'lucide-react';

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
    return '-';
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
  if (volumeLabel === '-') {
    return '-';
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
  const volumeLabel = formatVolumeWithUnit(task);
  const hasVolume = volumeLabel !== '-';

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
          className={`inline-flex w-full items-center justify-start py-1 text-sm transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent ${hasVolume ? 'text-slate-700' : 'text-slate-400'} ${compact ? 'rounded-none px-0' : 'rounded-md px-2'}`}
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <span className={compact ? 'px-1.5' : undefined}>{volumeLabel}</span>
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button className="shrink-0 px-3" disabled={pending} size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button className="flex-1" disabled={pending} size="sm" type="submit">
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
  onUpdateMetadata,
  onSubmit,
}: {
  task: Task;
  entries: TaskProgressEntry[];
  readOnly?: boolean;
  onUpdateMetadata: (task: Task, patch: { workVolume?: number | null; workUnit?: string | null }) => Promise<TaskWorkMutationResult>;
  onSubmit: (
    task: Task,
    input: { entryDate: string; value: number; inputMode: 'volume' | 'percent' },
  ) => Promise<TaskWorkMutationResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(todayIsoDate());
  const [valueInUnits, setValueInUnits] = useState('');
  const [valueInPercent, setValueInPercent] = useState('');
  const [totalVolumeValue, setTotalVolumeValue] = useState(task.workVolume === null || task.workVolume === undefined ? '' : String(task.workVolume));
  const [unitValue, setUnitValue] = useState(task.workUnit ?? '');
  const [activeField, setActiveField] = useState<'volume' | 'percent'>('volume');
  const totalVolumeInputRef = useRef<HTMLInputElement | null>(null);
  const volumeInputRef = useRef<HTMLInputElement | null>(null);
  const unitInputRef = useRef<HTMLInputElement | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => right.entryDate.localeCompare(left.entryDate)),
    [entries],
  );
  const hasCompletedVolume = entries.length > 0;
  const completedVolumeLabel = hasCompletedVolume ? formatMetricValue(task.completedVolume) : '-';
  const persistedTotalVolume = task.workVolume ?? 0;
  const hasPersistedTotalVolume = persistedTotalVolume > 0;
  const parsedDraftTotalVolume = Number.parseFloat(totalVolumeValue.replace(',', '.'));
  const totalVolume = hasPersistedTotalVolume
    ? persistedTotalVolume
    : (Number.isFinite(parsedDraftTotalVolume) && parsedDraftTotalVolume > 0 ? parsedDraftTotalVolume : 0);
  const completedVolume = task.completedVolume ?? 0;
  const currentPercent = totalVolume > 0 ? (completedVolume / totalVolume) * 100 : 0;
  const parsedAddedVolume = Number.parseFloat(valueInUnits.replace(',', '.'));
  const currentAdded = Number.isFinite(parsedAddedVolume) ? parsedAddedVolume : 0;
  const totalAfterAdd = completedVolume + currentAdded;
  const finalPercent = totalVolume > 0 ? (totalAfterAdd / totalVolume) * 100 : 0;
  const isInputEmpty = valueInUnits.trim() === '' || currentAdded === 0;
  const isOverflow = totalVolume > 0 && totalAfterAdd > totalVolume;
  const isNegativeResult = currentAdded < 0;
  const normalizedUnitValue = unitValue.trim();
  const canSaveTotalVolume = !hasPersistedTotalVolume && Number.isFinite(parsedDraftTotalVolume) && parsedDraftTotalVolume > 0;
  const canAddProgress = totalVolume > 0 && Number.isFinite(parsedAddedVolume) && parsedAddedVolume > 0;
  const canSubmit = !pending && (canSaveTotalVolume || canAddProgress);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusId = window.setTimeout(() => {
      if (!hasPersistedTotalVolume) {
        totalVolumeInputRef.current?.focus();
        totalVolumeInputRef.current?.select();
        return;
      }

      volumeInputRef.current?.focus();
      volumeInputRef.current?.select();
    }, 10);

    return () => window.clearTimeout(focusId);
  }, [hasPersistedTotalVolume, open]);

  const handleFocusSelect = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  const handleUnitsChange = (nextValue: string) => {
    setValueInUnits(nextValue);
    setActiveField('volume');

    if (nextValue.trim() === '') {
      setValueInPercent(formatMetricValue(currentPercent, 1));
      return;
    }

    const parsedValue = Number.parseFloat(nextValue.replace(',', '.'));
    if (!Number.isFinite(parsedValue) || totalVolume <= 0) {
      setValueInPercent('');
      return;
    }

    const nextPercent = ((completedVolume + parsedValue) / totalVolume) * 100;
    setValueInPercent(String(Number(nextPercent.toFixed(1))));
  };

  const handlePercentChange = (nextValue: string) => {
    setValueInPercent(nextValue);
    setActiveField('percent');

    if (nextValue.trim() === '') {
      setValueInUnits('');
      return;
    }

    const parsedPercent = Number.parseFloat(nextValue.replace(',', '.'));
    if (!Number.isFinite(parsedPercent) || totalVolume <= 0) {
      setValueInUnits('');
      return;
    }

    const targetTotal = (parsedPercent / 100) * totalVolume;
    const neededAddition = targetTotal - completedVolume;
    setValueInUnits(String(Number(neededAddition.toFixed(2))));
  };

  return (
    <>
      <button
        className={`inline-flex w-full items-center justify-start rounded-md px-2 py-1 text-sm transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent ${hasCompletedVolume ? 'text-slate-700' : 'text-slate-400'}`}
        disabled={readOnly}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          setPending(false);
          setError(null);
          setEntryDate(todayIsoDate());
          setTotalVolumeValue(task.workVolume === null || task.workVolume === undefined ? '' : String(task.workVolume));
          setUnitValue(task.workUnit ?? '');
          setValueInUnits('');
          setValueInPercent(formatMetricValue(currentPercent, 1));
          setActiveField('volume');
        }}
        type="button"
      >
        <span>{completedVolumeLabel}</span>
      </button>

      {open ? (
        <div
          aria-labelledby={`task-progress-modal-title-${task.id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-3 py-4 sm:px-4 sm:py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setOpen(false);
            }
          }}
          role="dialog"
        >
          <form
            className="max-h-[calc(100vh-2rem)] w-full max-w-[24rem] overflow-hidden rounded-xl border border-[#dfe1e6] bg-white shadow-[0_20px_60px_rgba(9,30,66,0.22)] sm:max-h-[calc(100vh-3rem)]"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={async (event) => {
              event.preventDefault();

              if (!canSubmit) {
                setError('Заполните общий объём или добавьте выполненный факт.');
                return;
              }

              setPending(true);
              setError(null);

              try {
                let resolvedTask = task;

                if (!hasPersistedTotalVolume) {
                  if (!Number.isFinite(parsedDraftTotalVolume) || parsedDraftTotalVolume <= 0) {
                    throw new Error('Введите общий объём работы.');
                  }

                  const metadataResult = await onUpdateMetadata(task, {
                    workVolume: parsedDraftTotalVolume,
                    workUnit: normalizedUnitValue || null,
                  });
                  resolvedTask = metadataResult.task;
                }

                if (canAddProgress) {
                  await onSubmit(resolvedTask, { entryDate, value: parsedAddedVolume, inputMode: 'volume' });
                }

                setOpen(false);
              } catch (submissionError) {
                setError(submissionError instanceof Error ? submissionError.message : 'Не удалось сохранить факт выполнения.');
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#dfe1e6] px-5 py-4">
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-[15px] font-bold leading-6 text-[#172b4d]" id={`task-progress-modal-title-${task.id}`}>
                  {task.name}
                </h4>
                <p className="mt-1 text-[12px] text-[#6b778c]">
                  Факт: {formatMetricValue(completedVolume, 2)} из {formatMetricValue(totalVolume, 2)} {normalizedUnitValue || task.workUnit?.trim() || ''}
                </p>
              </div>
              <button
                aria-label="Закрыть окно ввода объёма"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6b778c] transition-colors hover:bg-[#f4f5f7] hover:text-[#172b4d] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-5 py-5">
              {!hasPersistedTotalVolume ? (
                <div className="space-y-3 rounded-lg border border-[#dfe1e6] bg-[#f7f8fa] px-4 py-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">Сначала задайте общий объём</p>
                    <p className="text-[12px] leading-5 text-[#6b778c]">Можно сделать это прямо здесь, без перехода в соседнюю колонку.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_7rem]">
                    <label className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">Общий объём</span>
                      <Input
                        ref={totalVolumeInputRef}
                        className="h-10 border-[#dfe1e6] bg-white text-sm font-semibold text-[#172b4d] shadow-none"
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
                        onChange={(event) => setTotalVolumeValue(event.target.value)}
                        onFocus={handleFocusSelect}
                        placeholder="Например, 5000"
                        step="0.01"
                        type="number"
                        value={totalVolumeValue}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">Ед. изм.</span>
                      <Input
                        ref={unitInputRef}
                        className="h-10 border-[#dfe1e6] bg-white text-sm font-semibold text-[#172b4d] shadow-none"
                        disabled={pending}
                        list="task-progress-unit-suggestions"
                        onChange={(event) => setUnitValue(event.target.value)}
                        placeholder="м2"
                        type="text"
                        value={unitValue}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">
                    Добавить ({normalizedUnitValue || task.workUnit?.trim() || 'ед.'})
                  </span>
                  <Input
                    ref={volumeInputRef}
                    className={`h-12 border px-4 text-xl font-bold shadow-none ${activeField === 'volume' ? 'border-primary bg-white text-[#172b4d]' : 'border-[#dfe1e6] bg-[#f7f8fa] text-[#44546f]'}`}
                    disabled={pending}
                    inputMode="decimal"
                    onChange={(event) => handleUnitsChange(event.target.value)}
                    onFocus={(event) => {
                      setActiveField('volume');
                      handleFocusSelect(event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && canSubmit) {
                        event.preventDefault();
                        void event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={valueInUnits}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">
                    Итоговый %
                  </span>
                  <Input
                    className={`h-12 border px-4 text-xl font-bold shadow-none ${activeField === 'percent' ? 'border-primary bg-white text-[#172b4d]' : 'border-[#dfe1e6] bg-[#f7f8fa] text-[#44546f]'}`}
                    disabled={pending || totalVolume <= 0}
                    inputMode="decimal"
                    onChange={(event) => handlePercentChange(event.target.value)}
                    onFocus={(event) => {
                      setActiveField('percent');
                      handleFocusSelect(event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && canSubmit) {
                        event.preventDefault();
                        void event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="0"
                    step="0.1"
                    type="number"
                    value={valueInPercent}
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-lg border border-[#dfe1e6] bg-[#f7f8fa] px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b778c]">
                      {isInputEmpty ? 'Всего' : 'Станет всего'}
                    </div>
                    <div className={`break-words text-sm font-bold ${isOverflow || isNegativeResult ? 'text-red-700' : 'text-[#172b4d]'}`}>
                      {formatMetricValue(totalAfterAdd, 2)} <span className="font-normal text-[#6b778c]">/</span> {formatMetricValue(totalVolume, 2)} {normalizedUnitValue || task.workUnit?.trim() || ''}
                    </div>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b778c]">Итог</div>
                    <div className={`text-sm font-bold ${isInputEmpty ? 'text-[#172b4d]' : 'text-primary'}`}>
                      {formatMetricValue(finalPercent, 1)}%
                    </div>
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-[#dfe1e6]">
                  <div
                    className="flex h-full overflow-hidden rounded-full"
                    style={{ width: `${Math.min(100, Math.max(finalPercent, currentPercent)).toFixed(2)}%` }}
                  >
                    <div
                      className="h-full bg-slate-400"
                      style={{ width: `${totalVolume > 0 ? Math.min(100, (completedVolume / totalVolume) * 100) : 0}%` }}
                    />
                    <div
                      className={isOverflow ? 'h-full bg-red-500' : 'h-full bg-primary'}
                      style={{ width: `${totalVolume > 0 ? Math.max(0, Math.min(100, (currentAdded / totalVolume) * 100)) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {(isOverflow || isNegativeResult) && (
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium ${isNegativeResult ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {isNegativeResult
                      ? 'Итоговый объём не может быть меньше текущего факта.'
                      : `Перебор на ${formatMetricValue(totalAfterAdd - totalVolume, 2)} ${normalizedUnitValue || task.workUnit?.trim() || ''}`}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem] md:items-end">
                <label className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">
                    <Calendar className="h-3.5 w-3.5" />
                    Дата работ
                  </span>
                  <Input
                    className="h-9 border-[#dfe1e6] bg-white text-sm text-[#172b4d] shadow-none"
                    disabled={pending}
                    onChange={(event) => setEntryDate(event.target.value)}
                    type="date"
                    value={entryDate}
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#44546f]">Быстро</span>
                  <Button
                    className="h-9 w-full border-[#dfe1e6] bg-white px-3 text-xs font-bold text-[#44546f] shadow-none hover:bg-[#f4f5f7] hover:text-primary"
                    disabled={pending || totalVolume <= 0}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => handlePercentChange('100')}
                  >
                    Закрыть в 100%
                  </Button>
                </div>
              </div>

              <p className="break-words text-[11px] leading-5 text-[#6b778c]">
                Новое значение добавится к уже внесённому факту за выбранную дату.
              </p>

              {sortedEntries.length > 0 ? (
                <div className="space-y-3 border-t border-[#dfe1e6] pt-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b778c]">
                    <History className="h-3.5 w-3.5" />
                    История
                  </div>
                  <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                    {sortedEntries.slice(0, 5).map((entry) => (
                      <div className="flex items-center justify-between rounded-md border border-[#dfe1e6] bg-white px-3 py-2" key={entry.id}>
                        <div>
                          <div className="text-sm font-semibold text-[#172b4d]">
                            {formatMetricValue(entry.amount, 2)} {normalizedUnitValue || task.workUnit?.trim() || ''}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#6b778c]">{entry.entryDate}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <datalist id="task-progress-unit-suggestions">
                {SUGGESTED_WORK_UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#dfe1e6] bg-[#f7f8fa] px-5 py-4 sm:flex-row sm:items-center">
              <Button className="w-full px-3 text-[#44546f] sm:w-auto" disabled={pending} size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button className="h-10 w-full gap-2 px-4 sm:ml-auto sm:w-auto sm:min-w-36" disabled={!canSubmit} type="submit">
                <Check className="h-4 w-4" />
                Подтвердить
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
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
      width: 96,
      minWidth: 55,
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
      width: 82,
      minWidth: 50,
      after: 'work-volume',
      renderCell: ({ task }) => (
        <TaskCompletedVolumeCell
          entries={progressEntries.filter((entry) => entry.taskId === task.id)}
          onUpdateMetadata={onUpdateWorkMetadata}
          onSubmit={onAddProgressEntry}
          readOnly={readOnly}
          task={task}
        />
      ),
    },
  ];
}
