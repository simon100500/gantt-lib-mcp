import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { GanttChart } from 'gantt-lib';
import type { TableMatrixColumn, TableMatrixColumnGroup, Task, TaskListColumn } from 'gantt-lib';
import { ChevronsDownUp, ChevronsUpDown, GitMerge, LoaderCircle, Lock, Pencil, RefreshCw, TriangleAlert, X } from 'lucide-react';

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

type FinanceToast = {
  id: number;
  message: string;
};

type AllocationConfirmState = {
  taskId: string;
  taskName: string;
  fallbackPlannedCost: number;
} | null;

const FINANCE_CHART_HEIGHT = 'calc(100dvh - 132px)';
const FINANCE_ROW_HEIGHT_WITH_FUNDING = 36;
const FINANCE_ROW_HEIGHT_COMPACT = 24;
const LOCK_COLUMN_WIDTH = 26;
const MIN_COST_COLUMN_WIDTH = 120;
const MIN_EARNED_COLUMN_WIDTH = 104;
const MIN_PAID_COLUMN_WIDTH = 104;
const MIN_VARIANCE_COLUMN_WIDTH = 104;
const DAY_MS = 24 * 60 * 60 * 1000;
const MATRIX_COLUMN_WIDTH_WEEK = 98;
const DAY_COLUMN_WIDTH = MATRIX_COLUMN_WIDTH_WEEK / 7;
const MIN_MATRIX_COLUMN_WIDTH_WEEK = 96;
const MIN_MATRIX_COLUMN_WIDTH_MONTH = 108;
const MAX_MATRIX_COLUMN_WIDTH = 340;
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

function normalizeFinanceErrorMessage(message: string): string {
  const normalized = message.trim();

  switch (normalized) {
    case 'Auto allocation requires a parent with planned cost':
      return 'Автораспределение доступно только если у родительской задачи задан бюджет.';
    case 'Child manual amounts exceed parent planned cost':
      return 'Сумма зафиксированных дочерних значений превышает бюджет родительской задачи.';
    case 'When all child amounts are fixed, their sum must equal parent planned cost':
      return 'Если у всех дочерних задач сумма зафиксирована, их общая сумма должна совпадать с бюджетом родительской задачи.';
    case 'Invalid asOf date':
      return 'Некорректная дата в параметре asOf.';
    case 'taskId required':
      return 'Не указан taskId.';
    case 'plannedCost must be a non-negative number':
      return 'Плановая стоимость должна быть неотрицательным числом.';
    case 'plannedCost or allocationMode required':
      return 'Нужно передать plannedCost или allocationMode.';
    case 'eventDate must be YYYY-MM-DD':
      return 'Дата события должна быть в формате YYYY-MM-DD.';
    case 'amount must be a number':
      return 'Сумма должна быть числом.';
    case 'eventId required':
      return 'Не указан eventId.';
    default:
      return normalized.startsWith('HTTP ') ? 'Не удалось выполнить запрос. Попробуйте ещё раз.' : normalized;
  }
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
  tasks: ProjectFinanceSnapshot['tasks'],
): TaskFundingEvent[] {
  if (!drawer) {
    return [];
  }

  const taskIds = new Set<string>([drawer.taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.parentTaskId && taskIds.has(task.parentTaskId) && !taskIds.has(task.taskId)) {
        taskIds.add(task.taskId);
        changed = true;
      }
    }
  }

  const taskEvents = events.filter((event) => taskIds.has(event.taskId));
  if (!drawer.periodId) {
    return taskEvents;
  }

  const period = periods.find((candidate) => candidate.id === drawer.periodId);
  if (!period) {
    return taskEvents;
  }

  return taskEvents.filter((event) => event.eventDate >= period.startDate && event.eventDate <= period.endDate);
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getUtcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthGroupLabel(date: Date): string {
  const monthLabel = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  const shortYear = String(date.getUTCFullYear()).slice(-2);

  return `${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}'${shortYear}`;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function getMonthGroupDateForWeek(period: FinancePeriodBucket): Date {
  const startDate = parseUtcDate(period.startDate);
  const endDate = parseUtcDate(period.endDate);
  if (startDate.getUTCMonth() === endDate.getUTCMonth() && startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return startDate;
  }

  return endDate.getUTCDate() > 3 ? endDate : startDate;
}

function buildPeriodGroup(period: FinancePeriodBucket, granularity: FinancePeriodGranularity): { id: string; label: string } {
  if (granularity === 'month') {
    const date = parseUtcDate(period.startDate);
    const year = date.getUTCFullYear();
    return { id: `year:${year}`, label: String(year) };
  }

  const monthDate = getMonthGroupDateForWeek(period);
  const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    timeZone: 'UTC',
  }).format(monthDate);
  const shortYear = String(monthDate.getUTCFullYear()).slice(-2);

  return {
    id: `month:${monthKey}`,
    label: `${monthLabel} '${shortYear}`,
  };
}

