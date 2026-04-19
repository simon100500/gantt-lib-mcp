import {
  Bot,
  ChartNoAxesGantt,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FileDown,
  FileSpreadsheet,
  FlagTriangleRight,
  Funnel,
  History,
  Link,
  Rows3,
  Lock,
  LockOpen,
} from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '../ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '@/lib/utils';
import { useUIStore } from '../../stores/useUIStore.ts';
import { FilterPopup } from '../FilterPopup';

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
}: ToolbarProps) {
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

  const filterWithoutDeps = useUIStore((state) => state.filterWithoutDeps);
  const filterExpired = useUIStore((state) => state.filterExpired);
  const filterSearchText = useUIStore((state) => state.filterSearchText);
  const filterDateFrom = useUIStore((state) => state.filterDateFrom);
  const filterDateTo = useUIStore((state) => state.filterDateTo);
  const hasActiveFilters =
    filterWithoutDeps ||
    filterExpired ||
    filterSearchText.trim().length > 0 ||
    (filterDateFrom && filterDateTo);

  const currentViewMode = externalViewMode ?? viewMode;
  const handleViewModeChange = onViewModeChange ?? setViewMode;
  const mutationLocked = readOnly || previewMode;
  const effectiveDisableTaskDrag = mutationLocked || disableTaskDrag;
  const canChangeGanttDayMode = !mutationLocked && Boolean(onGanttDayModeChange);
  const hasShareMenuActions = Boolean(onExportPdf || onExportExcel || (showShareButton && onCreateShareLink));
  const hasExportActions = Boolean(onExportPdf || onExportExcel);

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
                          : 'Отправить ссылку'}
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
          <span className="hidden md:inline text-xs">Фильтры</span>
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
            <span>{currentViewMode === 'day' ? 'День' : currentViewMode === 'week' ? 'Нед.' : 'Мес.'}</span>
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
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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
          {showShareButton && onCreateShareLink && (
            <>
              <DropdownMenuItem
                onClick={() => void onCreateShareLink()}
                disabled={shareStatus === 'creating'}
                className="flex cursor-pointer items-center gap-2"
              >
                {shareStatus === 'copied' ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                <span className="text-sm">
                  {shareStatus === 'copied' ? 'Скопировано' : 'Отправить ссылку'}
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
          <DropdownMenuSeparator className="mx-1 my-1 h-0 border-0 border-t border-slate-200 bg-transparent" />
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
              setAutoSchedule(!autoSchedule);
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={autoSchedule}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Закрепить связи</span>
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
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setAutoSchedule(!autoSchedule);
            }}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="checkbox"
              checked={autoSchedule}
              readOnly
              className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
            />
            <span className="text-sm">Закрепить связи</span>
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
            'h-8 rounded-md px-2 text-xs font-medium transition-all focus-visible:outline-none',
            isChatOpen
              ? 'bg-primary border-2 border-primary/30 text-primary-foreground shadow-inner'
              : 'bg-primary border-2 border-transparent text-primary-foreground shadow-sm hover:bg-primary/90',
          )}
          title={isChatOpen ? 'Скрыть Ассистент' : 'Показать Ассистент'}
        >
          <Bot className={cn('h-3.5 w-3.5')} />
          <span className="ml-1 hidden sm:inline">Ассистент</span>
        </Button>
      )}
    </div>
  );
}
