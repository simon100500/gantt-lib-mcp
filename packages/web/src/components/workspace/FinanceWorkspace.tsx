import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Landmark, LoaderCircle, Plus, RefreshCw, Save, X } from 'lucide-react';

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
  | {
    id: string;
    kind: 'group';
    taskId: string;
    depth: number;
    title: string;
    plannedCost: number;
    plannedToDate: number;
    earnedToDate: number;
    paidToDate: number;
    variancePlannedVsEarned: number;
    varianceEarnedVsPaid: number;
    plannedByPeriod: Record<string, number>;
    paidByPeriod: Record<string, number>;
    isCollapsed: boolean;
  }
  | {
    id: string;
    kind: 'plan' | 'paid';
    taskId: string;
    depth: number;
    title: string;
    valuesByPeriod: Record<string, number>;
  };

type FundingDrawerState = {
  taskId: string;
  periodId: string | null;
  editingEventId: string | null;
} | null;

const ROW_HEIGHT = 40;
const LEFT_PANE_WIDTH = 720;

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

  const rows: FinanceRow[] = [];
  for (const task of snapshot.tasks) {
    const isCollapsed = collapsedTaskIds.has(task.taskId);
    rows.push({
      id: `group:${task.taskId}`,
      kind: 'group',
      taskId: task.taskId,
      depth: task.depth,
      title: task.title,
      plannedCost: task.plannedCost,
      plannedToDate: task.plannedToDate,
      earnedToDate: task.earnedToDate,
      paidToDate: task.paidToDate,
      variancePlannedVsEarned: task.variancePlannedVsEarned,
      varianceEarnedVsPaid: task.varianceEarnedVsPaid,
      plannedByPeriod: task.plannedByPeriod,
      paidByPeriod: task.paidByPeriod,
      isCollapsed,
    });

    if (!isCollapsed) {
      rows.push({
        id: `plan:${task.taskId}`,
        kind: 'plan',
        taskId: task.taskId,
        depth: task.depth + 1,
        title: 'План',
        valuesByPeriod: task.plannedByPeriod,
      });
      rows.push({
        id: `paid:${task.taskId}`,
        kind: 'paid',
        taskId: task.taskId,
        depth: task.depth + 1,
        title: 'Оплачено',
        valuesByPeriod: task.paidByPeriod,
      });
    }
  }

  return rows;
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
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [drawerState, setDrawerState] = useState<FundingDrawerState>(null);
  const [drawerPending, setDrawerPending] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<{ eventDate: string; amount: string; comment: string }>({
    eventDate: todayIso(),
    amount: '',
    comment: '',
  });
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const rightBodyRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncLockRef = useRef<'left' | 'right' | null>(null);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const collapsedTaskIds = useMemo(() => (
    new Set(getProjectState(projectId)?.collapsedParentIds ?? [])
  ), [getProjectState, projectId]);

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
    const left = leftBodyRef.current;
    const right = rightBodyRef.current;
    if (!left || !right) {
      return;
    }

    const state = getProjectState(projectId);
    left.scrollTop = state?.financeScrollTop ?? 0;
    right.scrollTop = state?.financeScrollTop ?? 0;
    right.scrollLeft = state?.financeScrollLeft ?? 0;
  }, [getProjectState, projectId, snapshot]);

  const rows = useMemo(() => buildRows(snapshot, collapsedTaskIds), [collapsedTaskIds, snapshot]);
  const projectTotals = useMemo(() => {
    const groupRows = rows.filter((row): row is Extract<FinanceRow, { kind: 'group' }> => row.kind === 'group');
    return groupRows.reduce((totals, row) => ({
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

  const syncScroll = useCallback((source: 'left' | 'right') => {
    const left = leftBodyRef.current;
    const right = rightBodyRef.current;
    if (!left || !right) {
      return;
    }

    if (scrollSyncLockRef.current && scrollSyncLockRef.current !== source) {
      return;
    }

    scrollSyncLockRef.current = source;
    if (source === 'left') {
      right.scrollTop = left.scrollTop;
      setProjectState(projectId, {
        financeScrollTop: left.scrollTop,
        financeScrollLeft: right.scrollLeft,
      });
    } else {
      left.scrollTop = right.scrollTop;
      setProjectState(projectId, {
        financeScrollTop: right.scrollTop,
        financeScrollLeft: right.scrollLeft,
      });
    }
    window.requestAnimationFrame(() => {
      scrollSyncLockRef.current = null;
    });
  }, [projectId, setProjectState]);

  const toggleCollapse = useCallback((taskId: string) => {
    const current = new Set(getProjectState(projectId)?.collapsedParentIds ?? []);
    if (current.has(taskId)) {
      current.delete(taskId);
    } else {
      current.add(taskId);
    }
    setProjectState(projectId, { collapsedParentIds: Array.from(current) });
  }, [getProjectState, projectId, setProjectState]);

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

      await loadSnapshot(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить стоимость');
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, costDrafts, loadSnapshot, readOnly]);

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
            В проекте пока нет групп работ для финансовой таблицы.
          </div>
        ) : (
        <div className="flex h-full min-h-0">
          <div className="flex shrink-0 flex-col border-r border-slate-200" style={{ width: LEFT_PANE_WIDTH }}>
            <div className="grid shrink-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500" style={{ gridTemplateColumns: '300px 110px 110px 110px 110px 110px' }}>
              <div className="px-3 py-3">Группа работ</div>
              <div className="px-2 py-3 text-right">Стоимость</div>
              <div className="px-2 py-3 text-right">План</div>
              <div className="px-2 py-3 text-right">Освоено</div>
              <div className="px-2 py-3 text-right">Оплачено</div>
              <div className="px-2 py-3 text-right">Откл.</div>
            </div>
            <div
              ref={leftBodyRef}
              className="min-h-0 flex-1 overflow-y-auto"
              onScroll={() => syncScroll('left')}
            >
              {rows.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    'grid items-center border-b border-slate-100 text-sm text-slate-700',
                    row.kind === 'group' ? 'bg-white' : 'bg-slate-50/50 text-slate-600',
                  )}
                  style={{ gridTemplateColumns: '300px 110px 110px 110px 110px 110px', minHeight: ROW_HEIGHT }}
                >
                  <div className="flex min-w-0 items-center gap-2 px-3" style={{ paddingLeft: 12 + row.depth * 18 }}>
                    {row.kind === 'group' ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(row.taskId)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                      >
                        {row.isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    ) : (
                      <div className="h-6 w-6" />
                    )}
                    <span className={cn('truncate', row.kind === 'group' ? 'font-medium text-slate-900' : 'font-medium')}>{row.title}</span>
                  </div>
                  {row.kind === 'group' ? (
                    <>
                      <div className="flex items-center justify-end gap-1 px-2">
                        <Input
                          value={costDrafts[row.taskId] ?? formatInputMoney(row.plannedCost)}
                          onChange={(event) => setCostDrafts((current) => ({ ...current, [row.taskId]: event.target.value }))}
                          onBlur={() => { void savePlannedCost(row.taskId); }}
                          className="h-8 text-right"
                          disabled={readOnly || savingTaskId === row.taskId}
                        />
                        <button
                          type="button"
                          onClick={() => { void savePlannedCost(row.taskId); }}
                          disabled={readOnly || savingTaskId === row.taskId}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900 disabled:opacity-50"
                        >
                          {savingTaskId === row.taskId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="px-2 text-right font-medium">{formatMoney(row.plannedToDate)}</div>
                      <div className="px-2 text-right font-medium">{formatMoney(row.earnedToDate)}</div>
                      <div className="px-2 text-right font-medium">{formatMoney(row.paidToDate)}</div>
                      <div className="px-2 text-right font-medium">{formatMoney(row.varianceEarnedVsPaid)}</div>
                    </>
                  ) : (
                    <>
                      <div className="px-2 text-right text-slate-400">-</div>
                      <div className="px-2 text-right text-slate-400">-</div>
                      <div className="px-2 text-right text-slate-400">-</div>
                      <div className="px-2 text-right text-slate-400">-</div>
                      <div className="px-2 text-right text-slate-400">-</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              ref={rightBodyRef}
              className="h-full overflow-auto"
              onScroll={() => syncScroll('right')}
            >
              <div className="min-w-max">
                <div
                  className="sticky top-0 z-10 grid border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500"
                  style={{ gridTemplateColumns: `repeat(${snapshot?.periods.length ?? 0}, minmax(120px, 1fr))` }}
                >
                  {snapshot?.periods.map((period) => (
                    <div key={period.id} className="border-r border-slate-200 px-3 py-3 text-center last:border-r-0">
                      {period.label}
                    </div>
                  ))}
                </div>
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      'grid border-b border-slate-100 text-sm',
                      row.kind === 'group' ? 'bg-white' : 'bg-slate-50/50',
                    )}
                    style={{ gridTemplateColumns: `repeat(${snapshot?.periods.length ?? 0}, minmax(120px, 1fr))`, minHeight: ROW_HEIGHT }}
                  >
                    {snapshot?.periods.map((period) => {
                      const value = row.kind === 'group'
                        ? 0
                        : row.valuesByPeriod[period.id] ?? 0;
                      const isPaidRow = row.kind === 'paid';

                      return (
                        <button
                          key={`${row.id}:${period.id}`}
                          type="button"
                          disabled={row.kind === 'plan' || readOnly}
                          onClick={() => {
                            if (isPaidRow) {
                              openDrawer(row.taskId, period.id, null);
                            } else if (row.kind === 'group') {
                              openDrawer(row.taskId, period.id, null);
                            }
                          }}
                          className={cn(
                            'border-r border-slate-100 px-3 text-right last:border-r-0',
                            !isPaidRow && row.kind !== 'group' && 'cursor-default',
                            (isPaidRow || row.kind === 'group') && !readOnly && 'hover:bg-primary/5',
                          )}
                        >
                          {row.kind === 'group' ? (
                            <div className="flex h-full items-center justify-end">
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <Plus className="h-3.5 w-3.5" />
                                Поступление
                              </span>
                            </div>
                          ) : (
                            <div className={cn('flex h-full items-center justify-end', value > 0 ? 'font-medium text-slate-700' : 'text-slate-300')}>
                              {value > 0 ? formatMoney(value) : '0'}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
