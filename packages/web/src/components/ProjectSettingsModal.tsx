import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Settings2, Trash2 } from 'lucide-react';

import type { TimelineMarker } from '../types.ts';

type EditableTimelineMarker = {
  key: string;
  date: string;
  color: string;
  name: string;
};

const MARKER_COLORS = ['#2563eb', '#dc2626', '#ea580c', '#16a34a', '#7c3aed'];

function createEditableMarker(marker?: TimelineMarker, index = 0): EditableTimelineMarker {
  return {
    key: crypto.randomUUID(),
    date: marker?.date?.slice(0, 10) ?? '',
    color: marker?.color?.trim() || MARKER_COLORS[index % MARKER_COLORS.length],
    name: marker?.name?.trim() ?? '',
  };
}

interface ProjectSettingsModalProps {
  ganttDayMode: 'business' | 'calendar';
  timelineMarkers: TimelineMarker[];
  pending: boolean;
  error: string | null;
  canShiftProject: boolean;
  canEditGanttDayMode: boolean;
  canEditTimelineMarkers: boolean;
  onClose: () => void;
  onOpenProjectShift: () => void;
  onSave: (settings: { ganttDayMode: 'business' | 'calendar'; timelineMarkers: TimelineMarker[] }) => void | Promise<void>;
}

export function ProjectSettingsModal({
  ganttDayMode,
  timelineMarkers,
  pending,
  error,
  canShiftProject,
  canEditGanttDayMode,
  canEditTimelineMarkers,
  onClose,
  onOpenProjectShift,
  onSave,
}: ProjectSettingsModalProps) {
  const [draftMode, setDraftMode] = useState<'business' | 'calendar'>(ganttDayMode);
  const [draftMarkers, setDraftMarkers] = useState<EditableTimelineMarker[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraftMode(ganttDayMode);
    setDraftMarkers(
      timelineMarkers.length > 0
        ? timelineMarkers.map((marker, index) => createEditableMarker(marker, index))
        : [],
    );
    setLocalError(null);
  }, [ganttDayMode, timelineMarkers]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    const normalizedMarkers: TimelineMarker[] = [];
    for (const marker of draftMarkers) {
      const date = marker.date.trim();
      const name = marker.name.trim();
      const color = marker.color.trim();

      if (!date) {
        if (name) {
          setLocalError('Для каждого маркера нужно указать дату.');
          return;
        }
        continue;
      }

      normalizedMarkers.push({
        date,
        ...(color ? { color } : {}),
        ...(name ? { name } : {}),
      });
    }

    await onSave({
      ganttDayMode: draftMode,
      timelineMarkers: normalizedMarkers,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <form
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { void handleSubmit(event); }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Settings2 className="h-5 w-5 text-primary" />
              Настройки проекта
            </h2>
            <p className="mt-1 text-sm text-slate-500">Режим расчёта дней, сдвиг графика и пользовательские маркеры.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Закрыть настройки проекта"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {(error || localError) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {localError ?? error}
            </div>
          )}

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Режим дней</h3>
              <p className="text-sm text-slate-500">Переключает расчёт задач между календарными и рабочими днями.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { value: 'calendar', label: 'Календарные дни', description: 'Учитываются все дни подряд.' },
                { value: 'business', label: 'Рабочие дни', description: 'Выходные исключаются из расчёта.' },
              ] as const).map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${draftMode === option.value ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'} ${!canEditGanttDayMode ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <input
                    type="radio"
                    name="project-day-mode"
                    value={option.value}
                    checked={draftMode === option.value}
                    onChange={() => setDraftMode(option.value)}
                    disabled={!canEditGanttDayMode || pending}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                    <span className="block text-sm text-slate-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Сдвиг проекта</h3>
                <p className="text-sm text-slate-500">Открывает календарь и переносит весь график на одинаковое число дней.</p>
              </div>
              <button
                type="button"
                onClick={onOpenProjectShift}
                disabled={!canShiftProject || pending}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CalendarClock className="h-4 w-4" />
                Сдвинуть проект...
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Маркеры на шкале</h3>
                <p className="text-sm text-slate-500">Можно добавить несколько вертикальных линий с датой и необязательным названием.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftMarkers((current) => [...current, createEditableMarker(undefined, current.length)]);
                }}
                disabled={!canEditTimelineMarkers || pending}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Добавить маркер
              </button>
            </div>

            <div className="space-y-3">
              {draftMarkers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Маркеры не добавлены.
                </div>
              ) : draftMarkers.map((marker, index) => (
                <div key={marker.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[140px_minmax(0,1fr)_120px_auto]">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Дата</span>
                    <input
                      type="date"
                      value={marker.date}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraftMarkers((current) => current.map((entry) => entry.key === marker.key ? { ...entry, date: value } : entry));
                      }}
                      disabled={!canEditTimelineMarkers || pending}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Название</span>
                    <input
                      type="text"
                      value={marker.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraftMarkers((current) => current.map((entry) => entry.key === marker.key ? { ...entry, name: value } : entry));
                      }}
                      disabled={!canEditTimelineMarkers || pending}
                      placeholder={`Маркер ${index + 1}`}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">Цвет</span>
                    <input
                      type="color"
                      value={marker.color}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraftMarkers((current) => current.map((entry) => entry.key === marker.key ? { ...entry, color: value } : entry));
                      }}
                      disabled={!canEditTimelineMarkers || pending}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftMarkers((current) => current.filter((entry) => entry.key !== marker.key));
                      }}
                      disabled={!canEditTimelineMarkers || pending}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Удалить маркер"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
