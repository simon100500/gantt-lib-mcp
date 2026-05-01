import {
  AlertCircle,
  Bot,
  CalendarClock,
  ChartNoAxesGantt,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3Cog,
  Ellipsis,
  FileDown,
  FileSpreadsheet,
  FlagTriangleRight,
  Funnel,
  History,
  Layers3,
  Link,
  LoaderCircle,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../lib/utils.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { FilterPopup } from '../FilterPopup';

export interface ToolbarBaselineRow {
  id: string;
  label: string;
  selected?: boolean;
}

export interface ToolbarTaskListColumnRow {
  id: string;
  label: string;
}

interface ToolbarProps {
  showChatToggle?: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  isExportExcelLoading?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  showShareButton?: boolean;
  viewMode?: 'day' | 'week' | 'month';
  onViewModeChange?: (viewMode: 'day' | 'week' | 'month') => void;
  disableTaskDrag?: boolean;
  onToggleDisableTaskDrag?: (enabled: boolean) => void;
  ganttDayMode?: 'business' | 'calendar';
  onGanttDayModeChange?: (mode: 'business' | 'calendar') => void;
  readOnly?: boolean;
  previewMode?: boolean;
  canUndo?: boolean;
  undoLoading?: boolean;
  onUndo?: (() => void) | null;
  baselineMenuOpen?: boolean;
  onBaselineMenuOpenChange?: (open: boolean) => void;
  baselineActiveLabel?: string | null;
  baselineVisible?: boolean;
  baselineRows?: ToolbarBaselineRow[] | null;
  baselineLoading?: boolean | null;
  baselineActiveRequestId?: string | null;
  baselineError?: string | null;
  baselineEmptyLabel?: string | null;
  baselineCreateLabel?: string | null;
  creatingBaselineFromCurrent?: boolean | null;
  deletingBaselineId?: string | null;
  renamingBaselineId?: string | null;
  onCreateBaselineFromCurrent?: (() => void) | null;
  onSelectBaseline?: (baselineId: string) => void;
  onToggleBaselineVisibility?: () => void;
  onHideBaseline?: () => void;
  onDeleteBaseline?: (baselineId: string) => void;
  onRenameBaseline?: (baselineId: string, name: string) => void;
  onRefreshBaselines?: () => void;
  taskListColumnRows?: ToolbarTaskListColumnRow[] | null;
  hiddenTaskListColumns?: string[] | null;
  onToggleTaskListColumn?: (columnId: string) => void;
  onSetAllTaskListColumnsVisible?: (visible: boolean) => void;
  onOpenProjectShift?: (() => void) | null;
  canShiftProject?: boolean;
  templateSelectionActive?: boolean;
  onCreateTemplateFromProject?: (() => void) | null;
  onStartTemplateSelection?: (() => void) | null;
}

function TriStateCheckbox({ checked, indeterminate }: { checked: boolean; indeterminate: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(element) => {
        if (element) {
          element.indeterminate = indeterminate;
        }
      }}
      readOnly
      className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
    />
  );
}

interface BaselineMenuSectionProps {
  activeLabel: string | null;
  baselineVisible: boolean;
  rows: ToolbarBaselineRow[];
  loading: boolean;
  activeRequestId: string | null;
  error: string | null;
  createLabel: string;
  creatingBaselineFromCurrent: boolean;
  deletingBaselineId: string | null;
  renamingBaselineId: string | null;
  onCreateBaselineFromCurrent?: (() => void) | null;
  onSelectBaseline?: (baselineId: string) => void;
  onToggleBaselineVisibility?: (() => void) | null;
  onRequestRenameBaseline?: (baselineId: string) => void;
  onRequestDeleteBaseline?: (baselineId: string) => void;
  onRefreshBaselines?: () => void;
}

