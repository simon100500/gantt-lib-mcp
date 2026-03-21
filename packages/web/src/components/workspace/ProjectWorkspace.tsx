import type { Ref, RefObject } from 'react';
import { useEffect, useMemo, useCallback } from 'react';
import { Check } from 'lucide-react';

import { ChatSidebar } from '../ChatSidebar.tsx';
import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { russianHolidays2026 } from '../../lib/russianHolidays2026.ts';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { cn } from '@/lib/utils';
import type { Task, ValidationResult } from '../../types.ts';

interface ProjectWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  hasShareToken: boolean;
  displayConnected: boolean;
  isAuthenticated: boolean;
  batchUpdate?: UseBatchTaskUpdateResult;
  onSend?: (text: string) => void;
  onLoginRequired: () => void;
  onCloseChat?: () => void;
  onOpenChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onValidation: (result: ValidationResult) => void;
  onCascade?: (shiftedTasks: Task[]) => void;
  readOnly?: boolean;
  showChat?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
}

export function ProjectWorkspace({
  ganttRef,
  hasShareToken,
  displayConnected,
  isAuthenticated,
  batchUpdate,
  onSend,
  onLoginRequired,
  onCloseChat,
  onOpenChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onValidation,
  onCascade,
  readOnly = false,
  showChat = true,
  shareStatus = 'idle',
  onCreateShareLink,
}: ProjectWorkspaceProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const sharedProject = useTaskStore((state) => state.project);
  const shareToken = useTaskStore((state) => state.shareToken);
  const messages = useChatStore((state) => state.messages);
  const streaming = useChatStore((state) => state.streamingText);
  const aiThinking = useChatStore((state) => state.aiThinking);
  const workspace = useUIStore((state) => state.workspace);
  const savingState = useUIStore((state) => state.savingState);
  const showTaskList = useUIStore((state) => state.showTaskList);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const searchResults = useUIStore((state) => state.searchResults);
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

  return (
    <>
      <div className="flex min-w-0 flex-1 overflow-hidden bg-[#f4f5f7]">
        <div className="hidden xl:block xl:w-8 2xl:w-12" />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden py-4 xl:py-5">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]">
            <Toolbar
              showChatToggle={!chatSidebarVisible && !hasShareToken && showChat}
              onOpenChat={onOpenChat}
              onScrollToToday={onScrollToToday}
              onCollapseAll={onCollapseAll}
              onExpandAll={onExpandAll}
              shareStatus={shareStatus}
              onCreateShareLink={onCreateShareLink}
              showShareButton={!hasShareToken && isAuthenticated}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />

            {loading ? (
              <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                Загрузка...
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                <GanttChart
                  ref={ganttRef as Ref<GanttChartRef>}
                  tasks={tasks}
                  taskFilter={taskFilter}
                  onTasksChange={readOnly ? undefined : batchUpdate?.handleTasksChange}
                  dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
                  rowHeight={36}
                  containerHeight="calc(100vh - 162px)"
                  showTaskList={showTaskList}
                  taskListWidth={650}
                  onValidateDependencies={onValidation}
                  enableAutoSchedule={autoSchedule}
                  onCascade={readOnly ? undefined : onCascade}
                  disableTaskNameEditing={readOnly}
                  disableDependencyEditing={readOnly}
                  highlightExpiredTasks={highlightExpiredTasks}
                  headerHeight={40}
                  viewMode={viewMode}
                  collapsedParentIds={collapsedParentIds}
                  onToggleCollapse={handleToggleCollapse}
                  onAdd={readOnly ? undefined : batchUpdate?.handleAdd}
                  onDelete={readOnly ? undefined : batchUpdate?.handleDelete}
                  onInsertAfter={readOnly ? undefined : batchUpdate?.handleInsertAfter}
                  onReorder={readOnly ? undefined : batchUpdate?.handleReorder}
                  onPromoteTask={readOnly ? undefined : batchUpdate?.handlePromoteTask}
                  onDemoteTask={readOnly ? undefined : batchUpdate?.handleDemoteTask}
                  customDays={russianHolidays2026}
                  highlightedTaskIds={highlightedSearchTaskIds}
                />
              </div>
            )}

            {tasks.length > 0 && (
              <footer className="flex h-8 shrink-0 select-none items-center gap-4 border-t border-slate-200 bg-white px-4">
                <span className="font-mono text-[11px] text-slate-400">
                  {tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length > 1 && tasks.length < 5 ? 'и' : ''}
                </span>

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

        <div className="hidden xl:block xl:w-8 2xl:w-12" />
      </div>

      {chatSidebarVisible && !hasShareToken && onSend && (
        <aside className="relative z-20 m-4 ml-0 hidden w-[320px] shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] xl:flex xl:flex-col">
          <ChatSidebar
            messages={messages}
            streaming={streaming}
            onSend={onSend}
            disabled={aiThinking}
            connected={displayConnected}
            loading={aiThinking}
            onClose={onCloseChat}
            isAuthenticated={isAuthenticated}
            onLoginRequired={onLoginRequired}
          />
        </aside>
      )}
    </>
  );
}
