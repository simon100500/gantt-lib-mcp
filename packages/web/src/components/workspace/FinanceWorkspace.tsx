import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GanttChart } from 'gantt-lib';
import type { TableMatrixColumn, TableMatrixColumnGroup, Task, TaskListColumn } from 'gantt-lib';
import { Landmark, LoaderCircle, Lock, RefreshCw, X } from 'lucide-react';

import type {
  FinancePeriodBucket,
  FinancePeriodGranularity,
  ProjectFinanceSnapshot,
  TaskFundingEvent,
} from '../../lib/apiTypes.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { cn } from '../../lib/utils.ts';

type FinanceWorkspaceProps = {
  accessToken?: string | null;
  projectId: string;
  readOnly?: boolean;
  onBackToProject?: () => void;
};

type FinanceMatrixTask = Task & {
  plannedCost: number;
  hasOwnFinanceSetting: boolean;
  allocationMode: 'manual' | 'auto';
  allocationParentTaskId: string | null;
  plannedToDate: number;
  earnedToDate: number;
  paidToDate: number;
  variancePlannedVsEarned: number;
  varianceEarnedVsPaid: number;
  plannedByPeriod: Record<string, number>;
  paidByPeriod: Record<string, number>;
};

type FundingDrawerState = {
  taskId: string;
  periodId: string | null;
  editingEventId: string | null;
} | null;

const ROW_HEIGHT = 46;
const DEFAULT_CHART_HEIGHT = 640;
const OWNER_COLUMN_WIDTH = 120;
const COST_COLUMN_WIDTH = 120;
const PAID_COLUMN_WIDTH = 120;
const MATRIX_COLUMN_WIDTH_WEEK = 98;
const MATRIX_COLUMN_WIDTH_MONTH = 108;

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number): string {
  const formatted = moneyFormatter.format(value);
  return formatted.endsWith(',00') ? formatted.slice(0, -3) : formatted;
}

function formatInputMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(value);
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

