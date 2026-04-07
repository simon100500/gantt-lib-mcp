import type { Ref, RefObject } from 'react';
import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Check } from 'lucide-react';
import { reflowTasksOnModeSwitch } from 'gantt-lib';

import { ChatSidebar } from '../ChatSidebar.tsx';
import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { buildCustomDays, getProjectWeekendPredicate } from '../../lib/projectScheduleOptions.ts';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useChatStore } from '../../stores/useChatStore.ts';
import type { SubscriptionStatus, UsageStatus } from '../../stores/useBillingStore.ts';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { cn } from '@/lib/utils';
import type { CalendarDay, Task, ValidationResult } from '../../types.ts';

interface ProjectWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  sharedProject: SharedTaskProject | null;
  shareToken: string | null;
  hasShareToken: boolean;
  displayConnected: boolean;
  isAuthenticated: boolean;
  chatUsage?: UsageStatus | SubscriptionStatus | null;
  chatDisabled?: boolean;
  chatDisabledReason?: string | null;
  batchUpdate?: UseBatchTaskUpdateResult;
  onSend?: (text: string) => void;
  onLoginRequired: () => void;
  onCloseChat?: () => void;
  onToggleChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
  onCascade?: (shiftedTasks: Task[]) => void;
  readOnly?: boolean;
  showChat?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  ganttDayMode: 'business' | 'calendar';
  calendarDays?: CalendarDay[];
  onGanttDayModeChange?: (mode: 'business' | 'calendar') => void;
}

function formatTaskCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} задач`;
  }

  if (mod10 === 1) {
    return `${count} задача`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} задачи`;
  }

  return `${count} задач`;
}

