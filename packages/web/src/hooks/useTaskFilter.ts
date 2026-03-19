import { useMemo } from 'react';
import { and, withoutDeps, expired, nameContains, inDateRange } from 'gantt-lib/filters';
import type { TaskPredicate } from 'gantt-lib';
import { useUIStore } from '../stores/useUIStore';

export function useTaskFilter(): TaskPredicate | undefined {
  const filterWithoutDeps = useUIStore((state) => state.filterWithoutDeps);
  const filterExpired = useUIStore((state) => state.filterExpired);
  const filterSearchText = useUIStore((state) => state.filterSearchText);
  const filterDateFrom = useUIStore((state) => state.filterDateFrom);
  const filterDateTo = useUIStore((state) => state.filterDateTo);

  return useMemo(() => {
    const predicates: Array<TaskPredicate> = [];

    if (filterWithoutDeps) {
      predicates.push(withoutDeps());
    }

    if (filterExpired) {
      predicates.push(expired());
    }

    if (filterSearchText.trim()) {
      predicates.push(nameContains(filterSearchText.trim()));
    }

    if (filterDateFrom && filterDateTo) {
      predicates.push(inDateRange(new Date(filterDateFrom), new Date(filterDateTo)));
    }

    // No active filters
    if (predicates.length === 0) {
      return undefined;
    }

    // Combine all predicates with AND logic
    return and(...predicates);
  }, [filterWithoutDeps, filterExpired, filterSearchText, filterDateFrom, filterDateTo]);
}
