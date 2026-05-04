import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { GanttChart } from 'gantt-lib';
import type { TableMatrixColumn, TableMatrixColumnGroup, Task, TaskListColumn } from 'gantt-lib';
import { LoaderCircle, Lock, Pencil, RefreshCw, X } from 'lucide-react';

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

const FINANCE_CHART_HEIGHT = 'calc(100dvh - 132px)';
const FINANCE_ROW_HEIGHT_WITH_FUNDING = 36;
const FINANCE_ROW_HEIGHT_COMPACT = 24;
const LOCK_COLUMN_WIDTH = 36;
const MIN_COST_COLUMN_WIDTH = 120;
const MIN_PAID_COLUMN_WIDTH = 120;
const MIN_MATRIX_COLUMN_WIDTH_WEEK = 82;
const MIN_MATRIX_COLUMN_WIDTH_MONTH = 92;
const MONEY_COLUMN_HORIZONTAL_PADDING = 26;
const MONEY_CHARACTER_WIDTH = 7.4;
const MATRIX_RECEIVED_COLOR = '#34c15c';

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number): string {
  if (Math.abs(value) < 0.0001) {
    return '0';
  }
  return moneyFormatter.format(value);
}

function formatInputMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(value);
}

function formatReceivedMoney(value: number): string {
  return `+${formatMoney(value)}`;
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseFundingAmount(value: string): number | null {
  const parsed = parseMoneyInput(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

const RUSSIAN_MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function formatPeriodDetails(period: FinancePeriodBucket | null, granularity: FinancePeriodGranularity): string {
  if (!period) {
    return 'Весь период';
  }

  const startDate = new Date(`${period.startDate}T00:00:00Z`);
  const endDate = new Date(`${period.endDate}T00:00:00Z`);

  if (granularity === 'month') {
    return new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(startDate);
  }

  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const startMonth = RUSSIAN_MONTHS_GENITIVE[startDate.getUTCMonth()];
  const endMonth = RUSSIAN_MONTHS_GENITIVE[endDate.getUTCMonth()];
  const endYear = endDate.getUTCFullYear();

  if (startDate.getUTCMonth() === endDate.getUTCMonth() && startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${startDay}–${endDay} ${endMonth} ${endYear}`;
  }

  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
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
    timeZone: 'UTC',
  }).format(date);
  const shortYear = String(date.getUTCFullYear()).slice(-2);

  return {
    id: `month:${monthKey}`,
    label: `${monthLabel} '${shortYear}`,
  };
}

function formatPeriodColumnHeader(period: FinancePeriodBucket, granularity: FinancePeriodGranularity): string {
  const startDate = new Date(`${period.startDate}T00:00:00Z`);
  const endDate = new Date(`${period.endDate}T00:00:00Z`);

  if (granularity === 'month') {
    return new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      timeZone: 'UTC',
    }).format(startDate);
  }

  const startDay = String(startDate.getUTCDate()).padStart(2, '0');
  const endDay = String(endDate.getUTCDate()).padStart(2, '0');
  return `${startDay}-${endDay}`;
}

function getMatrixColumnWidth(granularity: FinancePeriodGranularity): number {
  return granularity === 'week' ? MIN_MATRIX_COLUMN_WIDTH_WEEK : MIN_MATRIX_COLUMN_WIDTH_MONTH;
}

function estimateMoneyColumnWidth(values: string[], minWidth: number): number {
  const maxLength = values.reduce((max, value) => Math.max(max, value.length), 0);
  return Math.max(minWidth, Math.ceil(maxLength * MONEY_CHARACTER_WIDTH + MONEY_COLUMN_HORIZONTAL_PADDING));
}

function getSnapshotCacheKey(asOfDate: string, granularity: FinancePeriodGranularity): string {
  return `${asOfDate}:${granularity}`;
}

function MoneyValue({
  value,
  color,
  fontWeight,
  prefix = '',
}: {
  value: number;
  color?: string;
  fontWeight?: number;
  prefix?: string;
}) {
  return (
    <span className="finance-money-value" style={{ color, fontWeight, fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{formatMoney(value)}
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
  onBackToProject: _onBackToProject,
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
  const [showFundingLine, setShowFundingLine] = useState(true);
  const snapshotCacheRef = useRef<Map<string, ProjectFinanceSnapshot>>(new Map());
  const activeSnapshotKeyRef = useRef(getSnapshotCacheKey(asOfDate, granularity));
  const eventAmountInputRef = useRef<HTMLInputElement | null>(null);
  const [eventForm, setEventForm] = useState<{ eventDate: string; amount: string; comment: string }>({
    eventDate: todayIso(),
    amount: '',
    comment: '',
  });

  const loadSnapshot = useCallback(async (
    targetGranularity: FinancePeriodGranularity,
    targetAsOfDate: string,
    showSpinner: boolean,
    forceRefresh = false,
  ) => {
    if (!accessToken) {
      setSnapshot(null);
      setLoading(false);
      setError('Нет доступа к финансовым данным.');
      return;
    }

    const cacheKey = getSnapshotCacheKey(targetAsOfDate, targetGranularity);
    const cachedSnapshot = snapshotCacheRef.current.get(cacheKey);
    if (!forceRefresh && cachedSnapshot) {
      if (activeSnapshotKeyRef.current === cacheKey) {
        setSnapshot(cachedSnapshot);
      }
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const query = new URLSearchParams({
        asOf: targetAsOfDate,
        granularity: targetGranularity,
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
      snapshotCacheRef.current.set(getSnapshotCacheKey(data.asOfDate, data.granularity), data);
      if (activeSnapshotKeyRef.current === cacheKey) {
        setSnapshot(data);
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить финансы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    activeSnapshotKeyRef.current = getSnapshotCacheKey(asOfDate, granularity);
    void loadSnapshot(granularity, asOfDate, true);
  }, [accessToken, asOfDate, loadSnapshot]);

  const selectGranularity = useCallback((nextGranularity: FinancePeriodGranularity) => {
    if (nextGranularity === granularity) {
      return;
    }

    activeSnapshotKeyRef.current = getSnapshotCacheKey(asOfDate, nextGranularity);
    setGranularity(nextGranularity);
    void loadSnapshot(nextGranularity, asOfDate, false);
  }, [asOfDate, granularity, loadSnapshot]);

  const invalidateSnapshotCache = useCallback(() => {
    snapshotCacheRef.current.clear();
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
  const sortedDrawerEvents = useMemo(
    () => drawerEvents.slice().sort((left, right) => (
      right.eventDate.localeCompare(left.eventDate) || right.createdAt.localeCompare(left.createdAt)
    )),
    [drawerEvents],
  );
  const drawerEventsTotal = useMemo(
    () => drawerEvents.reduce((total, event) => total + event.amount, 0),
    [drawerEvents],
  );
  const drawerTask = useMemo(
    () => drawerState && snapshot ? snapshot.tasks.find((task) => task.taskId === drawerState.taskId) ?? null : null,
    [drawerState, snapshot],
  );
  const drawerPeriod = useMemo(
    () => drawerState?.periodId && snapshot ? snapshot.periods.find((period) => period.id === drawerState.periodId) ?? null : null,
    [drawerState, snapshot],
  );
  const drawerContractAmount = drawerTask
    ? drawerTask.plannedCost
    : 0;
  const drawerPeriodAmount = drawerTask && drawerState?.periodId
    ? drawerTask.plannedByPeriod[drawerState.periodId] ?? 0
    : drawerContractAmount;
  const financeColumnWidths = useMemo(() => {
    const plannedValues = tasks.map((task) => formatMoney(task.plannedCost));
    const paidValues = tasks.map((task) => formatMoney(task.paidToDate));

    return {
      plannedCost: estimateMoneyColumnWidth(['Бюджет', ...plannedValues], MIN_COST_COLUMN_WIDTH),
      paidToDate: estimateMoneyColumnWidth(['Оплачено', ...paidValues], MIN_PAID_COLUMN_WIDTH),
    };
  }, [tasks]);
  const financeTaskListWidth = useMemo(() => (
    Math.max(620, 356 + LOCK_COLUMN_WIDTH + financeColumnWidths.plannedCost + financeColumnWidths.paidToDate)
  ), [financeColumnWidths.paidToDate, financeColumnWidths.plannedCost]);

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

    invalidateSnapshotCache();
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

      await loadSnapshot(granularity, asOfDate, false, true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить стоимость');
      await loadSnapshot(granularity, asOfDate, false, true);
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, asOfDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, snapshot]);

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
      invalidateSnapshotCache();
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
      await loadSnapshot(granularity, asOfDate, false, true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить режим суммы');
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, asOfDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, snapshot]);

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

  useEffect(() => {
    if (!drawerState) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      eventAmountInputRef.current?.focus();
      eventAmountInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [drawerState]);

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

    const amount = parseFundingAmount(eventForm.amount);
    if (amount === null) {
      setDrawerError('Введите положительную сумму.');
      eventAmountInputRef.current?.focus();
      return;
    }

    setDrawerPending(true);
    try {
      invalidateSnapshotCache();
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

      await loadSnapshot(granularity, asOfDate, false, true);
      setDrawerState((current) => current ? { ...current, editingEventId: null } : current);
      setEventForm((current) => ({
        ...current,
        amount: '',
        comment: '',
      }));
      eventAmountInputRef.current?.focus();
    } catch (submitError) {
      setDrawerError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить поступление');
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, asOfDate, drawerState, eventForm.amount, eventForm.comment, eventForm.eventDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly]);

  const handleEventFormKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void submitEvent();
  }, [submitEvent]);

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!accessToken || !drawerState || readOnly) {
      return;
    }

    if (!window.confirm('Удалить поступление?')) {
      return;
    }

    setDrawerPending(true);
    try {
      invalidateSnapshotCache();
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
      await loadSnapshot(granularity, asOfDate, false, true);
      openDrawer(drawerState.taskId, drawerState.periodId, null);
    } catch (deleteError) {
      setDrawerError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить поступление');
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, asOfDate, drawerState, granularity, invalidateSnapshotCache, loadSnapshot, openDrawer, readOnly]);

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
      header: '',
      width: LOCK_COLUMN_WIDTH,
      after: 'name',
      align: 'center',
      renderCell: ({ task }) => (
        <div className="group flex min-h-[28px] items-center justify-center">
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
        </div>
      ),
    },
    {
      id: 'plannedCost',
      header: 'Бюджет',
      width: financeColumnWidths.plannedCost,
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
      width: financeColumnWidths.paidToDate,
      after: 'plannedCost',
      align: 'right',
      renderCell: ({ task }) => (
        <MoneyValue
          value={task.paidToDate}
          color={task.paidToDate > 0 ? MATRIX_RECEIVED_COLOR : '#94a3b8'}
          fontWeight={task.parentId ? 500 : 700}
        />
      ),
    },
  ], [
    readOnly,
    financeColumnWidths.paidToDate,
    financeColumnWidths.plannedCost,
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
      const periodValues = snapshot.tasks.flatMap((task) => {
        const values: string[] = [];
        const plannedValue = task.plannedByPeriod[period.id] ?? 0;
        const paidValue = showFundingLine ? (task.paidByPeriod[period.id] ?? 0) : 0;
        if (plannedValue > 0) {
          values.push(formatMoney(plannedValue));
        }
        if (paidValue > 0) {
          values.push(formatReceivedMoney(paidValue));
        }
        return values;
      });

      return {
        id: period.id,
        header: formatPeriodColumnHeader(period, snapshot.granularity),
        groupId: group.id,
        width: estimateMoneyColumnWidth(
          [formatPeriodColumnHeader(period, snapshot.granularity), ...periodValues],
          getMatrixColumnWidth(snapshot.granularity),
        ),
        align: 'right',
        cellClassName: (task) => [
          task.plannedByPeriod[period.id] || task.paidByPeriod[period.id]
            ? 'finance-matrix-cell-active'
            : 'finance-matrix-cell-empty',
        ].join(' '),
        renderCell: (task) => {
          const plannedValue = task.plannedByPeriod[period.id] ?? 0;
          const paidValue = showFundingLine ? (task.paidByPeriod[period.id] ?? 0) : 0;

          return (
            <div className="finance-period-cell">
              {plannedValue > 0 && (
                <MoneyValue value={plannedValue} color="#0f172a" />
              )}
              {paidValue > 0 && (
                <MoneyValue value={paidValue} color={MATRIX_RECEIVED_COLOR} prefix="+" />
              )}
            </div>
          );
        },
      };
    });
  }, [showFundingLine, snapshot]);

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
    <div className="finance-workspace flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      <div className="px-3 md:px-4">
        <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 bg-[#f4f5f7] py-2">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>Стоимость: {formatMoney(projectTotals.plannedCost)}</span>
            <span>План: {formatMoney(projectTotals.plannedToDate)}</span>
            <span>Освоено: {formatMoney(projectTotals.earnedToDate)}</span>
            <span>Оплачено: {formatMoney(projectTotals.paidToDate)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-transparent px-2.5 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showFundingLine}
                onChange={(event) => setShowFundingLine(event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
              />
              <span>Поступления</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>На дату</span>
              <Input
                className="h-9 w-[150px] bg-white"
                type="date"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
              />
            </label>
            <div className="inline-flex rounded-md">
              {(['week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectGranularity(mode)}
                  className={cn(
                    'relative flex h-8 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none',
                    mode === 'week' ? 'rounded-l-md border' : 'ml-[-1px] rounded-r-md border',
                    granularity === mode
                      ? 'z-10 border-primary bg-primary/5 text-primary [@media(any-hover:hover)]:hover:bg-primary/10'
                      : 'border-slate-300 text-slate-600 [@media(any-hover:hover)]:hover:border-primary [@media(any-hover:hover)]:hover:text-primary',
                  )}
                >
                  {mode === 'month' ? 'Месяцы' : 'Недели'}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => { void loadSnapshot(granularity, asOfDate, false, true); }} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col overflow-auto px-3 md:px-4">
        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {snapshot && snapshot.tasks.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                В проекте пока нет задач для финансовой таблицы.
              </div>
            ) : (
              <GanttChart<FinanceMatrixTask>
                mode="table-matrix"
                tasks={tasks}
                showTaskList={true}
                taskListWidth={financeTaskListWidth}
                rowHeight={showFundingLine ? FINANCE_ROW_HEIGHT_WITH_FUNDING : FINANCE_ROW_HEIGHT_COMPACT}
                rowContentLines={1}
                headerHeight={52}
                containerHeight={FINANCE_CHART_HEIGHT}
                matrixColumns={matrixColumns}
                matrixColumnGroups={matrixColumnGroups}
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
              <div className="finance-drawer-backdrop fixed inset-0 z-50 bg-slate-900/20" onMouseDown={closeDrawer}>
                <div
                  className="finance-drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-[-8px_0_28px_rgba(15,23,42,0.12)]"
                  onMouseDown={(event) => event.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Поступления"
                >
                  <div className="border-b border-slate-200 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-semibold leading-tight text-slate-900">Детали</h3>
                      <button type="button" onClick={closeDrawer} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-5 min-w-0">
                      <dl className="grid w-full gap-1.5 text-sm">
                        <div className="grid w-full grid-cols-[200px_minmax(0,1fr)] gap-3">
                          <dt className="text-slate-500">Работа</dt>
                          <dd className="min-w-0 whitespace-normal break-words font-medium leading-snug text-slate-900">{drawerTask?.title ?? 'Группа'}</dd>
                        </div>
                        <div className="grid w-full grid-cols-[200px_minmax(0,1fr)] gap-3">
                          <dt className="text-slate-500">Сумма по договору</dt>
                          <dd className="font-medium tabular-nums text-slate-900">{formatMoney(drawerContractAmount)} ₽</dd>
                        </div>
                        <div className="my-1 border-t border-slate-200 [grid-column:1/-1]" />
                        <div className="grid w-full grid-cols-[200px_minmax(0,1fr)] gap-3">
                          <dt className="text-slate-500">Период</dt>
                          <dd className="font-medium text-slate-900">{formatPeriodDetails(drawerPeriod, snapshot.granularity)}</dd>
                        </div>
                        <div className="grid w-full grid-cols-[200px_minmax(0,1fr)] gap-3">
                          <dt className="text-slate-500">Сумма за период</dt>
                          <dd className="font-medium tabular-nums text-slate-900">{formatMoney(drawerPeriodAmount)} ₽</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 finance-drawer-body">
                    <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-3">
                      <label className="finance-drawer-form-group">
                        <span className="finance-drawer-label">Сумма</span>
                        <div className="relative">
                          <Input
                            ref={eventAmountInputRef}
                            value={eventForm.amount}
                            onChange={(event) => setEventForm((current) => ({ ...current, amount: event.target.value }))}
                            onKeyDown={handleEventFormKeyDown}
                            placeholder="0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="finance-drawer-input pr-8 text-base font-semibold tabular-nums"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-400">₽</span>
                        </div>
                      </label>
                      <label className="finance-drawer-form-group">
                        <span className="finance-drawer-label">Дата</span>
                        <Input
                          type="date"
                          value={eventForm.eventDate}
                          onChange={(event) => setEventForm((current) => ({ ...current, eventDate: event.target.value }))}
                          onKeyDown={handleEventFormKeyDown}
                          className="finance-drawer-input"
                        />
                      </label>
                    </div>
                    <label className="finance-drawer-form-group mt-4">
                      <span className="finance-drawer-label">Комментарий</span>
                      <Input
                        value={eventForm.comment}
                        onChange={(event) => setEventForm((current) => ({ ...current, comment: event.target.value }))}
                        onKeyDown={handleEventFormKeyDown}
                        placeholder="Аванс, КС, этап..."
                        autoComplete="off"
                        className="finance-drawer-input"
                      />
                    </label>
                    {drawerError && (
                      <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {drawerError}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <Button onClick={() => { void submitEvent(); }} disabled={drawerPending || readOnly} className="h-8 px-4">
                        {drawerPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : drawerState.editingEventId ? 'Сохранить' : 'Добавить'}
                      </Button>
                      {drawerState.editingEventId && (
                        <Button variant="outline" className="h-8" onClick={() => openDrawer(drawerState.taskId, drawerState.periodId, null)} disabled={drawerPending}>
                          Отмена
                        </Button>
                      )}
                    </div>

                    <div className="my-5 h-px bg-slate-200" />

                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.03em] text-slate-500">История поступлений</div>
                    {sortedDrawerEvents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                        Для выбранной группы пока нет поступлений.
                      </div>
                    ) : (
                      <>
                        <div className="finance-history-list">
                          {sortedDrawerEvents.map((event) => (
                            <div key={event.id} className="finance-history-item">
                              <span className="finance-history-date">{formatDisplayDate(event.eventDate)}</span>
                              <span className="finance-history-amount">
                                +{formatMoney(event.amount)} ₽
                              </span>
                              <span className="finance-history-comment">{event.comment || '—'}</span>
                              <button
                                type="button"
                                className="finance-history-action"
                                onClick={() => openDrawer(drawerState.taskId, drawerState.periodId, event)}
                                disabled={drawerPending || readOnly}
                                aria-label="Редактировать"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="finance-history-action finance-history-delete"
                                onClick={() => { void deleteEvent(event.id); }}
                                disabled={drawerPending || readOnly}
                                aria-label="Удалить"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.03em] text-slate-500">Итого</span>
                          <span className="text-lg font-semibold tabular-nums text-green-600">+{formatMoney(drawerEventsTotal)} ₽</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
