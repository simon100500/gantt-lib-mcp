import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Landmark, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react';

import type {
  FinancePeriodBucket,
  FinancePeriodGranularity,
  ProjectFinanceSnapshot,
  TaskFundingEvent,
} from '../../lib/apiTypes.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { cn } from '../../lib/utils.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';

type FinanceWorkspaceProps = {
  accessToken?: string | null;
  projectId: string;
  readOnly?: boolean;
  onBackToProject?: () => void;
};

type FinanceRow =
  {
    id: string;
    taskId: string;
    parentTaskId: string | null;
    depth: number;
    title: string;
    plannedCost: number;
    allocationMode: 'manual' | 'auto';
    allocationParentTaskId: string | null;
    plannedToDate: number;
    earnedToDate: number;
    paidToDate: number;
    variancePlannedVsEarned: number;
    varianceEarnedVsPaid: number;
    plannedByPeriod: Record<string, number>;
    paidByPeriod: Record<string, number>;
    isCollapsed: boolean;
    hasChildren: boolean;
  };

type FundingDrawerState = {
  taskId: string;
  periodId: string | null;
  editingEventId: string | null;
} | null;

const ROW_HEIGHT = 28;
const TASK_COLUMN_WIDTH = 360;
const COST_COLUMN_WIDTH = 180;
const METRIC_COLUMN_WIDTH = 110;
const LEFT_COLUMN_OFFSETS = [
  0,
  TASK_COLUMN_WIDTH,
  TASK_COLUMN_WIDTH + COST_COLUMN_WIDTH,
  TASK_COLUMN_WIDTH + COST_COLUMN_WIDTH + METRIC_COLUMN_WIDTH,
  TASK_COLUMN_WIDTH + COST_COLUMN_WIDTH + METRIC_COLUMN_WIDTH * 2,
  TASK_COLUMN_WIDTH + COST_COLUMN_WIDTH + METRIC_COLUMN_WIDTH * 3,
] as const;

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInputMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(value);
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

function buildRows(snapshot: ProjectFinanceSnapshot | null, collapsedTaskIds: Set<string>): FinanceRow[] {
  if (!snapshot) {
    return [];
  }

  const childCountByParentId = new Map<string, number>();
  snapshot.tasks.forEach((task) => {
    if (task.parentTaskId) {
      childCountByParentId.set(task.parentTaskId, (childCountByParentId.get(task.parentTaskId) ?? 0) + 1);
    }
  });

  const taskMap = new Map(snapshot.tasks.map((task) => [task.taskId, task]));

  return snapshot.tasks
    .filter((task) => {
      let currentParentId = task.parentTaskId;
      while (currentParentId) {
        if (collapsedTaskIds.has(currentParentId)) {
          return false;
        }
        currentParentId = taskMap.get(currentParentId)?.parentTaskId ?? null;
      }
      return true;
    })
    .map((task) => ({
      id: `group:${task.taskId}`,
      taskId: task.taskId,
      parentTaskId: task.parentTaskId,
      depth: task.depth,
      title: task.title,
      plannedCost: task.plannedCost,
      allocationMode: task.allocationMode,
      allocationParentTaskId: task.allocationParentTaskId,
      plannedToDate: task.plannedToDate,
      earnedToDate: task.earnedToDate,
      paidToDate: task.paidToDate,
      variancePlannedVsEarned: task.variancePlannedVsEarned,
      varianceEarnedVsPaid: task.varianceEarnedVsPaid,
      plannedByPeriod: task.plannedByPeriod,
      paidByPeriod: task.paidByPeriod,
      isCollapsed: collapsedTaskIds.has(task.taskId),
      hasChildren: (childCountByParentId.get(task.taskId) ?? 0) > 0,
    }));
}

function filterEventsForDrawer(
  events: TaskFundingEvent[],
  drawer: FundingDrawerState,
  periods: FinancePeriodBucket[],
): TaskFundingEvent[] {
  if (!drawer) {
    return [];
  }

  const taskEvents = events.filter((event) => event.taskId === drawer.taskId);
  if (!drawer.periodId) {
    return taskEvents;
  }

  const period = periods.find((candidate) => candidate.id === drawer.periodId);
  if (!period) {
    return taskEvents;
  }

  return taskEvents.filter((event) => event.eventDate >= period.startDate && event.eventDate <= period.endDate);
}