export function ProjectWorkspace({
  ganttRef,
  tasks,
  setTasks,
  loading,
  sharedProject,
  shareToken,
  hasShareToken,
  displayConnected,
  isAuthenticated,
  chatUsage = null,
  chatDisabled = false,
  chatDisabledReason = null,
  batchUpdate,
  onSend,
  onLoginRequired,
  onCloseChat,
  onToggleChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onValidation,
  onCascade,
  readOnly = false,
  showChat = true,
  shareStatus = 'idle',
  onCreateShareLink,
  ganttDayMode,
  calendarDays = [],
  onGanttDayModeChange,
}: ProjectWorkspaceProps) {
  const messages = useChatStore((state) => state.messages);
  const streaming = useChatStore((state) => state.streamingText);
  const aiThinking = useChatStore((state) => state.aiThinking);
  const workspace = useUIStore((state) => state.workspace);
  const savingState = useUIStore((state) => state.savingState);
  const showTaskList = useUIStore((state) => state.showTaskList);
  const showChart = useUIStore((state) => state.showChart);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const searchResults = useUIStore((state) => state.searchResults);
  const filterMode = useUIStore((state) => state.filterMode);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);

  const projectId = workspace.kind === 'project'
    ? workspace.projectId
    : workspace.kind === 'shared'
      ? `shared:${shareToken ?? sharedProject?.id ?? 'unknown'}`
      : null;
  const chatSidebarVisible = showChat && workspace.kind === 'project' && workspace.chatOpen;

  useFilterPersistence();
  const taskFilter = useTaskFilter();

  const projectStates = useProjectUIStore((state) => state.projectStates);
  const collapsedParentIds = useMemo(() => {
    if (!projectId) return new Set<string>();
    const projectState = projectStates[projectId];
    return projectState?.collapsedParentIds
      ? new Set(projectState.collapsedParentIds)
      : new Set<string>();
  }, [projectId, projectStates]);

  const disableTaskDrag = useMemo(() => {
    if (!projectId) return false;
    return projectStates[projectId]?.disableTaskDrag ?? false;
  }, [projectId, projectStates]);
  const effectiveTasks = tasks;
  const effectiveDisableTaskDrag = readOnly || disableTaskDrag;

  const handleSetDisableTaskDrag = useCallback((enabled: boolean) => {
    if (!projectId || readOnly) return;
    setProjectState(projectId, { disableTaskDrag: enabled });
  }, [projectId, readOnly, setProjectState]);

  const handleToggleCollapse = useCallback((parentId: string) => {
    if (!projectId) return;

    const newSet = new Set(collapsedParentIds);
    if (newSet.has(parentId)) {
      newSet.delete(parentId);
    } else {
      newSet.add(parentId);
    }

    setProjectState(projectId, {
      collapsedParentIds: Array.from(newSet),
    });
  }, [projectId, collapsedParentIds, setProjectState]);

  useEffect(() => {
    if (projectId) {
      const projectState = getProjectState(projectId);
      if (projectState?.viewMode) {
        setViewMode(projectState.viewMode);
      }
    }
  }, [projectId, getProjectState, setViewMode]);

  const handleViewModeChange = (newViewMode: 'day' | 'week' | 'month') => {
    setViewMode(newViewMode);
    if (projectId) {
      setProjectState(projectId, { viewMode: newViewMode });
    }
  };

  const viewMode = useUIStore((state) => state.viewMode);
  const tempHighlightedTaskId = useUIStore((state) => state.tempHighlightedTaskId);
  const highlightedSearchTaskIds = useMemo(() => {
    const ids = new Set(searchResults);
    if (tempHighlightedTaskId) {
      ids.add(tempHighlightedTaskId);
    }
    return ids;
  }, [searchResults, tempHighlightedTaskId]);
  const previousGanttDayModeRef = useRef(ganttDayMode);
  const customDays = useMemo(() => buildCustomDays(calendarDays), [calendarDays]);
  const weekendPredicate = useMemo(
    () => getProjectWeekendPredicate(calendarDays) ?? (() => false),
    [calendarDays],
  );

  useEffect(() => {
    const previousMode = previousGanttDayModeRef.current;
    if (previousMode === ganttDayMode) {
      return;
    }

    previousGanttDayModeRef.current = ganttDayMode;

    if (tasks.length === 0) {
      return;
    }

    const reflowedTasks = reflowTasksOnModeSwitch(tasks, ganttDayMode === 'business', weekendPredicate) as Task[];

    if (readOnly || !batchUpdate) {
      setTasks(reflowedTasks);
      return;
    }

    void batchUpdate.handleTasksChange(reflowedTasks);
  }, [batchUpdate, ganttDayMode, readOnly, setTasks, tasks, weekendPredicate]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
      {/* Toolbar on full width */}
      <div className="px-3 md:px-4">
        <Toolbar
          showChatToggle={!hasShareToken && showChat}
          isChatOpen={chatSidebarVisible}
          onToggleChat={onToggleChat}
          onScrollToToday={onScrollToToday}
          onCollapseAll={onCollapseAll}
          onExpandAll={onExpandAll}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          disableTaskDrag={effectiveDisableTaskDrag}
          onToggleDisableTaskDrag={handleSetDisableTaskDrag}
          ganttDayMode={ganttDayMode}
          onGanttDayModeChange={onGanttDayModeChange}
          readOnly={readOnly}
        />
      </div>

      {/* Chart and Chat side by side */}
      <div className="mt-0.5 flex min-w-0 flex-1 overflow-hidden px-3 md:px-4">
        {/* Chart card - hide on mobile when chat is open */}
        <div className={cn(
          "flex min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]",
          chatSidebarVisible && "hidden md:flex"
        )}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {loading ? (
              <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                Загрузка...
              </div>
            ) : (
              <GanttChart
                ref={ganttRef as Ref<GanttChartRef>}
                tasks={effectiveTasks}
                taskFilter={taskFilter}
                onTasksChange={readOnly ? undefined : batchUpdate?.handleTasksChange}
                dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
                rowHeight={36}
                containerHeight="calc(100dvh - 136px)"
                showTaskList={showTaskList}
                showChart={showChart}
                taskListWidth={650}
                onValidateDependencies={onValidation}
                enableAutoSchedule={autoSchedule}
                onCascade={readOnly ? undefined : onCascade}
                disableTaskNameEditing={readOnly}
                disableDependencyEditing={readOnly}
                disableTaskDrag={effectiveDisableTaskDrag}
                highlightExpiredTasks={highlightExpiredTasks}
                headerHeight={40}
                viewMode={viewMode}
                collapsedParentIds={collapsedParentIds}
                onToggleCollapse={handleToggleCollapse}
                onAdd={readOnly ? undefined : batchUpdate?.handleAdd}
                onDelete={readOnly ? undefined : batchUpdate?.handleDelete}
                onInsertAfter={readOnly ? undefined : batchUpdate?.handleInsertAfter}
                onReorder={readOnly ? undefined : batchUpdate?.handleReorder}
                customDays={customDays}
                highlightedTaskIds={highlightedSearchTaskIds}
                filterMode={filterMode}
                businessDays={ganttDayMode !== 'calendar'}
              />
            )}

            {(tasks.length > 0 || readOnly) && (
              <footer className="flex h-6 shrink-0 select-none items-center gap-4 border-t border-slate-200 bg-white px-4">
                {effectiveTasks.length > 0 && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTaskCount(effectiveTasks.length)}
                  </span>
                )}

                <span className="font-mono text-[11px] text-slate-400">
                  {ganttDayMode === 'calendar' ? 'Календарные дни' : 'Рабочие дни'}
                </span>

                {readOnly && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600">
                    Только чтение
                  </span>
                )}

                <span
                  className={cn(
                    'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                    displayConnected ? 'text-emerald-600' : 'text-amber-600',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', displayConnected ? 'bg-emerald-500' : 'bg-amber-400')} />
                  {hasShareToken ? 'Только для чтения' : displayConnected ? 'Подключено' : 'Переподключение...'}
                </span>

                {!hasShareToken && isAuthenticated && savingState !== 'idle' && (
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      savingState === 'saving' && 'text-amber-600',
                      savingState === 'saved' && 'text-emerald-600',
                      savingState === 'error' && 'text-red-600',
                    )}
                  >
                    {savingState === 'saving' && (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                        Сохранение...
                      </>
                    )}
                    {savingState === 'saved' && (
                      <>
                        <Check className="h-3 w-3 shrink-0" />
                        Сохранено
                      </>
                    )}
                    {savingState === 'error' && (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        Ошибка сохранения
                      </>
                    )}
                  </span>
                )}
              </footer>
            )}
          </div>
        </div>

        {/* Chat card - full width on mobile when open, side on desktop */}
        {chatSidebarVisible && !hasShareToken && onSend && (
          <aside className="mb-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] md:ml-3 md:w-[360px] md:flex-1 md:max-w-md xl:max-w-[320px]">
            <ChatSidebar
              messages={messages}
              streaming={streaming}
              onSend={onSend}
              disabled={aiThinking || chatDisabled}
              connected={displayConnected}
              usage={chatUsage}
              disabledReason={aiThinking ? null : chatDisabledReason}
              loading={aiThinking}
              onClose={onCloseChat}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
