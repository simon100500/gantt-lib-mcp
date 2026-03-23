import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useUIStore } from '../stores/useUIStore';
import { Button } from './ui/button';

interface FilterPopupProps {
  children: React.ReactNode;
}

export function FilterPopup({ children }: FilterPopupProps) {
  const filterWithoutDeps = useUIStore((state) => state.filterWithoutDeps);
  const filterExpired = useUIStore((state) => state.filterExpired);
  const filterSearchText = useUIStore((state) => state.filterSearchText);
  const filterDateFrom = useUIStore((state) => state.filterDateFrom);
  const filterDateTo = useUIStore((state) => state.filterDateTo);
  const filterMode = useUIStore((state) => state.filterMode);
  const setFilterMode = useUIStore((state) => state.setFilterMode);

  const setFilterWithoutDeps = useUIStore((state) => state.setFilterWithoutDeps);
  const setFilterExpired = useUIStore((state) => state.setFilterExpired);
  const setFilterSearchText = useUIStore((state) => state.setFilterSearchText);
  const setFilterDateFrom = useUIStore((state) => state.setFilterDateFrom);
  const setFilterDateTo = useUIStore((state) => state.setFilterDateTo);
  const resetFilters = useUIStore((state) => state.resetFilters);

  const hasActiveFilters =
    filterWithoutDeps ||
    filterExpired ||
    filterSearchText.trim().length > 0 ||
    (filterDateFrom && filterDateTo);

  const handleReset = () => {
    resetFilters();
  };

  const preventMenuTypeahead = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Filter mode toggle - highlight / hide */}
        <div className="px-2 py-1.5">
          <Label className="text-xs font-medium mb-1.5 block">Режим поиска</Label>
          <div className="flex">
            <Button
              type="button"
              variant={filterMode === 'highlight' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('highlight')}
              className="flex-1 h-7 text-xs rounded-r-none border-r-0"
            >
              Подсветка
            </Button>
            <Button
              type="button"
              variant={filterMode === 'hide' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMode('hide')}
              className="flex-1 h-7 text-xs rounded-l-none"
            >
              Фильтр
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Without deps checkbox */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setFilterWithoutDeps(!filterWithoutDeps);
          }}
          className="flex cursor-pointer items-center gap-2"
        >
          <input
            type="checkbox"
            checked={filterWithoutDeps}
            readOnly
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary pointer-events-none"
          />
          <span className="text-sm">Без зависимостей</span>
        </DropdownMenuItem>

        {/* Expired checkbox */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setFilterExpired(!filterExpired);
          }}
          className="flex cursor-pointer items-center gap-2"
        >
          <input
            type="checkbox"
            checked={filterExpired}
            readOnly
            className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary pointer-events-none"
          />
          <span className="text-sm">Просроченные</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Search input */}
        <div
          className="px-2 py-1.5"
          onKeyDownCapture={preventMenuTypeahead}
        >
          <Label htmlFor="filter-search" className="text-xs font-medium">
            Поиск
          </Label>
          <Input
            id="filter-search"
            type="text"
            placeholder="Название задачи"
            value={filterSearchText}
            onChange={(e) => setFilterSearchText(e.target.value)}
            className="h-8 text-sm"
            onFocus={(e) => e.target.select()}
          />
        </div>

        <DropdownMenuSeparator />

        {/* Date range inputs */}
        <div
          className="px-2 py-1.5 space-y-2"
          onKeyDownCapture={preventMenuTypeahead}
        >
          <div className="space-y-1">
            <Label htmlFor="filter-date-from" className="text-xs font-medium">
              От
            </Label>
            <Input
              id="filter-date-from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-date-to" className="text-xs font-medium">
              До
            </Label>
            <Input
              id="filter-date-to"
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Reset button */}
        <div className="px-2 py-1.5" onPointerDownCapture={(event) => event.preventDefault()}>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
            className="w-full h-8 text-xs"
          >
            Сбросить все
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