function buildVisibleMonthGroups(periods: FinancePeriodBucket[]): TableMatrixColumnGroup[] {
  if (periods.length === 0) {
    return [];
  }

  const visibleStart = parseUtcDate(periods[0]!.startDate);
  const visibleEndExclusive = addUtcDays(parseUtcDate(periods[periods.length - 1]!.endDate), 1);
  const groups: TableMatrixColumnGroup[] = [];
  let cursor = startOfUtcMonth(visibleStart);

  while (cursor < visibleEndExclusive) {
    const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const groupStart = visibleStart > cursor ? visibleStart : cursor;
    const groupEnd = nextMonth < visibleEndExclusive ? nextMonth : visibleEndExclusive;

    groups.push({
      id: `month:${getUtcMonthKey(cursor)}`,
      header: formatMonthGroupLabel(cursor),
      width: daysBetween(groupStart, groupEnd) * DAY_COLUMN_WIDTH,
    });

    cursor = nextMonth;
  }

  return groups;
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

function getMatrixColumnMinWidth(granularity: FinancePeriodGranularity): number {
  return granularity === 'week' ? MIN_MATRIX_COLUMN_WIDTH_WEEK : MIN_MATRIX_COLUMN_WIDTH_MONTH;
}

function getMatrixColumnSizing(granularity: FinancePeriodGranularity) {
  return granularity === 'week'
    ? { width: MATRIX_COLUMN_WIDTH_WEEK }
    : {
      width: 'auto' as const,
      minWidth: getMatrixColumnMinWidth(granularity),
      maxWidth: MAX_MATRIX_COLUMN_WIDTH,
    };
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
  className,
}: {
  value: number;
  color?: string;
  fontWeight?: number;
  prefix?: string;
  className?: string;
}) {
  return (
    <span className={cn('finance-money-value', className)} style={{ color, fontWeight, fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{formatMoney(value)}
    </span>
  );
}

function formatShare(value: number, total: number): string | null {
  if (total <= 0 || value <= 0) {
    return null;
  }

  return `${Math.round((value / total) * 100)}%`;
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
  const [toasts, setToasts] = useState<FinanceToast[]>([]);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [allocationConfirmState, setAllocationConfirmState] = useState<AllocationConfirmState>(null);
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
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((toastId: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback((message: string) => {
    const normalized = normalizeFinanceErrorMessage(message);
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, message: normalized }]);
  }, []);

  const loadSnapshot = useCallback(async (
    targetGranularity: FinancePeriodGranularity,
    targetAsOfDate: string,
    showSpinner: boolean,
    forceRefresh = false,
  ) => {
    if (!accessToken) {
      setSnapshot(null);
      setLoading(false);
      showToast('Нет доступа к финансовым данным.');
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
    } catch (loadError) {
      showToast(loadError instanceof Error ? loadError.message : 'Не удалось загрузить финансы.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, showToast]);

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
  const outstandingReceivable = useMemo(
    () => projectTotals.earnedToDate - projectTotals.paidToDate,
    [projectTotals.earnedToDate, projectTotals.paidToDate],
  );
  const drawerEvents = useMemo(
    () => drawerState && snapshot ? filterEventsForDrawer(snapshot.events, drawerState, snapshot.periods, snapshot.tasks) : [],
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
  const drawerTaskTitleById = useMemo(
    () => new Map(snapshot?.tasks.map((task) => [task.taskId, task.title]) ?? []),
    [snapshot],
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
    const earnedValues = tasks.map((task) => formatMoney(task.earnedToDate));
    const paidValues = tasks.map((task) => formatMoney(task.paidToDate));
    const varianceValues = tasks.map((task) => formatMoney(task.varianceEarnedVsPaid));

    return {
      plannedCost: estimateMoneyColumnWidth(['Бюджет', ...plannedValues], MIN_COST_COLUMN_WIDTH),
      earnedToDate: estimateMoneyColumnWidth(['Освоено', ...earnedValues], MIN_EARNED_COLUMN_WIDTH),
      paidToDate: estimateMoneyColumnWidth(['Оплачено', ...paidValues], MIN_PAID_COLUMN_WIDTH),
      varianceEarnedVsPaid: estimateMoneyColumnWidth(['Разница', ...varianceValues], MIN_VARIANCE_COLUMN_WIDTH),
    };
  }, [tasks]);
  const financeTaskListWidth = useMemo(() => (
    Math.max(
      250,
      + LOCK_COLUMN_WIDTH
      + financeColumnWidths.plannedCost
      + financeColumnWidths.earnedToDate
      + financeColumnWidths.paidToDate
      + financeColumnWidths.varianceEarnedVsPaid,
    )
  ), [
    financeColumnWidths.earnedToDate,
    financeColumnWidths.paidToDate,
    financeColumnWidths.plannedCost,
    financeColumnWidths.varianceEarnedVsPaid,
  ]);
  const parentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) {
        ids.add(task.parentId);
      }
    }
    return ids;
  }, [tasks]);

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
  const collapseAll = useCallback(() => {
    setCollapsedTaskIds(new Set(parentTaskIds));
  }, [parentTaskIds]);
  const expandAll = useCallback(() => {
    setCollapsedTaskIds(new Set());
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
      showToast(saveError instanceof Error ? saveError.message : 'Не удалось сохранить стоимость.');
      await loadSnapshot(granularity, asOfDate, false, true);
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, asOfDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, showToast, snapshot]);

  const redistributeChildrenFromParent = useCallback(async (taskId: string, plannedCost: number) => {
    if (!accessToken || readOnly) {
      return false;
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
          plannedCost,
          allocationMode: 'manual',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      await loadSnapshot(granularity, asOfDate, false, true);
      return true;
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'Не удалось пересчитать дочерние задачи.');
      return false;
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, asOfDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, showToast]);

  const updateAllocationMode = useCallback(async (taskId: string, allocationMode: 'manual' | 'auto', fallbackPlannedCost: number) => {
    if (!accessToken || readOnly) {
      return false;
    }

    const currentTask = snapshot?.tasks.find((task) => task.taskId === taskId);
    if (!currentTask || currentTask.allocationMode === allocationMode) {
      return false;
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
      return true;
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'Не удалось обновить режим суммы.');
      return false;
    } finally {
      setSavingTaskId(null);
    }
  }, [accessToken, asOfDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, showToast, snapshot]);

  const requestAllocationModeChange = useCallback((task: FinanceMatrixTask) => {
    const nextAllocationMode = task.allocationMode === 'manual' ? 'auto' : 'manual';
    if (nextAllocationMode === 'auto' && parentTaskIds.has(task.id)) {
      setAllocationConfirmState({
        taskId: task.id,
        taskName: task.name,
        fallbackPlannedCost: task.plannedCost,
      });
      return;
    }

    void updateAllocationMode(task.id, nextAllocationMode, task.plannedCost);
  }, [parentTaskIds, updateAllocationMode]);

  const closeAllocationConfirmation = useCallback(() => {
    if (allocationConfirmState && savingTaskId === allocationConfirmState.taskId) {
      return;
    }
    setAllocationConfirmState(null);
  }, [allocationConfirmState, savingTaskId]);

  const confirmAllocationModeChange = useCallback(async () => {
    if (!allocationConfirmState) {
      return;
    }

    const changed = await redistributeChildrenFromParent(
      allocationConfirmState.taskId,
      allocationConfirmState.fallbackPlannedCost,
    );
    if (changed) {
      setAllocationConfirmState(null);
    }
  }, [allocationConfirmState, redistributeChildrenFromParent]);

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
      showToast('Введите положительную сумму.');
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
      const message = submitError instanceof Error ? submitError.message : 'Не удалось сохранить поступление.';
      setDrawerError(normalizeFinanceErrorMessage(message));
      showToast(message);
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, asOfDate, drawerState, eventForm.amount, eventForm.comment, eventForm.eventDate, granularity, invalidateSnapshotCache, loadSnapshot, readOnly, showToast]);

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
      const message = deleteError instanceof Error ? deleteError.message : 'Не удалось удалить поступление.';
      setDrawerError(normalizeFinanceErrorMessage(message));
      showToast(message);
    } finally {
      setDrawerPending(false);
    }
  }, [accessToken, asOfDate, drawerState, granularity, invalidateSnapshotCache, loadSnapshot, openDrawer, readOnly, showToast]);

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
      id: 'plannedCost',
      header: <span title="Плановая стоимость задачи.">Бюджет</span>,
      width: financeColumnWidths.plannedCost,
      after: 'name',
      align: 'right',
      editable: !readOnly,
      renderCell: ({ task }) => (
        savingTaskId === task.id
          ? <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-slate-500" />
          : <MoneyValue value={task.plannedCost} fontWeight={task.parentId ? 500 : 700} className="text-[12px]" />
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
      id: 'allocationMode',
      header: '',
      width: LOCK_COLUMN_WIDTH,
      after: 'plannedCost',
      align: 'center',
      renderCell: ({ task }) => {
        const hasVisibleManualLock = task.hasOwnFinanceSetting && task.allocationMode === 'manual' && task.plannedCost > 0;

        return (
          <div className="group flex min-h-[28px] items-center justify-center">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                requestAllocationModeChange(task);
              }}
              disabled={readOnly || savingTaskId === task.id || (!task.parentId && task.allocationMode === 'auto')}
              title={hasVisibleManualLock ? 'Снять фиксацию суммы' : 'Зафиксировать сумму'}
              aria-label={hasVisibleManualLock ? 'Снять фиксацию суммы' : 'Зафиксировать сумму'}
              className={cn(
                'rounded-sm p-0.5 text-slate-400 transition-colors transition-opacity hover:text-primary focus-visible:text-primary',
                hasVisibleManualLock
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                (readOnly || savingTaskId === task.id || (!task.parentId && task.allocationMode === 'auto')) && 'cursor-default',
              )}
            >
              <Lock className="h-3 w-3" />
            </button>
          </div>
        );
      },
    },
    {
      id: 'earnedToDate',
      header: <span title="Освоенная стоимость: бюджет, умноженный на процент выполнения.">Освоено</span>,
      width: financeColumnWidths.earnedToDate,
      after: 'allocationMode',
      align: 'right',
      renderCell: ({ task }) => {
        const share = formatShare(task.earnedToDate, task.plannedCost);

        return (
          <div className="grid justify-items-end gap-[3px] leading-none">
            <MoneyValue
              value={task.earnedToDate}
              color={task.earnedToDate > 0 ? '#0f172a' : '#94a3b8'}
              fontWeight={task.parentId ? 500 : 700}
              className="text-[12px]"
            />
            {share && (
              <span className="text-[10px] text-slate-400">
                {share}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'paidToDate',
      header: <span title="Фактически оплаченная сумма по задаче.">Оплачено</span>,
      width: financeColumnWidths.paidToDate,
      after: 'earnedToDate',
      align: 'right',
      renderCell: ({ task }) => {
        const share = formatShare(task.paidToDate, task.plannedCost);

        return (
          <div className="grid justify-items-end gap-[3px] leading-none">
            <MoneyValue
              value={task.paidToDate}
              color={task.paidToDate > 0 ? MATRIX_RECEIVED_COLOR : '#94a3b8'}
              fontWeight={task.parentId ? 500 : 700}
              className="text-[12px]"
            />
            {share && (
              <span className="text-[10px] text-slate-400">
                {share}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'varianceEarnedVsPaid',
      header: <span title="Разница между освоено и оплачено. Плюс — должны мы, минус — должны нам.">Разница</span>,
      width: financeColumnWidths.varianceEarnedVsPaid,
      after: 'paidToDate',
      align: 'right',
      renderCell: ({ task }) => (
        <MoneyValue
          value={task.varianceEarnedVsPaid}
          color={
            task.varianceEarnedVsPaid > 0
              ? '#be123c'
              : task.varianceEarnedVsPaid < 0
                ? '#047857'
                : '#94a3b8'
          }
          fontWeight={task.parentId ? 500 : 700}
          className="text-[12px]"
          prefix={task.varianceEarnedVsPaid > 0 ? '+' : ''}
        />
      ),
    },
  ], [
    readOnly,
    financeColumnWidths.earnedToDate,
    financeColumnWidths.paidToDate,
    financeColumnWidths.plannedCost,
    financeColumnWidths.varianceEarnedVsPaid,
    requestAllocationModeChange,
    savingTaskId,
  ]);

  const matrixColumnGroups = useMemo<TableMatrixColumnGroup[]>(() => {
    if (!snapshot) {
      return [];
    }

    if (snapshot.granularity === 'week') {
      return buildVisibleMonthGroups(snapshot.periods);
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
        header: formatPeriodColumnHeader(period, snapshot.granularity),
        groupId: group.id,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        ...getMatrixColumnSizing(snapshot.granularity),
        align: 'right',
        cellClassName: (task) => [
          task.plannedByPeriod[period.id]
            ? 'finance-matrix-cell-active'
            : 'finance-matrix-cell-empty',
        ].join(' '),
        renderCell: (task) => {
          const plannedValue = task.plannedByPeriod[period.id] ?? 0;
          const paidValue = showFundingLine ? (task.paidByPeriod[period.id] ?? 0) : 0;

          return (
            <div className="finance-period-cell finance-period-cell-with-gap">
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

  const matrixDateOverlay = useMemo(() => {
    if (!snapshot) {
      return false;
    }

    return {
      date: todayIso(),
      shouldRender: () => false,
    };
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
    <div className="finance-workspace flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-[420px] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur"
              role="alert"
              aria-atomic="true"
            >
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">{toast.message}</div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Скрыть уведомление"
                title="Скрыть уведомление"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 md:px-4">
        <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 bg-[#f4f5f7] py-2">
          <div className="flex flex-wrap items-center gap-2">
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
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>На дату</span>
              <Input
                className="h-9 w-[150px] bg-white"
                type="date"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
              />
            </label>
            <Button
              size="sm"
              variant="ghost"
              onClick={collapseAll}
              disabled={parentTaskIds.size === 0}
              aria-label="Свернуть все"
              title="Свернуть все родительские задачи"
              className="hidden h-8 px-2 text-slate-600 hover:text-primary lg:flex"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={expandAll}
              disabled={collapsedTaskIds.size === 0}
              aria-label="Развернуть все"
              title="Развернуть все родительские задачи"
              className="hidden h-8 px-2 text-slate-600 hover:text-primary lg:flex"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </Button>
            <label className="flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-transparent px-2.5 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showFundingLine}
                onChange={(event) => setShowFundingLine(event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
              />
              <span>Поступления</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-slate-600">
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs leading-tight text-slate-600">
              <div className="grid grid-cols-[auto_minmax(88px,1fr)] items-baseline gap-x-2" title="Общий бюджет проекта.">
                <span className="whitespace-nowrap">Бюджет</span>
                <span className="text-right font-medium tabular-nums text-slate-900">{formatMoney(projectTotals.plannedCost)}</span>
              </div>
              <div className="grid grid-cols-[auto_minmax(88px,1fr)] items-baseline gap-x-2" title="Освоенная стоимость: бюджет, умноженный на процент выполнения.">
                <span className="whitespace-nowrap">Освоено</span>
                <span className="text-right font-medium tabular-nums text-slate-900">{formatMoney(projectTotals.earnedToDate)}</span>
              </div>
              <div className="grid grid-cols-[auto_minmax(88px,1fr)] items-baseline gap-x-2" title="Плановая сумма к текущей дате.">
                <span className="whitespace-nowrap">План</span>
                <span className="text-right font-medium tabular-nums text-slate-900">{formatMoney(projectTotals.plannedToDate)}</span>
              </div>
              <div className="grid grid-cols-[auto_minmax(88px,1fr)] items-baseline gap-x-2" title="Фактически оплаченная сумма от заказчика.">
                <span className="whitespace-nowrap">Оплачено</span>
                <span className="text-right font-medium tabular-nums text-slate-900">{formatMoney(projectTotals.paidToDate)}</span>
              </div>
            </div>
            <div
              className={cn(
                'grid grid-cols-[auto_minmax(88px,1fr)] items-baseline gap-x-2 rounded-md border px-2.5 py-1.5 text-xs leading-tight',
                outstandingReceivable > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : outstandingReceivable < 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-slate-100 text-slate-700',
              )}
              title="Разница между освоено и оплачено. Плюс — должны мы, минус — должны нам."
            >
              <div className="whitespace-nowrap">Должны нам</div>
              <div className="text-right font-semibold tabular-nums">{formatMoney(outstandingReceivable)}</div>
            </div>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => { void loadSnapshot(granularity, asOfDate, false, true); }} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col overflow-auto px-3 md:px-4">
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
                matrixColumnGroups={matrixColumnGroups.length > 0 ? matrixColumnGroups : undefined}
                matrixDateOverlay={matrixDateOverlay}
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

            {allocationConfirmState && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    closeAllocationConfirmation();
                  }
                }}
              >
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="finance-allocation-confirm-title"
                  className="w-[460px] max-w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <TriangleAlert className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="finance-allocation-confirm-title" className="text-lg font-semibold text-slate-900">
                        Снять фиксацию у родителя?
                      </h2>
                      <div className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                        <p>Для задачи «{allocationConfirmState.taskName}» стоимость будет пересчитана по длительности.</p>
                        <p>Фиксация суммы у всех дочерних задач тоже будет снята, и они перейдут в автораспределение.</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeAllocationConfirmation}
                      disabled={savingTaskId === allocationConfirmState.taskId}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => { void confirmAllocationModeChange(); }}
                      disabled={savingTaskId === allocationConfirmState.taskId}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingTaskId === allocationConfirmState.taskId && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      Продолжить
                    </button>
                  </div>
                </section>
              </div>
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
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
                          {sortedDrawerEvents.map((event) => {
                            const sourceTaskTitle = event.taskId !== drawerState.taskId
                              ? drawerTaskTitleById.get(event.taskId)
                              : null;

                            return (
                              <div key={event.id} className="finance-history-item">
                                {sourceTaskTitle && (
                                  <div className="finance-history-source-row">
                                    <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{sourceTaskTitle}</span>
                                  </div>
                                )}
                                <div className="finance-history-detail-row">
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
                              </div>
                            );
                          })}
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
