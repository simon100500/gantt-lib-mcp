import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FlagTriangleRight,
  Funnel,
  Link,
  PanelRightClose,
  PanelRightOpen,
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
import { useTaskFilter } from '../../hooks/useTaskFilter';

interface ToolbarProps {
  showChatToggle?: boolean;
  onOpenChat?: () => void;
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
  onOpenChat,
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
  const validationErrors = useUIStore((state) => state.validationErrors);
  const setShowTaskList = useUIStore((state) => state.setShowTaskList);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setAutoSchedule = useUIStore((state) => state.setAutoSchedule);
  const setHighlightExpiredTasks = useUIStore((state) => state.setHighlightExpiredTasks);

  // Filter state
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

  // Используем переданный viewMode если есть, иначе из store
  const currentViewMode = externalViewMode ?? viewMode;
  const handleViewModeChange = onViewModeChange ?? setViewMode;

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <Button
        size="sm"
        variant={showTaskList ? 'secondary' : 'ghost'}
        onClick={() => setShowTaskList(!showTaskList)}
        aria-pressed={showTaskList}
        className="h-7 gap-1.5"
      >
        {showTaskList ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
        <span className="hidden md:inline text-xs">Список задач</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onCollapseAll}
        title="Свернуть все родительские задачи"
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
        <span className="hidden xl:inline text-xs">Свернуть</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onExpandAll}
        title="Развернуть все родительские задачи"
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
        <span className="hidden xl:inline text-xs">Развернуть</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onScrollToToday}
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
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
          className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
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

      <div className="inline-flex overflow-hidden rounded border border-slate-200">
        {(['day', 'week', 'month'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => handleViewModeChange(nextMode)}
            className={cn(
              'flex h-7 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              nextMode !== 'month' && 'border-r border-slate-200',
              currentViewMode === nextMode
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-white text-slate-600',
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

      <FilterPopup>
        <Button
          size="sm"
          variant={hasActiveFilters ? 'secondary' : 'ghost'}
          className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
          title="Показать фильтры задач"
        >
          <Funnel className="h-3.5 w-3.5" />
          <span className="hidden md:inline text-xs">Фильтры</span>
        </Button>
      </FilterPopup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center rounded border border-slate-200 px-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary pointer-events-none"
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
              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary pointer-events-none"
            />
            <span className="text-sm">Просроченные</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showChatToggle && onOpenChat && (
        <Button
          size="sm"
          onClick={onOpenChat}
          aria-label="Показать AI ассистента"
          className="ml-auto h-7 gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          title="Показать AI ассистента"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">AI ассистент</span>
          <span className="sm:hidden">AI</span>
        </Button>
      )}

      {/* Validation errors are hidden from UI to avoid user confusion.
          The onValidateDependencies callback in gantt-lib is informational only
          and does not block dependency creation. Errors are still logged to console
          for debugging purposes. */}
      {/* {validationErrors.length > 0 && (
        <span className="rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          {validationErrors.length} ошибк{validationErrors.length === 1 ? 'а' : validationErrors.length > 1 && validationErrors.length < 5 ? 'и' : ''}
        </span>
      )} */}
    </div>
  );
}
