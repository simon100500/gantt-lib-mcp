import type { Ref, RefObject } from 'react';
import { Check } from 'lucide-react';

import { ChatSidebar } from '../ChatSidebar.tsx';
import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { russianHolidays2026 } from '../../lib/russianHolidays2026.ts';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
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
  const messages = useChatStore((state) => state.messages);
  const streaming = useChatStore((state) => state.streamingText);
  const aiThinking = useChatStore((state) => state.aiThinking);
  const workspace = useUIStore((state) => state.workspace);
  const savingState = useUIStore((state) => state.savingState);
  const viewMode = useUIStore((state) => state.viewMode);
  const showTaskList = useUIStore((state) => state.showTaskList);
  const autoSchedule = useUIStore((state) => state.autoSchedule);
  const highlightExpiredTasks = useUIStore((state) => state.highlightExpiredTasks);
  const chatSidebarVisible = showChat && workspace.kind === 'project' && workspace.chatOpen;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Toolbar
          showChatToggle={!chatSidebarVisible && !hasShareToken && showChat}
          onOpenChat={onOpenChat}
          onScrollToToday={onScrollToToday}
          onCollapseAll={onCollapseAll}
          onExpandAll={onExpandAll}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
        />

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Загрузка...
          </div>
        ) : (
          <GanttChart
            ref={ganttRef as Ref<GanttChartRef>}
            tasks={tasks}
            onTasksChange={readOnly ? undefined : batchUpdate?.handleTasksChange}
            dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
            rowHeight={36}
            containerHeight="calc(100vh - 120px)"
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
            onAdd={readOnly ? undefined : batchUpdate?.handleAdd}
            onDelete={readOnly ? undefined : batchUpdate?.handleDelete}
            onInsertAfter={readOnly ? undefined : batchUpdate?.handleInsertAfter}
            onReorder={readOnly ? undefined : batchUpdate?.handleReorder}
            onPromoteTask={readOnly ? undefined : batchUpdate?.handlePromoteTask}
            onDemoteTask={readOnly ? undefined : batchUpdate?.handleDemoteTask}
            customDays={russianHolidays2026}
          />
        )}

        {tasks.length > 0 && (
          <footer className="flex h-7 shrink-0 select-none items-center gap-4 border-t border-slate-200 bg-white px-4">
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

      {chatSidebarVisible && !hasShareToken && onSend && (
        <aside className="relative z-20 flex w-80 shrink-0 flex-col border-l border-slate-200">
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
