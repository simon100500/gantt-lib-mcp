import { useEffect, useMemo } from 'react';
import type { CalendarDay, Task } from '../types.ts';
import { useTaskStore } from '../stores/useTaskStore.ts';
import { deriveVisibleSnapshot, useProjectStore } from '../stores/useProjectStore.ts';
import { getProjectScheduleOptions } from '../lib/projectScheduleOptions.ts';

const EMPTY_CALENDAR_DAYS: CalendarDay[] = [];

export interface UseTasksResult {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loading: boolean;
  error: string | null;
}

export function useTasks(
  accessToken: string | null,
  refreshAccessToken: () => Promise<string | null>,
  ganttDayMode: 'business' | 'calendar',
  calendarDays: CalendarDay[] = EMPTY_CALENDAR_DAYS,
): UseTasksResult {
  const shareToken = new URLSearchParams(window.location.search).get('share');
  const taskStoreTasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const activeSource = useTaskStore((state) => state.activeSource);
  const confirmedSnapshot = useProjectStore((state) => state.confirmed.snapshot);
  const pendingCommands = useProjectStore((state) => state.pending);
  const dragPreview = useProjectStore((state) => state.dragPreview);
  const currentScheduleOptions = useProjectStore((state) => state.scheduleOptions);
  const setScheduleOptions = useProjectStore((state) => state.setScheduleOptions);
  const effectiveCalendarDays = calendarDays.length > 0 ? calendarDays : EMPTY_CALENDAR_DAYS;
  const scheduleOptions = useMemo(
    () => getProjectScheduleOptions(ganttDayMode, effectiveCalendarDays),
    [effectiveCalendarDays, ganttDayMode],
  );

  useEffect(() => {
    if (currentScheduleOptions !== scheduleOptions) {
      setScheduleOptions(scheduleOptions);
    }
  }, [currentScheduleOptions, scheduleOptions, setScheduleOptions]);

  const visibleTasks = useMemo(() => {
    return deriveVisibleSnapshot(
      confirmedSnapshot,
      pendingCommands,
      dragPreview,
      scheduleOptions,
    ).tasks;
  }, [confirmedSnapshot, dragPreview, pendingCommands, scheduleOptions]);

  useEffect(() => {
    void useTaskStore.getState().syncSource({
      accessToken,
      refreshAccessToken,
      shareToken,
    });
  }, [accessToken, refreshAccessToken, shareToken]);

  return {
    tasks: activeSource === 'auth' ? visibleTasks : taskStoreTasks,
    setTasks,
    loading,
    error,
  };
}
