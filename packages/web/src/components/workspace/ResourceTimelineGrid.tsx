import { useMemo } from 'react';

import type { ResourcePlannerInterval, ResourcePlannerResource } from '../../lib/apiTypes.ts';
import type { PlannerCorrectionTarget } from '../../stores/useUIStore.ts';

const MAX_RENDERED_DAYS = 45;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ResourceTimelineGridProps {
  resources: ResourcePlannerResource[];
  emptyMessage: string;
  onCorrectConflict: (target: PlannerCorrectionTarget) => void;
  maxRenderedDays?: number;
}

interface ValidTimelineInterval {
  interval: ResourcePlannerInterval;
  start: Date;
  end: Date;
  startIndex: number;
  durationDays: number;
  clipped: boolean;
}

interface InvalidTimelineInterval {
  interval: ResourcePlannerInterval;
  reason: string;
}

interface TimelineResource {
  resource: ResourcePlannerResource;
  validIntervals: ValidTimelineInterval[];
  invalidIntervals: InvalidTimelineInterval[];
}

interface TimelineModel {
  days: Date[];
  resources: TimelineResource[];
  invalidIntervals: InvalidTimelineInterval[];
  totalRangeDays: number;
  clamped: boolean;
}

function parsePlannerDate(value: string): Date | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === value ? date : null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDayDelta(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_IN_MS);
}

function getInvalidReason(interval: ResourcePlannerInterval, start: Date | null, end: Date | null): string | null {
  if (!start || !end) {
    return `Некорректные даты: ${interval.startDate || '—'} → ${interval.endDate || '—'}`;
  }

  if (end.getTime() < start.getTime()) {
    return `Дата окончания раньше даты начала: ${interval.startDate} → ${interval.endDate}`;
  }

  return null;
}

function buildTimelineModel(resources: ResourcePlannerResource[], maxRenderedDays: number): TimelineModel {
  const resourceBuckets = resources.map((resource) => ({
    resource,
    parsed: resource.intervals.map((interval) => {
      const start = parsePlannerDate(interval.startDate);
      const end = parsePlannerDate(interval.endDate);
      const reason = getInvalidReason(interval, start, end);
      return { interval, start, end, reason };
    }),
  }));

  const allValid = resourceBuckets
    .flatMap((bucket) => bucket.parsed)
    .filter((entry): entry is typeof entry & { start: Date; end: Date; reason: null } => !entry.reason && Boolean(entry.start) && Boolean(entry.end));

  const rangeStart = allValid.reduce<Date | null>((earliest, entry) => {
    if (!earliest || entry.start.getTime() < earliest.getTime()) {
      return entry.start;
    }
    return earliest;
  }, null);

  const rangeEnd = allValid.reduce<Date | null>((latest, entry) => {
    if (!latest || entry.end.getTime() > latest.getTime()) {
      return entry.end;
    }
    return latest;
  }, null);

  const totalRangeDays = rangeStart && rangeEnd ? getDayDelta(rangeStart, rangeEnd) + 1 : 0;
  const renderedDayCount = Math.min(totalRangeDays, Math.max(1, maxRenderedDays));
  const days = rangeStart
    ? Array.from({ length: renderedDayCount }, (_, index) => new Date(rangeStart.getTime() + index * DAY_IN_MS))
    : [];
  const clamped = totalRangeDays > renderedDayCount;

  const timelineResources = resourceBuckets.map<TimelineResource>((bucket) => {
    const invalidIntervals = bucket.parsed
      .filter((entry): entry is typeof entry & { reason: string } => Boolean(entry.reason))
      .map(({ interval, reason }) => ({ interval, reason }));

    const validIntervals = bucket.parsed
      .filter((entry): entry is typeof entry & { start: Date; end: Date; reason: null } => !entry.reason && Boolean(entry.start) && Boolean(entry.end) && Boolean(rangeStart))
      .map(({ interval, start, end }) => {
        const rawStartIndex = rangeStart ? getDayDelta(rangeStart, start) : 0;
        const rawEndIndex = rangeStart ? getDayDelta(rangeStart, end) : 0;
        const startIndex = Math.min(Math.max(rawStartIndex, 0), Math.max(renderedDayCount - 1, 0));
        const endIndex = Math.min(Math.max(rawEndIndex, 0), Math.max(renderedDayCount - 1, 0));
        return {
          interval,
          start,
          end,
          startIndex,
          durationDays: Math.max(1, endIndex - startIndex + 1),
          clipped: rawStartIndex !== startIndex || rawEndIndex !== endIndex,
        };
      });

    return {
      resource: bucket.resource,
      validIntervals,
      invalidIntervals,
    };
  });

  return {
    days,
    resources: timelineResources,
    invalidIntervals: timelineResources.flatMap((resource) => resource.invalidIntervals),
    totalRangeDays,
    clamped,
  };
}

