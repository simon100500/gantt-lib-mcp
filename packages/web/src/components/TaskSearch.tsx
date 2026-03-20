import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

import { Input } from './ui/input';
import { Button } from './ui/button';
import { useUIStore } from '../stores/useUIStore';
import { useTaskStore } from '../stores/useTaskStore';
import { cn } from '@/lib/utils';

interface TaskSearchProps {
  onTaskNavigate?: (taskId: string) => void;
}

export function TaskSearch({ onTaskNavigate }: TaskSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState('');

  const searchQuery = useUIStore((state) => state.searchQuery);
  const searchResults = useUIStore((state) => state.searchResults);
  const searchIndex = useUIStore((state) => state.searchIndex);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const navNext = useUIStore((state) => state.navNext);
  const navPrev = useUIStore((state) => state.navPrev);
  const clearSearch = useUIStore((state) => state.clearSearch);

  const tasks = useTaskStore((state) => state.tasks);

  const handleInputChange = (value: string) => {
    setLocalQuery(value);
    setSearchQuery(value, tasks);
  };

  const handleNavNext = () => {
    const newIndex = (searchIndex + 1) % searchResults.length;
    navNext();
    const taskId = searchResults[newIndex];
    if (taskId && onTaskNavigate) {
      onTaskNavigate(taskId);
    }
  };

  const handleNavPrev = () => {
    const newIndex = searchIndex === 0 ? searchResults.length - 1 : searchIndex - 1;
    navPrev();
    const taskId = searchResults[newIndex];
    if (taskId && onTaskNavigate) {
      onTaskNavigate(taskId);
    }
  };

  const handleClear = () => {
    setLocalQuery('');
    clearSearch();
    setIsOpen(false);
  };

  const handleOpen = () => setIsOpen(true);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="h-7 px-2 text-slate-500 hover:text-slate-700"
        title="Поиск задач"
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  const hasResults = searchResults.length > 0;
  const currentLabel = hasResults ? `${searchIndex + 1}/${searchResults.length}` : '0/0';

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <Input
          type="text"
          value={localQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Поиск задач..."
          className="h-7 w-48 pl-7 pr-16 text-xs"
          autoFocus
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {hasResults && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavPrev}
                className="h-5 w-5 p-0 text-slate-500 hover:text-slate-700"
                title="Предыдущий результат"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavNext}
                className="h-5 w-5 p-0 text-slate-500 hover:text-slate-700"
                title="Следующий результат"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-5 w-5 p-0 text-slate-400 hover:text-slate-600"
            title="Закрыть поиск"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <span className={cn(
        "text-xs font-medium tabular-nums",
        hasResults ? "text-slate-600" : "text-slate-400"
      )}>
        {currentLabel}
      </span>
    </div>
  );
}