export function FinanceWorkspace({
  accessToken = null,
  projectId,
  readOnly = false,
  onBackToProject,
}: FinanceWorkspaceProps) {
  const [granularity, setGranularity] = useState<FinancePeriodGranularity>('month');
  const [asOfDate, setAsOfDate] = useState(todayIso);
  const [snapshot, setSnapshot] = useState<ProjectFinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [drawerState, setDrawerState] = useState<FundingDrawerState>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [drawerPending, setDrawerPending] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<{ eventDate: string; amount: string; comment: string }>({
    eventDate: todayIso(),
    amount: '',
    comment: '',
  });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const costInputRef = useRef<HTMLInputElement | null>(null);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);

  const loadSnapshot = useCallback(async (showSpinner: boolean) => {
    if (!accessToken) {
      setSnapshot(null);
      setLoading(false);
      setError('Нет доступа к финансовым данным.');
      return;
    }

    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const query = new URLSearchParams({
        asOf: asOfDate,
        granularity,
      });
      const response = await fetch(`/api/finance?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as ProjectFinanceSnapshot;
      setSnapshot(data);
      setCostDrafts(
        data.tasks.reduce<Record<string, string>>((accumulator, task) => {
          accumulator[task.taskId] = formatInputMoney(task.plannedCost);
          return accumulator;
        }, {}),
      );
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить финансы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, asOfDate, granularity]);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  useEffect(() => {
    if (!editingTaskId) {
      return;
    }

    window.requestAnimationFrame(() => {
      costInputRef.current?.focus();
      costInputRef.current?.select();
    });
  }, [editingTaskId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const state = getProjectState(projectId);
    container.scrollTop = state?.financeScrollTop ?? 0;
    container.scrollLeft = state?.financeScrollLeft ?? 0;
  }, [getProjectState, projectId, snapshot]);

  const rows = useMemo(() => buildRows(snapshot, collapsedTaskIds), [collapsedTaskIds, snapshot]);
  const projectTotals = useMemo(() => {
    const topLevelRows = rows.filter((row) => row.parentTaskId === null);
    return topLevelRows.reduce((totals, row) => ({
      plannedCost: totals.plannedCost + row.plannedCost,
      plannedToDate: totals.plannedToDate + row.plannedToDate,
      earnedToDate: totals.earnedToDate + row.earnedToDate,
      paidToDate: totals.paidToDate + row.paidToDate,
    }), {
      plannedCost: 0,
      plannedToDate: 0,
      earnedToDate: 0,
      paidToDate: 0,
    });
  }, [rows]);
  const drawerEvents = useMemo(
    () => drawerState && snapshot ? filterEventsForDrawer(snapshot.events, drawerState, snapshot.periods) : [],
    [drawerState, snapshot],
  );

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    setProjectState(projectId, {
      financeScrollTop: container.scrollTop,
      financeScrollLeft: container.scrollLeft,
    });
  }, [projectId, setProjectState]);

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const savePlannedCost = useCallback(async (taskId: string) => {
    if (!accessToken || readOnly) {
      return;
    }

    const rawValue = costDrafts[taskId] ?? '0';
    const plannedCost = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(plannedCost) || plannedCost < 0) {
      setError('Стоимость должна быть неотрицательным числом.');
      return;
    }

    setSavingTaskId(taskId);
    try {
      const response = await fetch(`/api/finance/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plannedCost }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setEditingTaskId(null);
      await loadSnapshot(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить стоимость');
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, costDrafts, loadSnapshot, readOnly]);

  const startEditingCost = useCallback((taskId: string, plannedCost: number) => {
    if (readOnly) {
      return;
    }

    setCostDrafts((current) => ({
      ...current,
      [taskId]: current[taskId] ?? formatInputMoney(plannedCost),
    }));
    setEditingTaskId(taskId);
  }, [readOnly]);

  const cancelEditingCost = useCallback((taskId: string, plannedCost: number) => {
    setCostDrafts((current) => ({
      ...current,
      [taskId]: formatInputMoney(plannedCost),
    }));
    setEditingTaskId((current) => (current === taskId ? null : current));
  }, []);

  const openDrawer = useCallback((taskId: string, periodId: string | null, event?: TaskFundingEvent | null) => {
    setDrawerState({
      taskId,
      periodId,
      editingEventId: event?.id ?? null,
    });
    setDrawerError(null);
    setEventForm({
      eventDate: event?.eventDate ?? (periodId && snapshot ? snapshot.periods.find((period) => period.id === periodId)?.startDate ?? todayIso() : todayIso()),
      amount: event ? formatInputMoney(event.amount) : '',
      comment: event?.comment ?? '',
    });
  }, [snapshot]);

  const closeDrawer = useCallback(() => {
    if (drawerPending) {
      return;
    }
    setDrawerState(null);
    setDrawerError(null);
  }, [drawerPending]);

  const submitEvent = useCallback(async () => {
    if (!accessToken || !drawerState || readOnly) {
      return;
    }

    const amount = Number(eventForm.amount.replace(',', '.'));
    if (!Number.isFinite(amount)) {
      setDrawerError('Сумма должна быть числом.');
      return;
    }

    setDrawerPending(true);
    try {
      const target = drawerState.editingEventId
        ? `/api/finance/events/${encodeURIComponent(drawerState.editingEventId)}`
        : `/api/finance/tasks/${encodeURIComponent(drawerState.taskId)}/events`;
      const response = await fetch(target, {
        method: drawerState.editingEventId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventDate: eventForm.eventDate,
          amount,
          comment: eventForm.comment.trim(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      await loadSnapshot(false);
      openDrawer(drawerState.taskId, drawerState.periodId, null);
    } catch (submitError) {
      setDrawerError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить поступление');
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, drawerState, eventForm.amount, eventForm.comment, eventForm.eventDate, loadSnapshot, openDrawer, readOnly]);

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!accessToken || !drawerState || readOnly) {
      return;
    }

    setDrawerPending(true);
    try {
      const response = await fetch(`/api/finance/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      await loadSnapshot(false);
      openDrawer(drawerState.taskId, drawerState.periodId, null);
    } catch (deleteError) {
      setDrawerError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить поступление');
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, drawerState, loadSnapshot, openDrawer, readOnly]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Загрузка финансового режима...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {onBackToProject && (
            <Button variant="outline" size="sm" onClick={onBackToProject}>
              Назад к графику
            </Button>
          )}
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
            <Landmark className="h-4 w-4 text-primary" />
            Финансы
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>На дату</span>
            <Input
              className="h-9 w-[150px]"
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
            />
          </label>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(['month', 'week'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setGranularity(mode)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  granularity === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {mode === 'month' ? 'Месяцы' : 'Недели'}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { void loadSnapshot(false); }} disabled={refreshing}>
            {refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>Стоимость: {formatMoney(projectTotals.plannedCost)}</span>
          <span>План: {formatMoney(projectTotals.plannedToDate)}</span>
          <span>Освоено: {formatMoney(projectTotals.earnedToDate)}</span>
          <span>Оплачено: {formatMoney(projectTotals.paidToDate)}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {snapshot && snapshot.tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            В проекте пока нет задач для финансовой таблицы.
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            onScroll={handleScroll}
          >
            <table className="min-w-max border-separate border-spacing-0 text-xs text-slate-700">
              <colgroup>
                <col style={{ width: TASK_COLUMN_WIDTH }} />
                <col style={{ width: COST_COLUMN_WIDTH }} />
                <col style={{ width: METRIC_COLUMN_WIDTH }} />
                <col style={{ width: METRIC_COLUMN_WIDTH }} />
                <col style={{ width: METRIC_COLUMN_WIDTH }} />
                <col style={{ width: METRIC_COLUMN_WIDTH }} />
                {snapshot?.periods.map((period) => (
                  <col key={period.id} style={{ width: 120 }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ left: LEFT_COLUMN_OFFSETS[0] }}>
                    Группа работ
                  </th>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ left: LEFT_COLUMN_OFFSETS[1] }}>
                    Стоимость
                  </th>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ left: LEFT_COLUMN_OFFSETS[2] }}>
                    План
                  </th>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ left: LEFT_COLUMN_OFFSETS[3] }}>
                    Освоено
                  </th>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ left: LEFT_COLUMN_OFFSETS[4] }}>
                    Оплачено
                  </th>
                  <th className="sticky top-0 z-30 border-b border-r border-slate-200 bg-slate-50 bg-clip-padding px-2 py-2 text-right text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 shadow-[8px_0_14px_rgba(15,23,42,0.04)]" style={{ left: LEFT_COLUMN_OFFSETS[5] }}>
                    Откл.
                  </th>
                  {snapshot?.periods.map((period) => (
                    <th key={period.id} className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 last:border-r-0">
                      {period.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-3 py-1" style={{ left: LEFT_COLUMN_OFFSETS[0], minHeight: ROW_HEIGHT }}>
                      <div className="flex items-start gap-2" style={{ paddingLeft: row.depth * 18 }}>
                        {row.hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleCollapse(row.taskId)}
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                          >
                            {row.isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        ) : (
                          <div className="h-6 w-6 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className={cn(
                            'break-words whitespace-normal leading-4 text-slate-900',
                            row.hasChildren ? 'font-medium' : 'font-normal',
                          )}>
                            {row.title}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-2 py-1 align-middle" style={{ left: LEFT_COLUMN_OFFSETS[1], minHeight: ROW_HEIGHT }}>
                      {editingTaskId === row.taskId ? (
                        <Input
                          ref={costInputRef}
                          value={costDrafts[row.taskId] ?? formatInputMoney(row.plannedCost)}
                          onChange={(event) => setCostDrafts((current) => ({ ...current, [row.taskId]: event.target.value }))}
                          onBlur={() => { void savePlannedCost(row.taskId); }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void savePlannedCost(row.taskId);
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditingCost(row.taskId, row.plannedCost);
                            }
                          }}
                          className="h-7 w-full border-primary/40 bg-white px-2 text-right text-xs shadow-[0_0_0_2px_rgba(59,130,246,0.12)]"
                          disabled={readOnly || savingTaskId === row.taskId}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditingCost(row.taskId, row.plannedCost)}
                          disabled={readOnly}
                          className={cn(
                            'flex h-7 w-full items-center justify-end gap-2 rounded-md border border-transparent px-2 text-right text-xs font-medium text-slate-700 transition-colors whitespace-nowrap',
                            !readOnly && 'hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          {row.allocationMode === 'auto' && (
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
                              title="Сумма распределена автоматически"
                              aria-label="Сумма распределена автоматически"
                            />
                          )}
                          {savingTaskId === row.taskId ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : formatMoney(row.plannedCost)}
                        </button>
                      )}
                    </td>
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-2 py-1 text-right align-middle font-medium" style={{ left: LEFT_COLUMN_OFFSETS[2], minHeight: ROW_HEIGHT }}>
                      {formatMoney(row.plannedToDate)}
                    </td>
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-2 py-1 text-right align-middle font-medium" style={{ left: LEFT_COLUMN_OFFSETS[3], minHeight: ROW_HEIGHT }}>
                      {formatMoney(row.earnedToDate)}
                    </td>
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-2 py-1 text-right align-middle font-medium" style={{ left: LEFT_COLUMN_OFFSETS[4], minHeight: ROW_HEIGHT }}>
                      {formatMoney(row.paidToDate)}
                    </td>
                    <td className="sticky z-20 border-b border-r border-slate-200 bg-white bg-clip-padding px-2 py-1 text-right align-middle font-medium shadow-[8px_0_14px_rgba(15,23,42,0.04)]" style={{ left: LEFT_COLUMN_OFFSETS[5], minHeight: ROW_HEIGHT }}>
                      {formatMoney(row.varianceEarnedVsPaid)}
                    </td>
                    {snapshot?.periods.map((period) => {
                      const plannedValue = row.plannedByPeriod[period.id] ?? 0;
                      const paidValue = row.paidByPeriod[period.id] ?? 0;

                      return (
                        <td key={`${row.id}:${period.id}`} className="border-b border-r border-slate-100 p-0 last:border-r-0">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => { openDrawer(row.taskId, period.id, null); }}
                            className={cn(
                              'flex min-h-[28px] w-full items-center justify-between gap-2 px-3 py-1 text-right leading-4',
                              !readOnly && 'hover:bg-primary/5',
                            )}
                          >
                            <span className={cn('truncate text-xs', paidValue > 0 ? 'text-emerald-600' : 'text-slate-300')}>
                              {paidValue > 0 ? formatMoney(paidValue) : ''}
                            </span>
                            <span className={cn('text-xs', plannedValue > 0 ? 'font-medium text-slate-700' : 'text-slate-300')}>
                              {plannedValue > 0 ? formatMoney(plannedValue) : '0'}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {drawerState && snapshot && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-[-16px_0_32px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Поступления</h3>
                <p className="text-xs text-slate-500">
                  {snapshot.tasks.find((task) => task.taskId === drawerState.taskId)?.title ?? 'Группа'}
                </p>
              </div>
              <button type="button" onClick={closeDrawer} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 border-b border-slate-200 px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  <span>Дата</span>
                  <Input
                    type="date"
                    value={eventForm.eventDate}
                    onChange={(event) => setEventForm((current) => ({ ...current, eventDate: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  <span>Сумма</span>
                  <Input
                    value={eventForm.amount}
                    onChange={(event) => setEventForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>
              <label className="space-y-1 text-xs font-medium text-slate-600">
                <span>Комментарий</span>
                <Input
                  value={eventForm.comment}
                  onChange={(event) => setEventForm((current) => ({ ...current, comment: event.target.value }))}
                  placeholder="Аванс, КС, этап..."
                />
              </label>
              {drawerError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {drawerError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={() => { void submitEvent(); }} disabled={drawerPending || readOnly}>
                  {drawerPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : drawerState.editingEventId ? 'Сохранить' : 'Добавить'}
                </Button>
                {drawerState.editingEventId && (
                  <Button variant="outline" onClick={() => openDrawer(drawerState.taskId, drawerState.periodId, null)} disabled={drawerPending}>
                    Новый ввод
                  </Button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {drawerEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Для выбранной группы пока нет поступлений.
                </div>
              ) : (
                <div className="space-y-2">
                  {drawerEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{formatMoney(event.amount)}</div>
                          <div className="text-xs text-slate-500">{event.eventDate}</div>
                          {event.comment && <div className="mt-1 text-sm text-slate-600">{event.comment}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDrawer(drawerState.taskId, drawerState.periodId, event)}
                            disabled={drawerPending || readOnly}
                          >
                            Изм.
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { void deleteEvent(event.id); }}
                            disabled={drawerPending || readOnly}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
