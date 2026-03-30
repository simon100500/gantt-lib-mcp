import {
  ChartNoAxesGantt,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FlagTriangleRight,
  Funnel,
  Link,
  Rows3,
  Lock,
  LockOpen,
  Sparkles,
} from 'lucide-react';

import { useEffect } from 'react';

import { Button } from '../ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  showShareButton?: boolean;
  viewMode?: 'day' | 'week' | 'month';
  onViewModeChange?: (viewMode: 'day' | 'week' | 'month') => void;
  disableTaskDrag?: boolean;
  onToggleDisableTaskDrag?: (enabled: boolean) => void;
  ganttDayMode?: 'business' | 'calendar';
  onGanttDayModeChange?: (mode: 'business' | 'calendar') => void;
}

export function Toolbar({
  showChatToggle = false,
  isChatOpen = false,
  onToggleChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  shareStatus = 'idle',
  onCreateShareLink,
  showShareButton = false,
  viewMode: externalViewMode,
  onViewModeChange,
  disableTaskDrag: externalDisableTaskDrag,
  onToggleDisableTaskDrag,
  ganttDayMode = 'business',
  onGanttDayModeChange,
}: ToolbarProps) {
  const showTaskList = useUIStore((state) => state.showTaskList);
  const showChart = useUIStore((state) => state.showChart);
  const viewMode = useUIStore((state) => state.viewMode);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const disableTaskDrag = externalDisableTaskDrag ?? useUIStore((state) => state.disableTaskDrag);
  const setShowTaskList = useUIStore((state) => state.setShowTaskList);
  const setShowChart = useUIStore((state) => state.setShowChart);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setAutoSchedule = useUIStore((state) => state.setAutoSchedule);
  const setHighlightExpiredTasks = useUIStore((state) => state.setHighlightExpiredTasks);
  const setDisableTaskDrag = onToggleDisableTaskDrag ?? useUIStore((state) => state.setDisableTaskDrag);

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

  // На мобильном (< 768px) обеспечиваем что только один режим включен
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && showTaskList && showChart) {
      // Если оба включены на мобильном - оставляем только гант
      setShowTaskList(false);
    }
  }, [showTaskList, showChart, setShowTaskList]);

  // Двойной toggle: нельзя скрыть оба элемента одновременно
  // На мобильном (< 768px) показываем только один из двух
  const handleToggleTaskList = () => {
    if (!showTaskList) {
      // Список скрыт - показываем его
      setShowTaskList(true);
      // На мобильном скрываем гант
      if (window.innerWidth < 768) {
        setShowChart(false);
      }
    } else if (showChart && window.innerWidth >= 768) {
      // Список виден и календарь тоже (только на десктопе) - скрываем список
      setShowTaskList(false);
    } else {
      // Список виден - скрываем его, показываем гант
      setShowTaskList(false);
      setShowChart(true);
    }
  };

  const handleToggleChart = () => {
    if (!showChart) {
      // Календарь скрыт - показываем его
      setShowChart(true);
      // На мобильном скрываем задачи
      if (window.innerWidth < 768) {
        setShowTaskList(false);
      }
    } else if (showTaskList && window.innerWidth >= 768) {
      // Календарь виден и список тоже (только на десктопе) - скрываем календарь
      setShowChart(false);
    } else {
      // Календарь виден - скрываем его, показываем задачи
      setShowChart(false);
      setShowTaskList(true);
    }
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
            'flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors focus-visible:outline-none rounded-l-md border-r',
            showTaskList
              ? 'border-y border-l border-primary text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-y border-l border-slate-300 text-slate-600 hover:border-primary hover:text-primary',
          )}
        >
          <Rows3 className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Задачи</span>
        </button>
        <button
          type="button"
          onClick={handleToggleChart}
          className={cn(
            'flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors focus-visible:outline-none rounded-r-md border',
            showChart
              ? 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-slate-300 text-slate-600 hover:border-primary hover:text-primary',
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
        title="Свернуть все родительские задачи"
        className={cn(actionButtonClassName, 'hidden lg:flex')}
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
        <span className="hidden xl:inline text-xs">Свернуть</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onExpandAll}
        title="Развернуть все родительские задачи"
        className={cn(actionButtonClassName, 'hidden lg:flex')}
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
        <span className="hidden xl:inline text-xs">Развернуть</span>
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

      {showShareButton && onCreateShareLink && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onCreateShareLink()}
          disabled={shareStatus === 'creating'}
          className={cn(actionButtonClassName, 'hidden lg:flex')}
          title={
            shareStatus === 'creating'
              ? 'Создаём ссылку...'
              : shareStatus === 'copied'
                ? 'Ссылка скопирована'
                : shareStatus === 'error'
                  ? 'Ошибка ссылки'
                  : 'Поделиться'
          }
        >
          {shareStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Link className="h-3.5 w-3.5" />}
          <span className="hidden md:inline text-xs">{shareStatus === 'copied' ? 'Скопировано' : 'Поделиться'}</span>
        </Button>
      )}

      <div className="flex-1" />

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDisableTaskDrag(!disableTaskDrag)}
        aria-pressed={disableTaskDrag}
        className={cn(
          actionButtonClassName,
          disableTaskDrag && 'border-primary text-primary bg-primary/5 hover:bg-primary/10',
          'hidden lg:flex',
        )}
        title={disableTaskDrag ? 'Разблокировать перемещение задач' : 'Заблокировать перемещение задач'}
      >
        {disableTaskDrag ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
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
              'flex h-8 items-center px-3 text-xs font-medium transition-colors focus-visible:outline-none border',
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

      <DropdownMenu>
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
          {showShareButton && onCreateShareLink && (
            <DropdownMenuItem
              onClick={() => void onCreateShareLink()}
              disabled={shareStatus === 'creating'}
              className="flex cursor-pointer items-center gap-2"
            >
              {shareStatus === 'copied' ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
              <span className="text-sm">
                {shareStatus === 'copied' ? 'Скопировано' : 'Поделиться'}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setDisableTaskDrag(!disableTaskDrag)}
            className="flex cursor-pointer items-center gap-2"
          >
            {disableTaskDrag ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            <span className="text-sm">{disableTaskDrag ? 'Разблокировать' : 'Заблокировать'}</span>
          </DropdownMenuItem>
          <FilterPopup>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="flex cursor-pointer items-center gap-2"
            >
              <div className="relative">
                <Funnel className="h-4 w-4" />
                {hasActiveFilters && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
                )}
              </div>
              <span className="text-sm">Фильтры</span>
            </DropdownMenuItem>
          </FilterPopup>
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
            disabled={!onGanttDayModeChange}
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

      <DropdownMenu>
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
            disabled={!onGanttDayModeChange}
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
          title={isChatOpen ? 'Скрыть AI ассистента' : 'Показать AI ассистента'}
        >
          <Sparkles className={cn('h-3.5 w-3.5', isChatOpen && 'fill-primary-foreground/20')} />
          <span className="hidden md:inline lg:inline ml-1">AI ассистент</span>
        </Button>
      )}
    </div>
  );
}