function getBarClassName(interval: ResourcePlannerInterval): string {
  return interval.hasConflict
    ? 'group min-h-10 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-left text-[11px] leading-tight text-amber-950 shadow-[0_8px_20px_rgba(245,158,11,0.18)] transition-colors hover:bg-amber-200'
    : 'group min-h-10 rounded-lg border border-sky-200 bg-sky-100 px-2 py-1 text-left text-[11px] leading-tight text-sky-950 shadow-[0_8px_20px_rgba(14,165,233,0.14)] transition-colors hover:bg-sky-200';
}

/**
 * @deprecated Fallback/test fixture only. The resource screen primary renderer is
 * `GanttChart` with `mode="resource-planner"`, not this local grid.
 */
export function ResourceTimelineGrid({
  resources,
  emptyMessage,
  onCorrectConflict,
  maxRenderedDays = MAX_RENDERED_DAYS,
}: ResourceTimelineGridProps) {
  const timeline = useMemo(() => buildTimelineModel(resources, maxRenderedDays), [maxRenderedDays, resources]);
  const gridTemplateColumns = timeline.days.length > 0
    ? `220px repeat(${timeline.days.length}, minmax(42px, 1fr))`
    : '220px minmax(240px, 1fr)';

  if (resources.length === 0) {
    return (
      <section className="rounded-xl bg-white p-6 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.08)]" data-testid="resource-timeline-grid">
        <div data-testid="resource-timeline-empty-state">{emptyMessage}</div>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)] ring-1 ring-slate-200"
      data-testid="resource-timeline-grid"
    >
      <header className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold [text-wrap:balance]">Resource timeline</h2>
            <p className="mt-1 text-xs text-slate-300 [text-wrap:pretty]">
              Ресурсы сгруппированы по строкам; назначения показаны как календарные интервалы.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs tabular-nums text-slate-200">
            <span className="rounded-full bg-white/10 px-2.5 py-1">Ресурсов: {resources.length}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">Дней: {timeline.days.length}</span>
            {timeline.clamped && (
              <span className="rounded-full bg-amber-300 px-2.5 py-1 font-semibold text-amber-950" data-testid="resource-timeline-range-clamped">
                Показано {timeline.days.length} из {timeline.totalRangeDays} дней
              </span>
            )}
          </div>
        </div>
      </header>

      {timeline.invalidIntervals.length > 0 && (
        <div
          className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          data-testid="resource-timeline-invalid-intervals"
          role="alert"
        >
          <div className="font-semibold">Некорректные интервалы: {timeline.invalidIntervals.length}</div>
          <ul className="mt-2 space-y-1 text-xs">
            {timeline.invalidIntervals.map(({ interval, reason }) => (
              <li key={interval.assignmentId} data-testid={`resource-timeline-invalid-interval-${interval.assignmentId}`}>
                <span className="font-medium">{interval.resourceName || interval.resourceId}</span> / {interval.taskName || interval.taskId}: {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {timeline.days.length === 0 && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="resource-timeline-no-valid-intervals">
          Нет корректных календарных интервалов для построения шкалы, но строки ресурсов сохранены для диагностики.
        </div>
      )}

      <div className="overflow-x-auto">
        {timeline.days.length > 0 && (
          <div className="grid min-w-max border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-slate-700 shadow-[8px_0_14px_rgba(15,23,42,0.04)]">Ресурс</div>
            {timeline.days.map((day) => (
              <div
                key={formatDate(day)}
                className="border-l border-slate-200 px-2 py-3 text-center tabular-nums"
                data-testid={`resource-timeline-calendar-day-${formatDate(day)}`}
              >
                <div>{day.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</div>
              </div>
            ))}
          </div>
        )}

        <div className="min-w-max divide-y divide-slate-100">
          {timeline.resources.map(({ resource, validIntervals, invalidIntervals }) => (
            <div
              key={resource.resourceId}
              className="grid min-h-[88px] bg-white"
              data-testid={`resource-timeline-row-${resource.resourceId}`}
              style={{ gridTemplateColumns }}
            >
              <div className="sticky left-0 z-10 flex min-h-[88px] flex-col justify-center gap-2 bg-white px-4 py-3 shadow-[8px_0_14px_rgba(15,23,42,0.04)]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{resource.resourceName}</div>
                  <div className="mt-1 text-xs tabular-nums text-slate-500">
                    {validIntervals.length} корректн. / {invalidIntervals.length} некорректн.
                  </div>
                </div>
                <span
                  className={resource.hasConflicts
                    ? 'w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800'
                    : 'w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'}
                  data-testid={`resource-timeline-conflict-badge-${resource.resourceId}`}
                >
                  {resource.hasConflicts ? `Конфликтов: ${resource.conflictCount}` : 'Без конфликтов'}
                </span>
              </div>

              {timeline.days.length > 0 ? (
                <div
                  className="grid min-h-[88px] gap-y-1 border-l border-slate-100 bg-[linear-gradient(to_right,rgba(148,163,184,0.22)_1px,transparent_1px)] p-2"
                  style={{
                    gridColumn: `2 / span ${timeline.days.length}`,
                    gridTemplateColumns: `repeat(${timeline.days.length}, minmax(42px, 1fr))`,
                    gridAutoRows: 'minmax(40px, auto)',
                    backgroundSize: `${100 / Math.max(timeline.days.length, 1)}% 100%`,
                  }}
                >
                  {validIntervals.length === 0 && (
                    <div className="self-center rounded-lg border border-dashed border-slate-300 bg-white/80 px-3 py-2 text-xs text-slate-500" style={{ gridColumn: `1 / span ${timeline.days.length}` }}>
                      Нет корректных назначений на шкале.
                    </div>
                  )}
                  {validIntervals.map(({ interval, startIndex, durationDays, clipped }) => (
                    <div
                      key={interval.assignmentId}
                      className={getBarClassName(interval)}
                      data-testid={`resource-timeline-bar-${interval.assignmentId}`}
                      style={{ gridColumn: `${startIndex + 1} / span ${durationDays}` }}
                      title={`${interval.taskName}: ${interval.startDate} → ${interval.endDate}`}
                    >
                      <div className="truncate font-semibold">{interval.taskName}</div>
                      <div className="truncate opacity-80">{interval.projectName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="rounded bg-white/60 px-1.5 py-0.5 tabular-nums">{interval.startDate} → {interval.endDate}</span>
                        {clipped && <span className="rounded bg-slate-950/10 px-1.5 py-0.5">сжато</span>}
                      </div>
                      {interval.hasConflict && (
                        <div className="mt-2 rounded-md bg-white/70 p-1.5" data-testid={`resource-timeline-conflict-${interval.assignmentId}`}>
                          <div className="font-semibold">Пересечение: {interval.conflictCount}</div>
                          {interval.conflictAssignmentIds.length > 0 && (
                            <div className="mt-0.5 truncate opacity-80">{interval.conflictAssignmentIds.join(', ')}</div>
                          )}
                          <button
                            type="button"
                            className="mt-2 inline-flex min-h-10 items-center rounded-md border border-amber-300 bg-white px-2 text-[11px] font-semibold text-amber-900 shadow-sm transition-transform active:scale-[0.96]"
                            data-testid={`resource-timeline-correct-${interval.assignmentId}`}
                            onClick={() => onCorrectConflict({
                              projectId: interval.projectId,
                              taskId: interval.taskId,
                              assignmentId: interval.assignmentId,
                              resourceId: interval.resourceId,
                            })}
                          >
                            Исправить
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[88px] items-center border-l border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Ожидается корректный интервал для построения календарной шкалы.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { ResourceTimelineGridProps };
