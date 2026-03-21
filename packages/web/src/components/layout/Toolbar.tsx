import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FlagTriangleRight,
  Funnel,
  Link,
  ListIndentDecrease,
  ListIndentIncrease,
  Lock,
  LockOpen,
  Sparkles,
} from 'lucide-react';

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
}: ToolbarProps) {
  const showTaskList = useUIStore((state) => state.showTaskList);
  const viewMode = useUIStore((state) => state.viewMode);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const disableTaskDrag = useUIStore((state) => state.disableTaskDrag);
  const setShowTaskList = useUIStore((state) => state.setShowTaskList);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setAutoSchedule = useUIStore((state) => state.setAutoSchedule);
  const setHighlightExpiredTasks = useUIStore((state) => state.setHighlightExpiredTasks);
  const setDisableTaskDrag = useUIStore((state) => state.setDisableTaskDrag);

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
  const actionButtonClassName =
    'h-8 rounded-md border border-transparent bg-transparent px-2.5 text-[12px] font-medium text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900';

  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-2 bg-[#f4f5f7] px-0 py-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowTaskList(!showTaskList)}
        aria-pressed={showTaskList}
        className={cn(
          actionButtonClassName,
          showTaskList && 'border-slate-300 bg-white text-slate-900 shadow-sm',
        )}
      >
        {showTaskList ? <ListIndentDecrease className="h-3.5 w-3.5" /> : <ListIndentIncrease className="h-3.5 w-3.5" />}
        <span className="hidden md:inline text-xs">Список задач</span>
      </Button>

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
        className={actionButtonClassName}
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
          disableTaskDrag && 'border-slate-300 bg-white text-slate-900 shadow-sm',
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
            hasActiveFilters && 'border-slate-300 bg-white text-slate-900 shadow-sm',
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

      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        {(['day', 'week', 'month'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => handleViewModeChange(nextMode)}
            className={cn(
              'flex h-8 items-center px-3 text-xs font-semibold transition-colors focus-visible:outline-none',
              nextMode !== 'month' && 'border-r border-slate-200',
              currentViewMode === nextMode
                ? 'bg-[#dfe1e6] text-slate-900'
                : 'bg-white text-slate-600 hover:bg-slate-50',
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
            className="flex h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none lg:hidden"
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
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hidden lg:flex h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none"
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
        </DropdownMenuContent>
      </DropdownMenu>

      {showChatToggle && onToggleChat && (
        <Button
          size="sm"
          onClick={onToggleChat}
          aria-pressed={isChatOpen}
          className={cn(
            'h-8 gap-1.5 rounded-md px-3 text-xs font-medium transition-all focus-visible:outline-none',
            isChatOpen
              ? 'bg-primary border-2 border-primary/30 text-primary-foreground shadow-inner'
              : 'bg-primary border-2 border-transparent text-primary-foreground shadow-sm hover:bg-primary/90',
          )}
          title={isChatOpen ? 'Скрыть AI ассистента' : 'Показать AI ассистента'}
        >
          <Sparkles className={cn('h-3.5 w-3.5', isChatOpen && 'fill-primary-foreground/20')} />
          <span className="hidden sm:inline">AI ассистент</span>
          <span className="sm:hidden">AI</span>
        </Button>
      )}
    </div>
  );
}