function renderBaselineMenuSection({
  activeLabel,
  baselineVisible,
  rows,
  loading,
  activeRequestId,
  error,
  createLabel,
  creatingBaselineFromCurrent,
  deletingBaselineId,
  renamingBaselineId,
  onCreateBaselineFromCurrent,
  onSelectBaseline,
  onToggleBaselineVisibility,
  onRequestRenameBaseline,
  onRequestDeleteBaseline,
  onRefreshBaselines,
}: BaselineMenuSectionProps) {
  const createActionDisabled = !onCreateBaselineFromCurrent || creatingBaselineFromCurrent;
  const hasSelectedBaseline = Boolean(activeLabel?.trim());

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        <DropdownMenuLabel className="p-0 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
          Базовый план
        </DropdownMenuLabel>
        <button
          type="button"
          role="switch"
          aria-checked={hasSelectedBaseline && baselineVisible}
          onClick={() => onToggleBaselineVisibility?.()}
          disabled={!hasSelectedBaseline || !onToggleBaselineVisibility}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-default disabled:opacity-50',
            hasSelectedBaseline && baselineVisible ? 'bg-primary' : 'bg-slate-300',
          )}
          title={
            hasSelectedBaseline
              ? baselineVisible
                ? `Выключить базовый план: ${activeLabel}`
                : `Включить базовый план: ${activeLabel}`
              : 'Сначала выберите базовый план'
          }
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white transition-transform',
              hasSelectedBaseline && baselineVisible ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      <DropdownMenuItem
        onClick={() => void onCreateBaselineFromCurrent?.()}
        disabled={createActionDisabled}
        className="flex cursor-pointer items-center gap-2 text-slate-700"
      >
        <Plus className="h-4 w-4" />
        <span className="text-sm">{creatingBaselineFromCurrent ? `${createLabel}…` : createLabel}</span>
      </DropdownMenuItem>

      <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />

      {loading && !activeRequestId ? (
        <div className="px-2 pb-1">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
            Загрузка базовых планов…
          </div>
        </div>
      ) : error ? (
        <div className="px-2 pb-1">
          <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
          </div>
        </div>
      ) : rows.length > 0 ? (
        <>
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1 px-1 pb-1 last:pb-0">
              <button
                type="button"
                onClick={() => {
                  onSelectBaseline?.(row.id);
                }}
                disabled={!onSelectBaseline || activeRequestId === row.id}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60',
                  row.selected && 'bg-primary/5 text-primary hover:bg-primary/10',
                )}
                title={row.selected ? 'Выбран текущий базовый план' : 'Выбрать базовый план'}
                aria-pressed={row.selected}
              >
                <span className="min-w-0 flex-1 truncate text-sm">{row.label || 'Без названия'}</span>
                {activeRequestId === row.id ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
              </button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onRequestRenameBaseline?.(row.id);
                }}
                disabled={!onRequestRenameBaseline || renamingBaselineId === row.id || deletingBaselineId === row.id}
                className="h-8 w-8 shrink-0 rounded-md p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
                title={renamingBaselineId === row.id ? 'Переименовываем базовый план…' : 'Переименовать базовый план'}
                aria-label={renamingBaselineId === row.id ? 'Переименовываем базовый план…' : 'Переименовать базовый план'}
              >
                {renamingBaselineId === row.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onRequestDeleteBaseline?.(row.id);
                }}
                disabled={!onRequestDeleteBaseline || deletingBaselineId === row.id}
                className="h-8 w-8 shrink-0 rounded-md p-0 text-rose-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                title={deletingBaselineId === row.id ? 'Удаляем базовый план…' : 'Удалить базовый план'}
                aria-label={deletingBaselineId === row.id ? 'Удаляем базовый план…' : 'Удалить базовый план'}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </>
      ) : null}

      {onRefreshBaselines && <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />}

      {onRefreshBaselines ? (
        <DropdownMenuItem onClick={() => void onRefreshBaselines()} className="flex cursor-pointer items-center gap-2 text-slate-700">
          <RefreshCw className="h-4 w-4" />
          <span className="text-sm">Обновить базовые планы</span>
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

export function Toolbar({
  showChatToggle = false,
  isChatOpen = false,
  onToggleChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onExportPdf,
  onExportExcel,
  isExportExcelLoading = false,
  shareStatus = 'idle',
  onCreateShareLink,
  showShareButton = false,
  viewMode: externalViewMode,
  onViewModeChange,
  disableTaskDrag: externalDisableTaskDrag,
  onToggleDisableTaskDrag,
  ganttDayMode = 'calendar',
  onGanttDayModeChange,
  readOnly = false,
  previewMode = false,
  canUndo = false,
  undoLoading = false,
  onUndo = null,
  baselineMenuOpen,
  onBaselineMenuOpenChange,
  baselineActiveLabel = null,
  baselineVisible = false,
  baselineRows = [],
  baselineLoading = false,
  baselineActiveRequestId = null,
  baselineError = null,
  baselineCreateLabel = 'Сохранить текущий график',
  creatingBaselineFromCurrent = false,
  deletingBaselineId = null,
  renamingBaselineId = null,
  onCreateBaselineFromCurrent = null,
  onSelectBaseline,
  onToggleBaselineVisibility,
  onDeleteBaseline,
  onRenameBaseline,
  onRefreshBaselines,
  taskListColumnRows = [],
  hiddenTaskListColumns = [],
  onToggleTaskListColumn,
  onSetAllTaskListColumnsVisible,
  onOpenProjectShift = null,
  canShiftProject = false,
  templateSelectionActive = false,
  onCreateTemplateFromProject = null,
  onStartTemplateSelection = null,
}: ToolbarProps) {
  const [baselineDeleteCandidateId, setBaselineDeleteCandidateId] = useState<string | null>(null);
  const [baselineRenameCandidateId, setBaselineRenameCandidateId] = useState<string | null>(null);
  const [baselineRenameDraft, setBaselineRenameDraft] = useState('');
  const showTaskList = useUIStore((state) => state.showTaskList);
  const showChart = useUIStore((state) => state.showChart);
  const viewMode = useUIStore((state) => state.viewMode);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const disableTaskDrag = externalDisableTaskDrag ?? useUIStore((state) => state.disableTaskDrag);
  const showHistoryPanel = useUIStore((state) => state.showHistoryPanel);
  const setShowTaskList = useUIStore((state) => state.setShowTaskList);
  const setShowChart = useUIStore((state) => state.setShowChart);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setAutoSchedule = useUIStore((state) => state.setAutoSchedule);
  const setHighlightExpiredTasks = useUIStore((state) => state.setHighlightExpiredTasks);
  const setDisableTaskDrag = onToggleDisableTaskDrag ?? useUIStore((state) => state.setDisableTaskDrag);
  const setShowHistoryPanel = useUIStore((state) => state.setShowHistoryPanel);
  const hiddenTaskListColumnSet = new Set(hiddenTaskListColumns ?? []);

  const filterWithoutDeps = useUIStore((state) => state.filterWithoutDeps);
  const filterWithoutParents = useUIStore((state) => state.filterWithoutParents);
  const filterExpired = useUIStore((state) => state.filterExpired);
  const filterSearchText = useUIStore((state) => state.filterSearchText);
  const filterDateFrom = useUIStore((state) => state.filterDateFrom);
  const filterDateTo = useUIStore((state) => state.filterDateTo);
  const hasActiveFilters =
    filterWithoutDeps ||
    filterWithoutParents ||
    filterExpired ||
    filterSearchText.trim().length > 0 ||
    (filterDateFrom && filterDateTo);

  const normalizedBaselineRows = Array.isArray(baselineRows)
    ? baselineRows.map((row) => ({
      id: typeof row?.id === 'string' ? row.id : '',
      label: typeof row?.label === 'string' ? row.label : '',
      selected: Boolean(row?.selected),
    }))
    : [];
  const normalizedBaselineError = typeof baselineError === 'string' && baselineError.trim().length > 0
    ? baselineError
    : null;
  const normalizedBaselineCreateLabel = typeof baselineCreateLabel === 'string' && baselineCreateLabel.trim().length > 0
    ? baselineCreateLabel
    : 'Сохранить текущий график';
  const normalizedBaselineActiveLabel = typeof baselineActiveLabel === 'string' && baselineActiveLabel.trim().length > 0
    ? baselineActiveLabel
    : null;
  const baselineDeleteCandidate = baselineDeleteCandidateId
    ? normalizedBaselineRows.find((row) => row.id === baselineDeleteCandidateId) ?? null
    : null;
  const baselineRenameCandidate = baselineRenameCandidateId
    ? normalizedBaselineRows.find((row) => row.id === baselineRenameCandidateId) ?? null
    : null;

  const currentViewMode = externalViewMode ?? viewMode;
  const handleViewModeChange = onViewModeChange ?? setViewMode;
  const mutationLocked = readOnly || previewMode;
  const effectiveDisableTaskDrag = mutationLocked || disableTaskDrag;
  const canChangeGanttDayMode = !mutationLocked && Boolean(onGanttDayModeChange);
  const canTriggerUndo = !mutationLocked && canUndo && Boolean(onUndo) && !undoLoading;
  const hasShareMenuActions = Boolean(onExportPdf || onExportExcel || (showShareButton && onCreateShareLink));
  const hasTemplateAction = Boolean(onStartTemplateSelection);
  const hasHiddenTaskListColumns = hiddenTaskListColumnSet.size > 0;
  const visibleTaskListColumnCount = (taskListColumnRows ?? []).filter((column) => !hiddenTaskListColumnSet.has(column.id)).length;
  const allTaskListColumnsVisible = taskListColumnRows?.length ? visibleTaskListColumnCount === taskListColumnRows.length : true;
  const someTaskListColumnsVisible = visibleTaskListColumnCount > 0;

  const handleToggleDragLock = () => {
    if (mutationLocked) {
      return;
    }

    setDisableTaskDrag(!disableTaskDrag);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.innerWidth < 768 && showTaskList && showChart) {
      setShowTaskList(false);
    }
  }, [showChart, showTaskList, setShowTaskList]);

  const handleToggleTaskList = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (!showTaskList) {
        setShowTaskList(true);
        setShowChart(false);
      }
      return;
    }

    if (showTaskList && !showChart) {
      return;
    }

    setShowTaskList(!showTaskList);
  };

  const handleToggleChart = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (!showChart) {
        setShowChart(true);
        setShowTaskList(false);
      }
      return;
    }

    if (showChart && !showTaskList) {
      return;
    }

    setShowChart(!showChart);
  };

  const actionButtonClassName =
    'h-8 rounded-md border border-transparent bg-transparent px-2.5 text-[12px] font-medium text-slate-600 hover:border-primary hover:text-primary';

  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-2 bg-[#f4f5f7] px-0 py-2">
      <div className="inline-flex rounded-md">
        <button
          type="button"
          onClick={handleToggleTaskList}
          className={cn(
            'relative flex h-8 items-center gap-1.5 rounded-l-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none',
            showTaskList
              ? 'z-10 border-primary bg-primary/5 text-primary [@media(any-hover:hover)]:hover:bg-primary/10'
              : 'border-slate-300 text-slate-600 [@media(any-hover:hover)]:hover:border-primary [@media(any-hover:hover)]:hover:text-primary',
          )}
        >
          <Rows3 className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Задачи</span>
        </button>
        <button
          type="button"
          onClick={handleToggleChart}
          className={cn(
            'relative ml-[-1px] flex h-8 items-center gap-1.5 rounded-r-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none',
            showChart
              ? 'z-10 border-primary bg-primary/5 text-primary [@media(any-hover:hover)]:hover:bg-primary/10'
              : 'border-slate-300 text-slate-600 [@media(any-hover:hover)]:hover:border-primary [@media(any-hover:hover)]:hover:text-primary',
          )}
        >
          <ChartNoAxesGantt className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Гант</span>
        </button>
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onCollapseAll}
        aria-label="Свернуть все"
        title="Свернуть все родительские задачи"
        className={cn(actionButtonClassName, 'hidden lg:flex')}
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onExpandAll}
        aria-label="Развернуть все"
        title="Развернуть все родительские задачи"
        className={cn(actionButtonClassName, 'hidden lg:flex')}
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onScrollToToday}
        className={cn(actionButtonClassName, 'hidden sm:flex')}
      >
        <FlagTriangleRight className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Сегодня</span>
      </Button>

      {taskListColumnRows && taskListColumnRows.length > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant={hasHiddenTaskListColumns ? 'secondary' : 'ghost'}
              className={cn(
                actionButtonClassName,
                hasHiddenTaskListColumns && 'border-primary text-primary bg-primary/5 hover:bg-primary/10',
                'hidden gap-1.5 lg:flex focus-visible:ring-0 focus-visible:ring-offset-0',
              )}
              title="Настроить столбцы списка задач"
            >
              <Columns3Cog className="h-3.5 w-3.5" />
              <span className="hidden md:inline text-xs">Столбцы</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
              Столбцы задач
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onSetAllTaskListColumnsVisible?.(!allTaskListColumnsVisible);
              }}
              className="flex cursor-pointer items-center gap-2"
            >
              <TriStateCheckbox
                checked={allTaskListColumnsVisible}
                indeterminate={someTaskListColumnsVisible && !allTaskListColumnsVisible}
              />
              <span className="text-sm">Выбрать всё</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
            {taskListColumnRows.map((column) => {
              const checked = !hiddenTaskListColumnSet.has(column.id);
              return (
                <DropdownMenuItem
                  key={column.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    onToggleTaskListColumn?.(column.id);
                  }}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
                  />
                  <span className="text-sm">{column.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu open={baselineMenuOpen} onOpenChange={onBaselineMenuOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              actionButtonClassName,
              'hidden h-8 shrink-0 gap-1.5 px-2.5 sm:inline-flex focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-transparent data-[state=open]:text-slate-600',
              normalizedBaselineActiveLabel && baselineVisible
                ? 'border-primary bg-primary/5 text-primary hover:bg-primary/10 data-[state=open]:bg-primary/10 data-[state=open]:text-primary'
                : 'data-[state=open]:bg-transparent',
            )}
            title={normalizedBaselineActiveLabel ? `Базовый план: ${normalizedBaselineActiveLabel}` : 'Меню базовых планов'}
            aria-label={normalizedBaselineActiveLabel ? `Базовый план: ${normalizedBaselineActiveLabel}` : 'Меню базовых планов'}
            aria-pressed={Boolean(normalizedBaselineActiveLabel && baselineVisible)}
          >
            <Layers3 className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-xs">Базовый</span>
            <ChevronDown className="h-3 w-3 text-current/70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {renderBaselineMenuSection({
            activeLabel: normalizedBaselineActiveLabel,
            baselineVisible,
            rows: normalizedBaselineRows,
            loading: Boolean(baselineLoading),
            activeRequestId: baselineActiveRequestId,
            error: normalizedBaselineError,
            createLabel: normalizedBaselineCreateLabel,
            creatingBaselineFromCurrent: Boolean(creatingBaselineFromCurrent),
            deletingBaselineId,
            renamingBaselineId,
            onCreateBaselineFromCurrent,
            onSelectBaseline,
            onToggleBaselineVisibility,
            onRequestRenameBaseline: (baselineId) => {
              const row = normalizedBaselineRows.find((candidate) => candidate.id === baselineId);
              setBaselineRenameCandidateId(baselineId);
              setBaselineRenameDraft(row?.label ?? '');
            },
            onRequestDeleteBaseline: setBaselineDeleteCandidateId,
            onRefreshBaselines,
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasTemplateAction && (
        <Button
          size="sm"
          variant={templateSelectionActive ? 'secondary' : 'ghost'}
          onClick={() => { void onStartTemplateSelection?.(); }}
          className={cn(
            actionButtonClassName,
            templateSelectionActive && 'border-primary text-primary bg-primary/5 hover:bg-primary/10',
            'hidden gap-1.5 sm:flex focus-visible:ring-0 focus-visible:ring-offset-0',
          )}
          title={templateSelectionActive ? 'Выбор блока для шаблона' : 'Сохранить шаблон'}
        >
          <Layers3 className="h-3.5 w-3.5" />
          <span className="text-xs">Сохранить шаблон</span>
        </Button>
      )}

      {hasShareMenuActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                actionButtonClassName,
                'hidden gap-1.5 sm:flex focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:text-slate-600',
              )}
              title={
                isExportExcelLoading
                  ? 'Генерируем Excel...'
                  : shareStatus === 'creating'
                    ? 'Создаём ссылку...'
                    : shareStatus === 'copied'
                      ? 'Ссылка скопирована'
                      : shareStatus === 'error'
                        ? 'Ошибка ссылки'
                        : 'Поделиться'
              }
            >
              <span className="text-xs">
                {isExportExcelLoading
                  ? 'Генерируем Excel...'
                  : shareStatus === 'creating'
                    ? 'Создаём ссылку...'
                    : 'Поделиться'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {showShareButton && onCreateShareLink && (
              <>
                <DropdownMenuItem
                  onClick={() => void onCreateShareLink()}
                  disabled={shareStatus === 'creating'}
                  className="flex cursor-pointer items-center gap-2"
                >
                  {shareStatus === 'copied' ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                  <span className="text-sm">
                    {shareStatus === 'creating'
                      ? 'Создаём ссылку...'
                      : shareStatus === 'copied'
                        ? 'Скопировано'
                        : shareStatus === 'error'
                          ? 'Ошибка ссылки'
                          : 'Отправить ссылку...'}
                  </span>
                </DropdownMenuItem>
              </>
            )}
            {onExportPdf && (
              <DropdownMenuItem
                onClick={onExportPdf}
                className="flex cursor-pointer items-center gap-2"
              >
                <FileDown className="h-4 w-4" />
                <span className="text-sm">PDF / Печать</span>
              </DropdownMenuItem>
            )}
            {onExportExcel && (
              <DropdownMenuItem
                onClick={onExportExcel}
                disabled={isExportExcelLoading}
                className="flex cursor-pointer items-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm">{isExportExcelLoading ? 'Генерируем Excel...' : 'Excel'}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex-1" />

      <Button
        size="sm"
        variant="ghost"
        onClick={() => onUndo?.()}
        disabled={!canTriggerUndo}
        className={cn(
          'hidden h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-slate-600 hover:border-primary hover:text-primary sm:flex',
          !canTriggerUndo && 'cursor-not-allowed opacity-50',
        )}
        title={undoLoading ? 'Отменяем последнее действие...' : 'Отменить последнее действие (Ctrl+Z)'}
        aria-label={undoLoading ? 'Отменяем последнее действие' : 'Отменить последнее действие'}
      >
        {undoLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowHistoryPanel(!showHistoryPanel)}
        aria-pressed={showHistoryPanel}
        className={cn(
          'hidden h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-slate-600 hover:border-primary hover:text-primary sm:flex',
          showHistoryPanel && 'border-primary bg-primary/5 text-primary hover:bg-primary/10',
        )}
        title="Показать историю изменений"
      >
        <div className="relative">
          <History className="h-3.5 w-3.5" />
          {previewMode && (
            <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
          )}
        </div>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={handleToggleDragLock}
        aria-pressed={effectiveDisableTaskDrag}
        disabled={mutationLocked}
        className={cn(
          actionButtonClassName,
          effectiveDisableTaskDrag && 'border-primary text-primary bg-primary/5 hover:bg-primary/10',
          mutationLocked && 'cursor-not-allowed opacity-60',
          'hidden lg:flex',
        )}
        title={
          previewMode
            ? 'Просмотр версии доступен только для чтения'
            : readOnly
              ? 'Проект в архиве доступен только для чтения'
              : disableTaskDrag
                ? 'Разблокировать перемещение задач'
                : 'Заблокировать перемещение задач'
        }
      >
        {effectiveDisableTaskDrag ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      </Button>

      <FilterPopup>
        <Button
          size="sm"
          variant={hasActiveFilters ? 'secondary' : 'ghost'}
          className={cn(
            actionButtonClassName,
            hasActiveFilters && 'border-primary text-primary bg-primary/5 hover:bg-primary/10',
            'hidden lg:flex',
          )}
          title="Показать фильтры задач"
        >
          <div className="relative">
            <Funnel className="h-3.5 w-3.5" />
            {hasActiveFilters && (
              <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </div>
        </Button>
      </FilterPopup>

      <div className="inline-flex rounded-md">
        {(['day', 'week', 'month'] as const).map((nextMode, index) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => handleViewModeChange(nextMode)}
            className={cn(
              'hidden h-8 items-center px-3 text-xs font-medium transition-colors focus-visible:outline-none border sm:flex',
              index === 0 && 'rounded-l-md',
              index === 2 && 'rounded-r-md',
              currentViewMode === nextMode
                ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
                : 'border-slate-300 text-slate-600 hover:border-primary hover:text-primary',
            )}
          >
            {nextMode === 'day' && (
              <>
                <span className="hidden sm:inline">День</span>
                <span className="sm:hidden">Д</span>
              </>
            )}
            {nextMode === 'week' && (
              <>
                <span className="hidden sm:inline">Неделя</span>
                <span className="sm:hidden">Н</span>
              </>
            )}
            {nextMode === 'month' && (
              <>
                <span className="hidden sm:inline">Месяц</span>
                <span className="sm:hidden">М</span>
              </>
            )}
          </button>
        ))}
      </div>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-transparent px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none sm:hidden"
            title="Масштаб"
          >
            <span>{currentViewMode === 'day' ? 'День' : currentViewMode === 'week' ? 'Неделя' : 'Месяц'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 sm:hidden">
          {(['day', 'week', 'month'] as const).map((nextMode) => (
            <DropdownMenuItem
              key={nextMode}
              onClick={() => handleViewModeChange(nextMode)}
              className={cn(
                'flex cursor-pointer items-center gap-2',
                currentViewMode === nextMode && 'bg-primary/5 text-primary',
              )}
            >
              <span className="text-sm">{nextMode === 'day' ? 'День' : nextMode === 'week' ? 'Неделя' : 'Месяц'}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center rounded-md border border-slate-300 bg-transparent px-2 text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none lg:hidden"
            title="Ещё"
            aria-label="Ещё"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={onCollapseAll}
            className="flex cursor-pointer items-center gap-2"
          >
            <ChevronsDownUp className="h-4 w-4" />
            <span className="text-sm">Свернуть все</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onExpandAll}
            className="flex cursor-pointer items-center gap-2"
          >
            <ChevronsUpDown className="h-4 w-4" />
            <span className="text-sm">Развернуть все</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onScrollToToday}
            className="flex cursor-pointer items-center gap-2"
          >
            <FlagTriangleRight className="h-4 w-4" />
            <span className="text-sm">Сегодня</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />

          {renderBaselineMenuSection({
            activeLabel: normalizedBaselineActiveLabel,
            baselineVisible,
            rows: normalizedBaselineRows,
            loading: Boolean(baselineLoading),
            activeRequestId: baselineActiveRequestId,
            error: normalizedBaselineError,
            createLabel: normalizedBaselineCreateLabel,
            creatingBaselineFromCurrent: Boolean(creatingBaselineFromCurrent),
            deletingBaselineId,
            renamingBaselineId,
            onCreateBaselineFromCurrent,
            onSelectBaseline,
            onToggleBaselineVisibility,
            onRequestRenameBaseline: (baselineId) => {
              const row = normalizedBaselineRows.find((candidate) => candidate.id === baselineId);
              setBaselineRenameCandidateId(baselineId);
              setBaselineRenameDraft(row?.label ?? '');
            },
            onRequestDeleteBaseline: setBaselineDeleteCandidateId,
            onRefreshBaselines,
          })}

          <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
          {showShareButton && onCreateShareLink && (
            <>
              <DropdownMenuItem
                onClick={() => void onCreateShareLink()}
                disabled={shareStatus === 'creating'}
                className="flex cursor-pointer items-center gap-2"
              >
                {shareStatus === 'copied' ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                <span className="text-sm">
                  {shareStatus === 'copied' ? 'Скопировано' : 'Отправить ссылку...'}
                </span>
              </DropdownMenuItem>
            </>
          )}
          {onOpenProjectShift && (
            <DropdownMenuItem
              onClick={() => onOpenProjectShift()}
              disabled={!canShiftProject}
              className="flex cursor-pointer items-center gap-2"
            >
              <CalendarClock className="h-4 w-4" />
              <span className="text-sm">Сдвинуть проект ...</span>
            </DropdownMenuItem>
          )}
          {onExportPdf && (
            <DropdownMenuItem
              onClick={onExportPdf}
              className="flex cursor-pointer items-center gap-2"
            >
              <FileDown className="h-4 w-4" />
              <span className="text-sm">PDF / Печать</span>
            </DropdownMenuItem>
          )}
          {onExportExcel && (
            <DropdownMenuItem
              onClick={onExportExcel}
              disabled={isExportExcelLoading}
              className="flex cursor-pointer items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="text-sm">{isExportExcelLoading ? 'Генерируем Excel...' : 'Excel'}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
          {taskListColumnRows && taskListColumnRows.length > 0 && (
            <>
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
                Столбцы задач
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  onSetAllTaskListColumnsVisible?.(!allTaskListColumnsVisible);
                }}
                className="flex cursor-pointer items-center gap-2"
              >
                <TriStateCheckbox
                  checked={allTaskListColumnsVisible}
                  indeterminate={someTaskListColumnsVisible && !allTaskListColumnsVisible}
                />
                <span className="text-sm">Выбрать всё</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
              {taskListColumnRows.map((column) => {
                const checked = !hiddenTaskListColumnSet.has(column.id);
                return (
                  <DropdownMenuItem
                    key={column.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      onToggleTaskListColumn?.(column.id);
                    }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
                    />
                    <span className="text-sm">{column.label}</span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
            </>
          )}
          <DropdownMenuItem
            onClick={() => onUndo?.()}
            disabled={!canTriggerUndo}
            className="flex cursor-pointer items-center gap-2"
          >
            <Undo2 className="h-4 w-4" />
            <span className="text-sm">{undoLoading ? 'Отменяем...' : 'Отменить'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className="flex cursor-pointer items-center gap-2"
          >
            <div className="relative">
              <History className="h-4 w-4" />
              {previewMode && (
                <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
              )}
            </div>
            <span className="text-sm">История</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleToggleDragLock}
            disabled={mutationLocked}
            className="flex cursor-pointer items-center gap-2"
          >
            {effectiveDisableTaskDrag ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            <span className="text-sm">
              {previewMode ? 'Просмотр версии' : readOnly ? 'Только чтение' : disableTaskDrag ? 'Разблокировать' : 'Заблокировать'}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setHighlightExpiredTasks(!highlightExpiredTasks);
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={highlightExpiredTasks}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Просроченные</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canChangeGanttDayMode}
            onSelect={(event) => {
              event.preventDefault();
              onGanttDayModeChange?.(ganttDayMode === 'business' ? 'calendar' : 'business');
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={ganttDayMode === 'business'}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Рабочие дни</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hidden lg:flex h-8 items-center rounded-md border border-slate-300 bg-transparent px-2 text-slate-600 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none"
            title="Дополнительные параметры"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {onOpenProjectShift && (
            <>
              <DropdownMenuItem
                onClick={() => onOpenProjectShift()}
                disabled={!canShiftProject}
                className="flex cursor-pointer items-center gap-2"
              >
                <CalendarClock className="h-4 w-4" />
                <span className="text-sm">Сдвинуть проект ...</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
            </>
          )}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setHighlightExpiredTasks(!highlightExpiredTasks);
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={highlightExpiredTasks}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Просроченные</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canChangeGanttDayMode}
            onSelect={(event) => {
              event.preventDefault();
              onGanttDayModeChange?.(ganttDayMode === 'business' ? 'calendar' : 'business');
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={ganttDayMode === 'business'}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Рабочие дни</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FilterPopup>
        <Button
          size="sm"
          variant={hasActiveFilters ? 'secondary' : 'ghost'}
          className={cn(
            'hidden h-8 w-8 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-slate-600 hover:border-primary hover:text-primary lg:hidden',
            hasActiveFilters && 'border-primary bg-primary/5 text-primary hover:bg-primary/10',
          )}
          title="Показать фильтры задач"
        >
          <div className="relative">
            <Funnel className="h-3.5 w-3.5" />
            {hasActiveFilters && (
              <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </div>
        </Button>
      </FilterPopup>

      {showChatToggle && onToggleChat && (
        <Button
          size="sm"
          onClick={onToggleChat}
          aria-pressed={isChatOpen}
          className={cn(
            'h-8 rounded-md px-2 text-xs font-medium focus-visible:outline-none',
            isChatOpen
              ? 'bg-primary border-2 border-primary/30 text-primary-foreground shadow-inner'
              : 'bg-primary border-2 border-transparent text-primary-foreground shadow-sm hover:bg-primary/90',
          )}
          title={isChatOpen ? 'Скрыть Ассистент' : 'Показать Ассистент'}
        >
          <Bot className="h-3.5 w-3.5 sm:hidden" />
          {isChatOpen ? (
            <X className="hidden h-3.5 w-3.5 sm:block" />
          ) : (
            <Bot className="hidden h-3.5 w-3.5 sm:block" />
          )}
          <span className="ml-1 hidden sm:inline">Ассистент</span>
        </Button>
      )}

      {baselineDeleteCandidate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBaselineDeleteCandidateId(null);
            }
          }}
        >
          <form
            className="w-[420px] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (deletingBaselineId === baselineDeleteCandidate.id) {
                return;
              }
              onDeleteBaseline?.(baselineDeleteCandidate.id);
              setBaselineDeleteCandidateId(null);
            }}
          >
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-6 w-6 shrink-0 text-amber-500" />
              <h2 className="text-lg font-semibold text-slate-800">Удалить базовый план?</h2>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              План <span className="font-semibold text-slate-800">{baselineDeleteCandidate.label || 'Без названия'}</span> будет удалён без возможности восстановления.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBaselineDeleteCandidateId(null)}>
                Отмена
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletingBaselineId === baselineDeleteCandidate.id}
              >
                {deletingBaselineId === baselineDeleteCandidate.id ? 'Удаление…' : 'Удалить'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {baselineRenameCandidate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBaselineRenameCandidateId(null);
              setBaselineRenameDraft('');
            }
          }}
        >
          <form
            className="w-[420px] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (baselineRenameDraft.trim().length === 0 || renamingBaselineId === baselineRenameCandidate.id) {
                return;
              }
              onRenameBaseline?.(baselineRenameCandidate.id, baselineRenameDraft.trim());
              setBaselineRenameCandidateId(null);
              setBaselineRenameDraft('');
            }}
          >
            <div className="flex items-center gap-3">
              <Pencil className="h-5 w-5 shrink-0 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-800">Переименовать базовый план</h2>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm text-slate-600">Новое название</p>
              <Input
                value={baselineRenameDraft}
                onChange={(event) => setBaselineRenameDraft(event.target.value)}
                autoFocus
                disabled={renamingBaselineId === baselineRenameCandidate.id}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBaselineRenameCandidateId(null);
                  setBaselineRenameDraft('');
                }}
                disabled={renamingBaselineId === baselineRenameCandidate.id}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={baselineRenameDraft.trim().length === 0 || renamingBaselineId === baselineRenameCandidate.id}
              >
                {renamingBaselineId === baselineRenameCandidate.id ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
