import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'gantt-lib';
import { CalendarDays, LoaderCircle, RotateCcw } from 'lucide-react';

import type { CalendarDay, CalendarWeeklyPattern } from '../types.ts';
import { DEFAULT_CALENDAR_WEEKLY_PATTERN, normalizeCalendarWeeklyPattern } from '../lib/projectScheduleOptions.ts';
import {
  formatCalendarDayKind,
  getPatternForPreset,
  getWeeklyPatternLabel,
  getWeeklyPatternPreset,
  isWorkingByPattern,
  normalizeProjectCalendarDays,
} from '../lib/projectCalendar.ts';

type BulkMode = 'working_range' | 'non_working_range' | 'working_saturdays' | 'non_working_saturdays' | 'clear_range';

const WEEKDAY_ROWS: Array<{ key: keyof CalendarWeeklyPattern; short: string; label: string }> = [
  { key: 'mon', short: 'Пн', label: 'Понедельник' },
  { key: 'tue', short: 'Вт', label: 'Вторник' },
  { key: 'wed', short: 'Ср', label: 'Среда' },
  { key: 'thu', short: 'Чт', label: 'Четверг' },
  { key: 'fri', short: 'Пт', label: 'Пятница' },
  { key: 'sat', short: 'Сб', label: 'Суббота' },
  { key: 'sun', short: 'Вс', label: 'Воскресенье' },
];

