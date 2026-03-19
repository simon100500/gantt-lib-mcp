import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

const FILTER_STORAGE_KEY = 'gantt-filters';

export function useFilterPersistence() {
  const filterWithoutDeps = useUIStore((state) => state.filterWithoutDeps);
  const filterExpired = useUIStore((state) => state.filterExpired);
  const filterSearchText = useUIStore((state) => state.filterSearchText);
  const filterDateFrom = useUIStore((state) => state.filterDateFrom);
  const filterDateTo = useUIStore((state) => state.filterDateTo);

  const setFilterWithoutDeps = useUIStore((state) => state.setFilterWithoutDeps);
  const setFilterExpired = useUIStore((state) => state.setFilterExpired);
  const setFilterSearchText = useUIStore((state) => state.setFilterSearchText);
  const setFilterDateFrom = useUIStore((state) => state.setFilterDateFrom);
  const setFilterDateTo = useUIStore((state) => state.setFilterDateTo);

  // Load filters from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      try {
        const saved = JSON.parse(stored);
        if (typeof saved.filterWithoutDeps === 'boolean') setFilterWithoutDeps(saved.filterWithoutDeps);
        if (typeof saved.filterExpired === 'boolean') setFilterExpired(saved.filterExpired);
        if (typeof saved.filterSearchText === 'string') setFilterSearchText(saved.filterSearchText);
        if (typeof saved.filterDateFrom === 'string') setFilterDateFrom(saved.filterDateFrom);
        if (typeof saved.filterDateTo === 'string') setFilterDateTo(saved.filterDateTo);
      } catch (error) {
        console.error('[useFilterPersistence] Failed to load filters:', error);
      }
    }
  }, []); // Run only on mount

  // Save filters to localStorage on any change
  useEffect(() => {
    const filters = {
      filterWithoutDeps,
      filterExpired,
      filterSearchText,
      filterDateFrom,
      filterDateTo,
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filterWithoutDeps, filterExpired, filterSearchText, filterDateFrom, filterDateTo]);
}
