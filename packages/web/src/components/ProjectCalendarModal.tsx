import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, History, LoaderCircle, Trash2, X } from 'lucide-react';

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

function formatDisplayDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortDisplayDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function getInitialSelectedDate(calendarDays: CalendarDay[]): string {
  return calendarDays[0]?.date ?? formatIsoDate(new Date());
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

export function ProjectCalendarModal({
  calendarWeeklyPattern,
  calendarDays,
  pending,
  onClose,
  onApply,
}: ProjectCalendarModalProps) {
  const [draftPattern, setDraftPattern] = useState<CalendarWeeklyPattern>(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
  const [draftCalendarDays, setDraftCalendarDays] = useState<CalendarDay[]>(normalizeProjectCalendarDays(calendarDays));
  const [selectedDate, setSelectedDate] = useState(getInitialSelectedDate(calendarDays));
  const [currentMonth, setCurrentMonth] = useState(getMonthStart(parseIsoDate(getInitialSelectedDate(calendarDays))));

  useEffect(() => {
    const normalizedDays = normalizeProjectCalendarDays(calendarDays);
    const initialDate = getInitialSelectedDate(normalizedDays);
    setDraftPattern(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
    setDraftCalendarDays(normalizedDays);
    setSelectedDate(initialDate);
    setCurrentMonth(getMonthStart(parseIsoDate(initialDate)));
  }, [calendarDays, calendarWeeklyPattern]);

  const exceptionMap = useMemo(() => buildExceptionMap(draftCalendarDays), [draftCalendarDays]);
  const selectedDateObject = useMemo(() => parseIsoDate(selectedDate), [selectedDate]);
  const selectedException = exceptionMap.get(selectedDate) ?? null;
  const selectedBaseIsWorking = isWorkingByPattern(draftPattern, selectedDateObject);
  const selectedEffectiveIsWorking = selectedException === 'working'
    ? true
    : selectedException === 'non_working'
      ? false
      : selectedException === 'shortened'
        ? true
        : selectedBaseIsWorking;
  const preset = getWeeklyPatternPreset(draftPattern);
  const journalDays = useMemo(
    () => [...draftCalendarDays].sort((left, right) => right.date.localeCompare(left.date)),
    [draftCalendarDays],
  );
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
    setSelectedDate(date);

    if (existing) {
      setDayOverride(date, null);
      return;
    }

    setDayOverride(date, baseIsWorking ? 'non_working' : 'working');
  };

  const focusDate = (date: string) => {
    setSelectedDate(date);
    setCurrentMonth(getMonthStart(parseIsoDate(date)));
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
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('five-day'))}
                  className={`inline-flex h-8 items-center px-3 text-sm font-medium transition-colors ${preset === 'five-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  5/2
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('six-day'))}
                  className={`inline-flex h-8 items-center px-3 text-sm font-medium transition-colors ${preset === 'six-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  6/1
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('seven-day'))}
                  className={`inline-flex h-8 items-center px-3 text-sm font-medium transition-colors ${preset === 'seven-day' ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
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
                  const isSelected = cell.date === selectedDate;

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => toggleDayOverride(cell.date)}
                      className="relative flex aspect-square items-center justify-center"
                      aria-pressed={isSelected}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground hover:bg-primary'
                            : isWorking
                              ? 'bg-transparent text-slate-800 hover:bg-slate-100'
                              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
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

            <section className="mt-4 w-[360px] max-w-full bg-white px-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Выбранный день</div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{formatDisplayDate(selectedDate)}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Сейчас день {selectedEffectiveIsWorking ? 'рабочий' : 'выходной'}
                    {selectedException ? `, исключение: ${formatCalendarDayKind(selectedException)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleDayOverride(selectedDate)}
                    className="inline-flex h-8 items-center gap-2 bg-slate-100 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    <Check className="h-4 w-4" />
                    Инвертировать
                  </button>
                  {selectedException && (
                    <button
                      type="button"
                      onClick={() => setDayOverride(selectedDate, null)}
                      className="inline-flex h-8 items-center bg-slate-100 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                    >
                      Убрать исключение
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="min-h-0 bg-slate-50/30">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <History className="h-4 w-4 text-slate-500" />
                  Правки ({draftCalendarDays.length})
                </div>
                <p className="mt-1 text-sm text-slate-500">Клик по дню слева добавляет или убирает исключение относительно базовой недели.</p>
              </div>
              {draftCalendarDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraftCalendarDays([])}
                  className="inline-flex h-8 items-center bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Очистить
                </button>
              )}
            </div>

            <div className="h-full overflow-y-auto p-3">
              {journalDays.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center bg-white px-6 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <History className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-700">Журнал изменений пуст.</p>
                  <p className="mt-1 text-sm text-slate-500">Выберите дни на календаре слева, чтобы добавить исключения.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {journalDays.map((day) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between gap-3 bg-white px-3 py-2 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{formatShortDisplayDate(day.date)}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.06em] text-slate-500">{formatCalendarDayKind(day.kind)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          focusDate(day.date);
                          setDayOverride(day.date, null);
                        }}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Удалить исключение ${day.date}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
    </div>
  );
}
