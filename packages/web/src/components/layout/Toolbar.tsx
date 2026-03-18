import {
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  FlagTriangleRight,
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

interface ToolbarProps {
  showChatToggle?: boolean;
  onOpenChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

export function Toolbar({
  showChatToggle = false,
  onOpenChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
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
        <span className="hidden md:inline">Список задач</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onCollapseAll}
        title="Свернуть все родительские задачи"
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Свернуть</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onExpandAll}
        title="Развернуть все родительские задачи"
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Развернуть</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={onScrollToToday}
        className="h-7 gap-1.5 text-slate-600 hover:text-slate-900"
      >
        <FlagTriangleRight className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Сегодня</span>
      </Button>

      <div className="flex-1" />

      <div className="inline-flex overflow-hidden rounded border border-slate-200">
        {(['day', 'week', 'month'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => setViewMode(nextMode)}
            className={cn(
              'flex h-7 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              nextMode !== 'month' && 'border-r border-slate-200',
              viewMode === nextMode
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
          <span className="hidden sm:inline">AI ассистент</span>
          <span className="sm:hidden">AI</span>
        </Button>
      )}

      {validationErrors.length > 0 && (
        <span className="rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          {validationErrors.length} ошибк{validationErrors.length === 1 ? 'а' : validationErrors.length > 1 && validationErrors.length < 5 ? 'и' : ''}
        </span>
      )}
    </div>
  );
}