const BULK_MODE_OPTIONS: Array<{ value: BulkMode; label: string }> = [
  { value: 'non_working_range', label: 'Сделать диапазон выходным' },
  { value: 'working_range', label: 'Сделать диапазон рабочим' },
  { value: 'working_saturdays', label: 'Сделать все субботы в диапазоне рабочими' },
  { value: 'non_working_saturdays', label: 'Сделать все субботы в диапазоне выходными' },
  { value: 'clear_range', label: 'Очистить исключения в диапазоне' },
];

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  const [bulkStart, setBulkStart] = useState(getInitialSelectedDate(calendarDays));
  const [bulkEnd, setBulkEnd] = useState(getInitialSelectedDate(calendarDays));
  const [bulkMode, setBulkMode] = useState<BulkMode>('non_working_range');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedDays = normalizeProjectCalendarDays(calendarDays);
    setDraftPattern(normalizeCalendarWeeklyPattern(calendarWeeklyPattern));
    setDraftCalendarDays(normalizedDays);
    const initialDate = getInitialSelectedDate(normalizedDays);
    setSelectedDate(initialDate);
    setBulkStart(initialDate);
    setBulkEnd(initialDate);
    setLocalError(null);
  }, [calendarDays, calendarWeeklyPattern]);

  const exceptionMap = useMemo(() => buildExceptionMap(draftCalendarDays), [draftCalendarDays]);
  const selectedDateObject = useMemo(() => parseIsoDate(selectedDate), [selectedDate]);
  const selectedException = exceptionMap.get(selectedDate) ?? null;
  const selectedIsWorking = selectedException === 'working'
    ? true
    : selectedException === 'non_working'
      ? false
      : isWorkingByPattern(draftPattern, selectedDateObject);

  const applyDayOverride = (date: string, kind: CalendarDay['kind'] | null) => {
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

  const handleBulkApply = () => {
    setLocalError(null);
    if (!bulkStart || !bulkEnd) {
      setLocalError('Укажите диапазон для массового действия.');
      return;
    }

    const start = parseIsoDate(bulkStart <= bulkEnd ? bulkStart : bulkEnd);
    const end = parseIsoDate(bulkStart <= bulkEnd ? bulkEnd : bulkStart);
    const next = buildExceptionMap(draftCalendarDays);

    for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const currentDate = formatIsoDate(cursor);
      if (bulkMode === 'clear_range') {
        next.delete(currentDate);
        continue;
      }
      if (bulkMode === 'working_saturdays' || bulkMode === 'non_working_saturdays') {
        if (cursor.getUTCDay() !== 6) {
          continue;
        }
        next.set(currentDate, bulkMode === 'working_saturdays' ? 'working' : 'non_working');
        continue;
      }
      next.set(currentDate, bulkMode === 'working_range' ? 'working' : 'non_working');
    }

    setDraftCalendarDays(Array.from(next.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, kind]) => ({ date, kind })));
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
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarDays className="h-5 w-5 text-primary" />
              Календарь проекта
            </h2>
            <p className="text-sm text-slate-500">
              {getWeeklyPatternLabel(draftPattern)}{draftCalendarDays.length > 0 ? `, исключений: ${draftCalendarDays.length}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Закрыть календарь проекта"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 gap-5 overflow-y-auto px-5 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('five-day'))}
                  className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium ${getWeeklyPatternPreset(draftPattern) === 'five-day' ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  5/2
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('six-day'))}
                  className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium ${getWeeklyPatternPreset(draftPattern) === 'six-day' ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  6/1
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPattern(getPatternForPreset('seven-day'))}
                  className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium ${getWeeklyPatternPreset(draftPattern) === 'seven-day' ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  7/0
                </button>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-2">
                {WEEKDAY_ROWS.map((day) => (
                  <label key={day.key} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
                    <span className="text-xs font-semibold text-slate-500">{day.short}</span>
                    <input
                      type="checkbox"
                      checked={draftPattern[day.key]}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setDraftPattern((current) => ({ ...current, [day.key]: checked }));
                      }}
                      className="h-4 w-4 rounded border-slate-300 accent-primary"
                    />
                  </label>
                ))}
              </div>
            </section>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white [&_.gantt-cal-container]:max-h-[420px]">
              <Calendar
                initialDate={selectedDateObject}
                isWeekend={(date) => !isWorkingByPattern(draftPattern, date)}
                onSelect={(date) => setSelectedDate(formatIsoDate(date))}
                selected={selectedDateObject}
              />
            </div>
          </div>

          <div className="space-y-5">
            {(localError) && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {localError}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{formatDisplayDate(selectedDate)}</h3>
                  <p className="text-sm text-slate-500">
                    Сейчас день {selectedIsWorking ? 'рабочий' : 'выходной'}
                    {selectedException ? `, исключение: ${formatCalendarDayKind(selectedException)}` : ''}
                  </p>
                </div>
                {selectedException && (
                  <button
                    type="button"
                    onClick={() => applyDayOverride(selectedDate, null)}
                    className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-700"
                  >
                    Убрать исключение
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyDayOverride(selectedDate, 'working')}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  Сделать рабочим
                </button>
                <button
                  type="button"
                  onClick={() => applyDayOverride(selectedDate, 'non_working')}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  Сделать выходным
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Массовое действие</h3>
              <div className="mt-3 grid gap-3">
                <select
                  value={bulkMode}
                  onChange={(event) => setBulkMode(event.target.value as BulkMode)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                >
                  {BULK_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={bulkStart}
                    onChange={(event) => setBulkStart(event.target.value)}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  />
                  <input
                    type="date"
                    value={bulkEnd}
                    onChange={(event) => setBulkEnd(event.target.value)}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleBulkApply}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  Применить к диапазону
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Исключения</h3>
                <button
                  type="button"
                  onClick={() => {
                    setDraftPattern(DEFAULT_CALENDAR_WEEKLY_PATTERN);
                    setDraftCalendarDays([]);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить
                </button>
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {draftCalendarDays.length === 0 ? (
                  <p className="text-sm text-slate-500">Исключений пока нет.</p>
                ) : draftCalendarDays.map((day) => (
                  <div key={day.date} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{formatDisplayDate(day.date)}</div>
                      <div className="text-xs text-slate-500">{formatCalendarDayKind(day.kind)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyDayOverride(day.date, null)}
                      className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs text-slate-600"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Сохранить календарь
          </button>
        </div>
      </div>
    </div>
  );
}