function buildFinanceTasks(snapshot: ProjectFinanceSnapshot | null): FinanceMatrixTask[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.tasks
    .map((task) => ({
      id: task.taskId,
      name: task.title,
      startDate: task.startDate,
      endDate: task.endDate,
      parentId: task.parentTaskId ?? undefined,
      progress: task.progress,
      plannedCost: task.plannedCost,
      hasOwnFinanceSetting: task.hasOwnFinanceSetting,
      allocationMode: task.allocationMode,
      allocationParentTaskId: task.allocationParentTaskId,
      plannedToDate: task.plannedToDate,
      earnedToDate: task.earnedToDate,
      paidToDate: task.paidToDate,
      variancePlannedVsEarned: task.variancePlannedVsEarned,
      varianceEarnedVsPaid: task.varianceEarnedVsPaid,
      plannedByPeriod: task.plannedByPeriod,
      paidByPeriod: task.paidByPeriod,
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

function buildPeriodGroup(period: FinancePeriodBucket, granularity: FinancePeriodGranularity): { id: string; label: string } {
  const date = new Date(`${period.startDate}T00:00:00Z`);
  if (granularity === 'month') {
    const year = date.getUTCFullYear();
    return { id: `year:${year}`, label: String(year) };
  }

  const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

  return {
    id: `month:${monthKey}`,
    label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
  };
}

function getMatrixColumnWidth(granularity: FinancePeriodGranularity): number {
  return granularity === 'week' ? MATRIX_COLUMN_WIDTH_WEEK : MATRIX_COLUMN_WIDTH_MONTH;
}

function MoneyValue({
  value,
  color,
  fontWeight,
}: {
  value: number;
  color?: string;
  fontWeight?: number;
}) {
  return (
    <span style={{ color, fontWeight, fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(value)}
    </span>
  );
}

function BudgetCellEditor({
  value,
  editStartValue,
  onCommit,
  onCancel,
}: {
  value: number;
  editStartValue?: string;
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(editStartValue ?? String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (editStartValue === undefined) {
      inputRef.current?.select();
      return;
    }

    const cursorPosition = editStartValue.length;
    inputRef.current?.setSelectionRange(cursorPosition, cursorPosition);
  }, [editStartValue]);

  const commit = useCallback(() => {
    const nextValue = parseMoneyInput(draft);
    if (nextValue !== null) {
      onCommit(nextValue);
      return;
    }
    onCancel();
  }, [draft, onCancel, onCommit]);

  return (
    <input
      ref={inputRef}
      value={draft}
      className="gantt-tl-inline-editor-input"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    />
  );
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
  const [drawerState, setDrawerState] = useState<FundingDrawerState>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [drawerPending, setDrawerPending] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState<number>(DEFAULT_CHART_HEIGHT);
  const [eventForm, setEventForm] = useState<{ eventDate: string; amount: string; comment: string }>({
    eventDate: todayIso(),
    amount: '',
    comment: '',
  });
  const chartHostRef = useRef<HTMLDivElement | null>(null);

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
    const element = chartHostRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.max(320, Math.floor(element.getBoundingClientRect().height));
      setChartHeight(nextHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tasks = useMemo(() => buildFinanceTasks(snapshot), [snapshot]);
  const projectTotals = useMemo(() => {
    const topLevelTasks = tasks.filter((task) => !task.parentId);
    return topLevelTasks.reduce((totals, task) => ({
      plannedCost: totals.plannedCost + task.plannedCost,
      plannedToDate: totals.plannedToDate + task.plannedToDate,
      earnedToDate: totals.earnedToDate + task.earnedToDate,
      paidToDate: totals.paidToDate + task.paidToDate,
    }), {
      plannedCost: 0,
      plannedToDate: 0,
      earnedToDate: 0,
      paidToDate: 0,
    });
  }, [tasks]);
  const drawerEvents = useMemo(
    () => drawerState && snapshot ? filterEventsForDrawer(snapshot.events, drawerState, snapshot.periods) : [],
    [drawerState, snapshot],
  );

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

  const savePlannedCost = useCallback(async (taskId: string, plannedCost: number) => {
    if (!accessToken || readOnly) {
      return;
    }

    const currentTask = snapshot?.tasks.find((task) => task.taskId === taskId);
    if (currentTask && Math.abs(currentTask.plannedCost - plannedCost) < 0.0001) {
      return;
    }

    setSnapshot((current) => current ? ({
      ...current,
      tasks: current.tasks.map((task) => (
        task.taskId === taskId
          ? { ...task, plannedCost, allocationMode: 'manual' }
          : task
      )),
    }) : current);

    setSavingTaskId(taskId);
    try {
      const response = await fetch(`/api/finance/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plannedCost, allocationMode: 'manual' }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить стоимость');
      await loadSnapshot(false);
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, loadSnapshot, readOnly, snapshot]);

  const updateAllocationMode = useCallback(async (taskId: string, allocationMode: 'manual' | 'auto', fallbackPlannedCost: number) => {
    if (!accessToken || readOnly) {
      return;
    }

    const currentTask = snapshot?.tasks.find((task) => task.taskId === taskId);
    if (!currentTask || currentTask.allocationMode === allocationMode) {
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
        body: JSON.stringify({
          allocationMode,
          plannedCost: allocationMode === 'manual'
            ? fallbackPlannedCost
            : undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setSnapshot((current) => current ? ({
        ...current,
        tasks: current.tasks.map((task) => (
          task.taskId === taskId
            ? {
              ...task,
              allocationMode,
              plannedCost: allocationMode === 'manual'
                ? (parseMoneyInput(String(currentTask.plannedCost)) ?? currentTask.plannedCost)
                : task.plannedCost,
            }
            : task
        )),
      }) : current);
      await loadSnapshot(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить режим суммы');
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, loadSnapshot, readOnly, snapshot]);

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

  const handleFinanceTasksChange = useCallback((changedTasks: FinanceMatrixTask[]) => {
    for (const changedTask of changedTasks) {
      const currentTask = snapshot?.tasks.find((task) => task.taskId === changedTask.id);
      if (!currentTask) {
        continue;
      }

      if (typeof changedTask.plannedCost === 'number' && Math.abs(changedTask.plannedCost - currentTask.plannedCost) > 0.0001) {
        void savePlannedCost(changedTask.id, changedTask.plannedCost);
      }
    }
  }, [savePlannedCost, snapshot]);

  const additionalColumns = useMemo<TaskListColumn<FinanceMatrixTask>[]>(() => [
    {
      id: 'allocationMode',
      header: 'Тип',
      width: OWNER_COLUMN_WIDTH,
      after: 'name',
      align: 'left',
      renderCell: ({ task }) => (
        <div className="group flex min-h-[28px] items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void updateAllocationMode(task.id, task.allocationMode === 'manual' ? 'auto' : 'manual', task.plannedCost);
            }}
            disabled={readOnly || savingTaskId === task.id || (!task.parentId && task.allocationMode === 'auto')}
            title={task.allocationMode === 'manual' ? 'Снять фиксацию суммы' : 'Зафиксировать сумму'}
            aria-label={task.allocationMode === 'manual' ? 'Снять фиксацию суммы' : 'Зафиксировать сумму'}
            className={cn(
              'rounded-sm p-0.5 text-slate-300 transition-opacity hover:text-slate-500',
              task.hasOwnFinanceSetting && task.allocationMode === 'manual'
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
              (readOnly || savingTaskId === task.id || (!task.parentId && task.allocationMode === 'auto')) && 'cursor-default',
            )}
          >
            <Lock className="h-3 w-3" />
          </button>
          <span style={{ fontWeight: task.parentId ? 500 : 700 }}>
            {task.allocationMode === 'manual' ? 'Ручной' : 'Авто'}
          </span>
        </div>
      ),
    },
    {
      id: 'plannedCost',
      header: 'Бюджет',
      width: COST_COLUMN_WIDTH,
      after: 'allocationMode',
      align: 'right',
      editable: !readOnly,
      renderCell: ({ task }) => (
        savingTaskId === task.id
          ? <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-slate-500" />
          : <MoneyValue value={task.plannedCost} fontWeight={task.parentId ? 500 : 700} />
      ),
      renderEditor: ({ task, editStartValue, updateTask, closeEditor }) => (
        <BudgetCellEditor
          value={task.plannedCost}
          editStartValue={editStartValue}
          onCommit={(nextValue) => {
            updateTask({ plannedCost: nextValue, allocationMode: 'manual' });
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      ),
    },
    {
      id: 'paidToDate',
      header: 'Оплачено',
      width: PAID_COLUMN_WIDTH,
      after: 'plannedCost',
      align: 'right',
      renderCell: ({ task }) => (
        <MoneyValue
          value={task.paidToDate}
          color={task.paidToDate > 0 ? '#0f766e' : '#94a3b8'}
          fontWeight={task.parentId ? 500 : 700}
        />
      ),
    },
  ], [
    readOnly,
    savingTaskId,
    updateAllocationMode,
  ]);

  const matrixColumnGroups = useMemo<TableMatrixColumnGroup[]>(() => {
    if (!snapshot) {
      return [];
    }

    const groups: TableMatrixColumnGroup[] = [];
    const seen = new Set<string>();

    for (const period of snapshot.periods) {
      const group = buildPeriodGroup(period, snapshot.granularity);
      if (seen.has(group.id)) {
        continue;
      }
      seen.add(group.id);
      groups.push({
        id: group.id,
        header: group.label,
      });
    }

    return groups;
  }, [snapshot]);

  const matrixColumns = useMemo<TableMatrixColumn<FinanceMatrixTask>[]>(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.periods.map((period) => {
      const group = buildPeriodGroup(period, snapshot.granularity);
      return {
        id: period.id,
        header: period.label,
        groupId: group.id,
        width: getMatrixColumnWidth(snapshot.granularity),
        align: 'right',
        cellClassName: (task) => [
          task.plannedByPeriod[period.id] ? 'finance-matrix-cell-active' : 'finance-matrix-cell-empty',
        ].join(' '),
        renderCell: (task) => {
          const plannedValue = task.plannedByPeriod[period.id] ?? 0;
          const share = plannedValue > 0 ? Math.round((plannedValue / Math.max(task.plannedCost, 1)) * 100) : 0;
          const showSecondaryLine = plannedValue > 0 && share >= 18;

          return (
            <div style={{ display: 'grid', gap: 2, justifyItems: 'end', width: '100%', padding: '2px 0' }}>
              {plannedValue > 0 && (
                <MoneyValue value={plannedValue} color="#0f172a" />
              )}
              {showSecondaryLine && (
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {share}% бюджета
                </span>
              )}
            </div>
          );
        },
      };
    });
  }, [snapshot]);

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

      <div ref={chartHostRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {snapshot && snapshot.tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            В проекте пока нет задач для финансовой таблицы.
          </div>
        ) : (
          <GanttChart<FinanceMatrixTask>
            mode="table-matrix"
            tasks={tasks}
            showTaskList={true}
            taskListWidth={620}
            rowHeight={36}
            rowContentLines={2}
            headerHeight={52}
            containerHeight={chartHeight}
            matrixColumns={matrixColumns}
            matrixColumnGroups={snapshot?.granularity === 'week' ? matrixColumnGroups : undefined}
            additionalColumns={additionalColumns}
            hiddenTaskListColumns={['dependencies', 'progress', 'duration', 'startDate', 'endDate', 'actions']}
            disableTaskDrag={true}
            disableTaskNameEditing={true}
            disableDependencyEditing={true}
            enableAddTask={false}
            hideTaskListRowActions={true}
            collapsedParentIds={collapsedTaskIds}
            onToggleCollapse={toggleCollapse}
            onTasksChange={handleFinanceTasksChange}
            onMatrixCellClick={({ task, column }) => {
              if (readOnly) {
                return;
              }
              openDrawer(task.id, column.id, null);
            }}
          />
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
