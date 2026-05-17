import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, History, LoaderCircle, Trash2, X } from 'lucide-react';

import type { CalendarDay, CalendarWeeklyPattern } from '../types.ts';
import { normalizeCalendarWeeklyPattern } from '../lib/projectScheduleOptions.ts';
import {
  formatCalendarDayKind,
  getPatternForPreset,
  getWeeklyPatternLabel,
  getWeeklyPatternPreset,
  isWorkingByPattern,
  normalizeProjectCalendarDays,
} from '../lib/projectCalendar.ts';

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatShortDisplayDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatMonthLabel(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function getTodayIsoDate(): string {
  return formatIsoDate(new Date());
}

function buildExceptionMap(calendarDays: CalendarDay[]): Map<string, CalendarDay['kind']> {
  return new Map(normalizeProjectCalendarDays(calendarDays).map((day) => [day.date, day.kind]));
}

interface ProjectCalendarModalProps {
  calendarWeeklyPattern: CalendarWeeklyPattern;
  calendarDays: CalendarDay[];
  pending: boolean;
  onClose: () => void;
  onApply: (payload: { calendarWeeklyPattern: CalendarWeeklyPattern; calendarDays: CalendarDay[] }) => void | Promise<void>;
}

type ResetAction = 'clear_exceptions' | 'reset_government';

function ResetConfirmationModal({
  action,
  pending,
  onCancel,
  onConfirm,
}: {
  action: ResetAction;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = action === 'reset_government' ? 'Сброс к гос. календарю' : 'Очистить исключения';
  const description = action === 'reset_government'
    ? 'Вернуть календарь к сохранённому государственному шаблону с праздниками и базовой неделей?'
    : 'Удалить все пользовательские исключения из календаря?';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-2 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectCalendarModal({
  calendarWeeklyPattern,
  calendarDays,
  pending,
  onClose,
  onApply,
}: ProjectCalendarModalProps) {
  const [draftPattern, setDraftPattern] = useState<CalendarWeeklyPattern>(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
  const [draftCalendarDays, setDraftCalendarDays] = useState<CalendarDay[]>(normalizeProjectCalendarDays(calendarDays));
  const [currentMonth, setCurrentMonth] = useState(getMonthStart(parseIsoDate(getTodayIsoDate())));
  const [confirmAction, setConfirmAction] = useState<ResetAction | null>(null);
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);

  useEffect(() => {
    const normalizedDays = normalizeProjectCalendarDays(calendarDays);
    setDraftPattern(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
    setDraftCalendarDays(normalizedDays);
    setCurrentMonth(getMonthStart(parseIsoDate(todayIsoDate)));
    setConfirmAction(null);
  }, [calendarDays, calendarWeeklyPattern, todayIsoDate]);

  const exceptionMap = useMemo(() => buildExceptionMap(draftCalendarDays), [draftCalendarDays]);
  const preset = getWeeklyPatternPreset(draftPattern);
  const journalGroups = useMemo(() => {
    const sortedDays = [...draftCalendarDays].sort((left, right) => left.date.localeCompare(right.date));
    const groups: Array<{ month: string; items: CalendarDay[] }> = [];

    for (const day of sortedDays) {
      const month = formatMonthLabel(day.date);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.month !== month) {
        groups.push({ month, items: [day] });
        continue;
      }
      lastGroup.items.push(day);
    }

    return groups;
  }, [draftCalendarDays]);
  const monthLabel = useMemo(() => currentMonth.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }), [currentMonth]);
  const calendarCells = useMemo(() => {
    const year = currentMonth.getUTCFullYear();
    const month = currentMonth.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const cells: Array<{ type: 'empty' } | { type: 'day'; dayNumber: number; date: string }> = [];

    for (let index = 0; index < offset; index += 1) {
      cells.push({ type: 'empty' });
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
      const date = formatIsoDate(new Date(Date.UTC(year, month, dayNumber)));
      cells.push({ type: 'day', dayNumber, date });
    }

    return cells;
  }, [currentMonth]);

  const setDayOverride = (date: string, kind: CalendarDay['kind'] | null) => {
    setDraftCalendarDays((current) => {
      const next = buildExceptionMap(current);
      if (kind === null) {
        next.delete(date);
      } else {
        next.set(date, kind);
      }
      return Array.from(next.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nextDate, nextKind]) => ({ date: nextDate, kind: nextKind }));
    });
  };

  const toggleDayOverride = (date: string) => {
    const dateObject = parseIsoDate(date);
    const baseIsWorking = isWorkingByPattern(draftPattern, dateObject);
    const existing = exceptionMap.get(date);
    const effectiveIsWorking = existing === 'working'
      ? true
      : existing === 'non_working'
        ? false
        : existing === 'shortened'
          ? true
          : baseIsWorking;

    setDayOverride(date, effectiveIsWorking ? 'non_working' : 'working');
  };

  const focusDate = (date: string) => {
    setCurrentMonth(getMonthStart(parseIsoDate(date)));
  };

  const handleResetConfirmation = () => {
    if (confirmAction === 'clear_exceptions') {
      setDraftCalendarDays([]);
    }

    if (confirmAction === 'reset_government') {
      setDraftPattern(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
      setDraftCalendarDays(normalizeProjectCalendarDays(calendarDays));
      setCurrentMonth(getMonthStart(parseIsoDate(todayIsoDate)));
    }

    setConfirmAction(null);
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-[860px] flex-col overflow-hidden border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarDays className="h-5 w-5 text-primary" />
              Настройка календаря
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {getWeeklyPatternLabel(draftPattern)}
              {draftCalendarDays.length > 0 ? `, исключений: ${draftCalendarDays.length}` : ', без исключений'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Закрыть календарь проекта"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[420px_minmax(220px,1fr)]">
          <div className="min-h-0 border-b border-slate-200 p-4 md:border-b-0 md:border-r">
            <section className="bg-slate-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Базовый режим</div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmAction('reset_government')}
                  className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                >
                  Сброс к гос. календарю
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('five-day'))}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${preset === 'five-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  5/2
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('six-day'))}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${preset === 'six-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  6/1
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('seven-day'))}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${preset === 'seven-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  7/0
                </button>
              </div>
            </section>

            <section className="mt-4 w-[360px] max-w-full bg-white p-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold capitalize text-slate-900">{monthLabel}</h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((current) => shiftMonth(current, -1))}
                    className="inline-flex h-7 w-7 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100"
                    aria-label="Предыдущий месяц"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth((current) => shiftMonth(current, 1))}
                    className="inline-flex h-7 w-7 items-center justify-center text-slate-600 transition-colors hover:bg-slate-100"
                    aria-label="Следующий месяц"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-x-1 gap-y-1.5">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
                  <div
                    key={weekday}
                    className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                  >
                    {weekday}
                  </div>
                ))}

                {calendarCells.map((cell, index) => {
                  if (cell.type === 'empty') {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const dayDate = parseIsoDate(cell.date);
                  const baseIsWorking = isWorkingByPattern(draftPattern, dayDate);
                  const exception = exceptionMap.get(cell.date) ?? null;
                  const isWorking = exception === 'working'
                    ? true
                    : exception === 'non_working'
                      ? false
                      : exception === 'shortened'
                        ? true
                        : baseIsWorking;
                  const isToday = cell.date === todayIsoDate;

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => toggleDayOverride(cell.date)}
                      className="relative flex aspect-square items-center justify-center"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                          isWorking
                            ? 'bg-transparent text-slate-800 hover:bg-slate-100'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                        } ${isToday ? 'ring-2 ring-slate-400 ring-offset-1 ring-offset-white' : ''}`}
                      >
                        {cell.dayNumber}
                      </span>
                      {exception && (
                        <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="flex min-h-0 flex-col bg-slate-50/30">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <History className="h-4 w-4 text-slate-500" />
                  Правки ({draftCalendarDays.length})
                </div>
                <p className="mt-1 text-sm text-slate-500">Клик по дню слева сразу переключает его между рабочим и выходным относительно базовой недели.</p>
              </div>
              {draftCalendarDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('clear_exceptions')}
                  className="inline-flex h-8 items-center rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
                >
                  Очистить
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-4">
              {journalGroups.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center bg-white px-6 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <History className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-700">Журнал изменений пуст.</p>
                  <p className="mt-1 text-sm text-slate-500">Выберите дни на календаре слева, чтобы добавить исключения.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {journalGroups.map((group) => (
                    <section key={group.month} className="space-y-2">
                      <h4 className="text-sm font-semibold capitalize text-slate-900">{group.month}</h4>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((day) => (
                          <div
                            key={day.date}
                            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm ${
                              day.kind === 'working'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            <span className={day.kind === 'working' ? 'font-medium text-blue-900' : 'font-medium text-rose-900'}>
                              {formatShortDisplayDate(day.date)}
                            </span>
                            <span>{formatCalendarDayKind(day.kind)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                focusDate(day.date);
                                setDayOverride(day.date, null);
                              }}
                              className={`inline-flex h-4 w-4 items-center justify-center transition-colors ${
                                day.kind === 'working' ? 'text-blue-500 hover:text-blue-700' : 'text-rose-500 hover:text-rose-700'
                              }`}
                              aria-label={`Удалить исключение ${day.date}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center bg-white px-4 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              void onApply({
                calendarWeeklyPattern: normalizeCalendarWeeklyPattern(draftPattern),
                calendarDays: normalizeProjectCalendarDays(draftCalendarDays),
              });
            }}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Применить
          </button>
        </div>
      </div>
      {confirmAction && (
        <ResetConfirmationModal
          action={confirmAction}
          pending={pending}
          onCancel={() => setConfirmAction(null)}
          onConfirm={handleResetConfirmation}
        />
      )}
    </div>
  );
}
