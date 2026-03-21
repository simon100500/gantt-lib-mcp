import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react';

import { Input } from './ui/input';
import { Button } from './ui/button';
import { useUIStore } from '../stores/useUIStore';
import { useTaskStore } from '../stores/useTaskStore';
import { cn } from '@/lib/utils';

interface TaskSearchProps {
  onTaskNavigate?: (taskId: string) => void;
}

export function TaskSearch({ onTaskNavigate }: TaskSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const searchQuery = useUIStore((state) => state.searchQuery);
  const searchResults = useUIStore((state) => state.searchResults);
  const searchIndex = useUIStore((state) => state.searchIndex);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const navNext = useUIStore((state) => state.navNext);
  const navPrev = useUIStore((state) => state.navPrev);
  const clearSearch = useUIStore((state) => state.clearSearch);

  const tasks = useTaskStore((state) => state.tasks);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInputChange = (value: string) => {
    setSearchQuery(value, tasks);
  };

  const handleNavigateToIndex = (index: number) => {
    const taskId = searchResults[index];
    if (taskId && onTaskNavigate) {
      onTaskNavigate(taskId);
    }
  };

  const handleNavNext = () => {
    if (searchResults.length === 0) return;
    const newIndex = (searchIndex + 1) % searchResults.length;
    navNext();
    handleNavigateToIndex(newIndex);
  };

  const handleNavPrev = () => {
    if (searchResults.length === 0) return;
    const newIndex = searchIndex === 0 ? searchResults.length - 1 : searchIndex - 1;
    navPrev();
    handleNavigateToIndex(newIndex);
  };

  const handleClear = () => {
    clearSearch();
    inputRef.current?.focus();
  };

  const hasResults = searchResults.length > 0;
  const showCounter = searchQuery.trim().length > 0;
  const currentLabel = hasResults ? `${searchIndex + 1}/${searchResults.length}` : 'Нет совпадений';

  return (
    <div className="flex min-w-0 w-full max-w-[48rem] shrink items-center">
      <div className="relative flex min-w-0 flex-1 items-center group">
        {/* Иконка лупы слева */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none">
          <Search size={16} strokeWidth={2.2} />
        </div>

        <Input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || (event.key === 'Enter' && !event.shiftKey)) {
              event.preventDefault();
              handleNavNext();
            } else if (event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey)) {
              event.preventDefault();
              handleNavPrev();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              if (searchQuery) {
                handleClear();
              } else {
                inputRef.current?.blur();
              }
            }
          }}
          placeholder="Поиск задач..."
          className="h-9 w-full rounded-lg border-slate-200 bg-white pl-10 pr-32 text-sm focus-visible:ring-1 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 focus-visible:ring-offset-0"
          aria-label="Поиск задач"
          title="Ctrl+K или /"
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {showCounter && (
            <span
              className={cn(
                'mr-1 shrink-0 text-xs font-medium tabular-nums',
                hasResults ? 'text-slate-500' : 'text-slate-400',
              )}
            >
              {currentLabel}
            </span>
          )}
          {hasResults && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavPrev}
                className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700"
                title="Предыдущий результат"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavNext}
                className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700"
                title="Следующий результат"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
              title="Очистить поиск"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {/* Индикатор горячей клавиши */}
          {!searchQuery && (
            <kbd className="pointer-events-none select-none hidden sm:inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 font-sans text-[12px] font-medium text-slate-400 group-focus-within:hidden mr-1.5">
              /
            </kbd>
          )}
        </div>
      </div>
    </div>
  );
}
