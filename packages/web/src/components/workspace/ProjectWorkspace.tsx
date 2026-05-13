import type { Ref, RefObject } from 'react';
import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { Users, ListTree, LoaderCircle, MessageSquare, ToyBrick, TriangleAlert, WandSparkles, X } from 'lucide-react';
import { Calendar, reflowTasksOnModeSwitch } from 'gantt-lib';
import type { TaskDateChangeMode, TaskListColumn, TaskListColumnId, TaskListColumnWidthMap, TaskListMenuCommand } from 'gantt-lib';

import { ChatSidebar } from '../ChatSidebar.tsx';
import { GanttChart, type GanttChartRef } from '../GanttChart.tsx';
import { HistoryPanel } from '../HistoryPanel.tsx';
import { ProjectSettingsModal } from '../ProjectSettingsModal.tsx';
import { SplitTaskModal, type SplitTaskSubmitPayload } from '../SplitTaskModal.tsx';
import { TaskChatModal } from '../TaskChatModal.tsx';
import { CreateResourceModal } from './CreateResourceModal.tsx';
import { ResourceAssignmentModal } from './ResourceAssignmentModal.tsx';
import { createAssignedResourcesColumn } from './AssignedResourcesColumn.tsx';
import { createTaskStatusColumn } from './TaskStatusColumn.tsx';
import { createTaskWorkColumns } from './TaskWorkColumns.tsx';
import type { StartScreenSendResult } from '../StartScreen.tsx';
import { Toolbar } from '../layout/Toolbar.tsx';
import { buildCustomDays, DEFAULT_CALENDAR_WEEKLY_PATTERN, getProjectWeekendPredicate } from '../../lib/projectScheduleOptions.ts';
import type { UseBatchTaskUpdateResult } from '../../hooks/useBatchTaskUpdate.ts';
import { useFilterPersistence } from '../../hooks/useFilterPersistence';
import { useProjectHistory } from '../../hooks/useProjectHistory.ts';
import { useTaskFilter } from '../../hooks/useTaskFilter';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import type { SubscriptionStatus, UsageStatus } from '../../stores/useBillingStore.ts';
import { useHistoryViewerStore } from '../../stores/useHistoryViewerStore.ts';
import type { SharedTaskProject } from '../../stores/useTaskStore.ts';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { cn } from '../../lib/utils.ts';
import { buildDefaultBaselineName } from '../../lib/baselineNaming.ts';
import { calendarDaysEqual, calendarWeeklyPatternEqual } from '../../lib/projectCalendar.ts';
import { useProjectBaselines } from '../../hooks/useProjectBaselines.ts';
import type { BaselineSnapshotResponse, ProjectResource, ResourceScope, ResourceType, TaskAssignmentRecord, TaskProgressEntry } from '../../lib/apiTypes.ts';
import type { ConstraintDenialPayload } from '../../lib/constraintUi.ts';
import type { CalendarDay, CalendarWeeklyPattern, Task, TimelineMarker, ValidationResult } from '../../types.ts';
import {
  KNOWN_TASK_LIST_COLUMN_IDS,
  normalizeHiddenTaskListColumns,
  resolveHiddenTaskListColumns,
  TASK_LIST_COLUMN_ROWS,
  TASK_LIST_COLUMN_WIDTHS,
} from '../../lib/taskListColumns.ts';
import {
  collectDescendantLeafIds,
  getAssignableResources,
  getInitialSelectedResourceIds,
  getTaskAssignmentResourceGroups,
} from './resourceAssignmentUtils.ts';

interface ProjectWorkspaceProps {
  ganttRef: RefObject<GanttChartRef | null>;
  projectName?: string;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  loading: boolean;
  accessToken?: string | null;
  sharedProject: SharedTaskProject | null;
  shareToken: string | null;
  hasShareToken: boolean;
  displayConnected: boolean;
  isAuthenticated: boolean;
  chatUsage?: UsageStatus | SubscriptionStatus | null;
  chatDisabled?: boolean;
  chatDisabledReason?: string | null;
  batchUpdate?: UseBatchTaskUpdateResult;
  onSend?: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
  onStopGeneration?: () => void | Promise<void>;
  onLoginRequired: () => void;
  onCloseChat?: () => void;
  onToggleChat?: () => void;
  onScrollToToday: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onExportBackup?: () => void;
  onImportExcel?: () => void;
  onImportBackup?: () => void;
  onReturnToWizard?: () => void;
  onInsertTemplateToProject?: () => void | Promise<void>;
  isExportExcelLoading?: boolean;
  onValidation: (result: ValidationResult) => void;
  onCascade?: (shiftedTasks: Task[]) => void;
  readOnly?: boolean;
  showChat?: boolean;
  shareStatus?: 'idle' | 'creating' | 'copied' | 'error';
  onCreateShareLink?: () => void;
  shareSelectionMode?: boolean;
  selectedShareTaskIds?: Set<string>;
  onSelectedShareTaskIdsChange?: (taskIds: Set<string>) => void;
  onCancelShareSelection?: () => void;
  onConfirmShareSelection?: () => void | Promise<void>;
  templateSelectionMode?: boolean;
  selectedTemplateTaskIds?: Set<string>;
  onSelectedTemplateTaskIdsChange?: (taskIds: Set<string>) => void;
  onCancelTemplateSelection?: () => void;
  onConfirmTemplateSelection?: () => void | Promise<void>;
  ganttDayMode: 'business' | 'calendar';
  displayGanttDayMode?: 'business' | 'calendar';
  calendarWeeklyPattern?: CalendarWeeklyPattern;
  calendarDays?: CalendarDay[];
  timelineMarkers?: TimelineMarker[];
  onGanttDayModeChange?: (mode: 'business' | 'calendar') => void;
  onTimelineMarkersChange?: (timelineMarkers: TimelineMarker[]) => void | Promise<void>;
  onProjectNameChange?: (projectName: string) => void | Promise<void>;
  previewState?: 'idle' | 'rendering' | 'failed';
  previewMessage?: string | null;
  onSplitTask?: (task: Task, payload: SplitTaskSubmitPayload) => StartScreenSendResult | Promise<StartScreenSendResult>;
  showResourceAssignments?: boolean;
  onCreateTemplateFromTask?: (task: Task) => void | Promise<void>;
  onInsertTemplateAtTask?: (task: Task) => void | Promise<void>;
  onCreateTemplateFromProject?: () => void | Promise<void>;
  onStartTemplateSelection?: () => void | Promise<void>;
  templateMode?: boolean;
  onOpenLimitModal?: (denial: Partial<ConstraintDenialPayload>) => Promise<void>;
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

function SaveTemplateIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="18" height="12" x="3" y="8" rx="1" />
      <path d="M10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3" />
      <path d="M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  );
}

function parseTaskDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatProjectRangeDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatProjectDurationDays(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${days} дней`;
  }

  if (mod10 === 1) {
    return `${days} день`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${days} дня`;
  }

  return `${days} дней`;
}

interface ProjectDateRange {
  start: Date;
  end: Date;
  durationDays: number;
}

function getProjectDateRange(tasks: Task[]): ProjectDateRange | null {
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;

  for (const task of tasks) {
    const start = parseTaskDate(task.startDate);
    const end = parseTaskDate(task.endDate);
    if (!start || !end) {
      continue;
    }

    if (!minStart || start.getTime() < minStart.getTime()) {
      minStart = start;
    }
    if (!maxEnd || end.getTime() > maxEnd.getTime()) {
      maxEnd = end;
    }
  }

  if (!minStart || !maxEnd) {
    return null;
  }

  return {
    start: minStart,
    end: maxEnd,
    durationDays: Math.max(1, Math.round((maxEnd.getTime() - minStart.getTime()) / 86_400_000) + 1),
  };
}

function addDaysUtc(date: Date, days: number): Date {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function diffDaysUtc(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

interface ProjectShiftModalProps {
  range: ProjectDateRange;
  pending: boolean;
  error: string | null;
  isWeekend?: (date: Date) => boolean;
  onCancel: () => void;
  onSubmit: (deltaDays: number) => void;
}

function ProjectShiftModal({
  range,
  pending,
  error,
  isWeekend,
  onCancel,
  onSubmit,
}: ProjectShiftModalProps) {
  const [shiftDaysInput, setShiftDaysInput] = useState('0');
  const shiftDays = Number.parseInt(shiftDaysInput, 10);
  const effectiveShiftDays = Number.isFinite(shiftDays) ? shiftDays : 0;
  const nextStart = addDaysUtc(range.start, effectiveShiftDays);
  const nextEnd = addDaysUtc(range.end, effectiveShiftDays);
  const canSubmit = !pending && Number.isFinite(shiftDays) && effectiveShiftDays !== 0;

  useEffect(() => {
    setShiftDaysInput('0');
  }, [range.start.getTime(), range.end.getTime()]);

  return (
    <div
      aria-describedby={error ? 'project-shift-modal-error' : undefined}
      aria-labelledby="project-shift-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-4 md:py-8"
      data-testid="project-shift-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <form
        className="flex max-h-none w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#dfe1e6] bg-white text-[#172b4d] shadow-[0_24px_70px_rgba(9,30,66,0.22)]"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit(effectiveShiftDays);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#dfe1e6] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold leading-snug text-[#172b4d]" id="project-shift-modal-title">
              Сдвинуть проект
            </h2>
          </div>
          <button
            aria-label="Закрыть окно сдвига проекта"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-[#6b778c] transition-colors hover:bg-[#f4f5f7] hover:text-[#172b4d] focus:outline-none focus:ring-2 focus:ring-[#4c9aff]/25 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 gap-4 overflow-y-visible p-4 text-sm text-[#44546f] md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {error && (
              <div
                aria-atomic="true"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
                data-testid="project-shift-modal-error"
                id="project-shift-modal-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-[#dfe1e6] bg-[#f7f8fa] px-3 py-2">
                <div className="text-[11px] font-bold uppercase leading-none text-[#44546f]">Сейчас</div>
                <div className="mt-1 text-[13px] font-bold text-[#172b4d]">
                  {formatProjectRangeDate(range.start)} - {formatProjectRangeDate(range.end)}
                </div>
                <div className="mt-1 text-[12px] font-medium text-[#6b778c]">
                  {formatProjectDurationDays(range.durationDays)}
                </div>
              </div>
              <div className="rounded-md border border-[#b3d4ff] bg-[#deebff] px-3 py-2">
                <div className="text-[11px] font-bold uppercase leading-none text-[#0747a6]">После сдвига</div>
                <div className="mt-1 text-[13px] font-bold text-[#172b4d]">
                  {formatProjectRangeDate(nextStart)} - {formatProjectRangeDate(nextEnd)}
                </div>
                <div className="mt-1 text-[12px] font-medium text-[#42526e]">
                  {formatProjectDurationDays(range.durationDays)}
                </div>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase leading-none text-[#44546f]">На сколько дней</span>
              <input
                className="h-9 w-full rounded-md border border-[#dfe1e6] bg-white px-3 text-sm font-medium text-[#172b4d] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-[#f4f5f7]"
                disabled={pending}
                inputMode="numeric"
                onChange={(event) => setShiftDaysInput(event.target.value)}
                type="number"
                value={shiftDaysInput}
              />
            </label>

            <p className="text-[12px] font-medium leading-5 text-[#6b778c]">
              Выберите дату начала в календаре или введите число дней. Даты задач пересчитаются на одинаковый сдвиг.
            </p>
          </div>

          <div className="min-h-0 overflow-hidden rounded-md border border-[#dfe1e6] bg-white [&_.gantt-cal-container]:max-h-[400px]">
            <Calendar
              initialDate={range.start}
              isWeekend={isWeekend}
              onSelect={(date: Date) => {
                setShiftDaysInput(String(diffDaysUtc(date, range.start)));
              }}
              selected={nextStart}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dfe1e6] bg-[#f7f8fa] px-4 py-3">
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-[#dfe1e6] bg-white px-3 text-[12px] font-bold text-[#44546f] transition-colors hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Отмена
          </button>
          <button
            aria-busy={pending}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
            type="submit"
          >
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Сдвинуть
          </button>
        </div>
      </form>
    </div>
  );
}

function normalizeProjectResource(payload: unknown): ProjectResource | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const resource = payload as Partial<ProjectResource>;
  if (
    typeof resource.id !== 'string'
    || typeof resource.userId !== 'string'
    || !(typeof resource.projectId === 'string' || resource.projectId === null)
    || !(resource.scope === 'shared' || resource.scope === 'project')
    || typeof resource.name !== 'string'
    || !(resource.type === 'human' || resource.type === 'equipment' || resource.type === 'material' || resource.type === 'other')
    || typeof resource.isActive !== 'boolean'
    || typeof resource.createdAt !== 'string'
    || typeof resource.updatedAt !== 'string'
    || !(typeof resource.deactivatedAt === 'string' || resource.deactivatedAt === null)
  ) {
    return null;
  }

  return {
    ...resource,
    projectGroupId: typeof resource.projectGroupId === 'string' ? resource.projectGroupId : null,
  } as ProjectResource;
}

function formatHistoryVersionTimestamp(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCheckpointLabel(groupId: string, createdAt?: string): string {
  if (groupId === 'initial') {
    return 'Исходная версия';
  }

  if (createdAt) {
    return `Версия от ${formatHistoryVersionTimestamp(createdAt)}`;
  }

  return 'Версия';
}

function buildTaskChatMention(task: Task): string {
  return `[task:${task.id}|${task.name}]\n\n`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
}

function deriveTaskStatusFromProgress(currentStatus: Task['status'] | undefined, progress: number): NonNullable<Task['status']> {
  if (currentStatus === 'closed') {
    return 'closed';
  }
  if (progress >= 100) {
    return 'done';
  }
  if (progress > 0) {
    return 'in_progress';
  }
  return currentStatus === 'in_progress' ? 'in_progress' : 'not_started';
}

function normalizeTaskListColumnWidthMap(value: unknown): TaskListColumnWidthMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number'
      && Number.isFinite(entry[1])
      && entry[1] > 0
    )),
  );
}

export function ProjectWorkspace({
  ganttRef,
  projectName = 'Мой проект',
  tasks,
  setTasks,
  loading,
  accessToken = null,
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
  onStopGeneration,
  onLoginRequired,
  onCloseChat,
  onToggleChat,
  onScrollToToday,
  onCollapseAll,
  onExpandAll,
  onExportPdf,
  onExportExcel,
  onExportBackup,
  onImportExcel,
  onImportBackup,
  onReturnToWizard,
  onInsertTemplateToProject,
  isExportExcelLoading = false,
  onValidation,
  onCascade,
  readOnly = false,
  showChat = true,
  shareStatus = 'idle',
  onCreateShareLink,
  shareSelectionMode = false,
  selectedShareTaskIds = new Set(),
  onSelectedShareTaskIdsChange,
  onCancelShareSelection,
  onConfirmShareSelection,
  templateSelectionMode = false,
  selectedTemplateTaskIds = new Set(),
  onSelectedTemplateTaskIdsChange,
  onCancelTemplateSelection,
  onConfirmTemplateSelection,
  ganttDayMode,
  displayGanttDayMode,
  calendarWeeklyPattern = DEFAULT_CALENDAR_WEEKLY_PATTERN,
  calendarDays = [],
  timelineMarkers = [],
  onGanttDayModeChange,
  onTimelineMarkersChange,
  onProjectNameChange,
  previewState = 'idle',
  previewMessage = null,
  onSplitTask,
  showResourceAssignments = true,
  onCreateTemplateFromTask,
  onInsertTemplateAtTask,
  onCreateTemplateFromProject,
  onStartTemplateSelection,
  templateMode = false,
  onOpenLimitModal,
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
  const strikeClosedTasks = useUIStore((state) => state.strikeClosedTasks);
  const showHistoryPanel = useUIStore((state) => state.showHistoryPanel);
  const setShowHistoryPanel = useUIStore((state) => state.setShowHistoryPanel);
  const historyRefreshRevision = useUIStore((state) => state.historyRefreshRevision);
  const aiMutationLock = useUIStore((state) => state.aiMutationLock);
  const searchResults = useUIStore((state) => state.searchResults);
  const filterMode = useUIStore((state) => state.filterMode);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const setChatComposerDraft = useUIStore((state) => state.setChatComposerDraft);
  const setTempHighlightedTaskId = useUIStore((state) => state.setTempHighlightedTaskId);
  const consumePlannerCorrectionTarget = useUIStore((state) => state.consumePlannerCorrectionTarget);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const authProject = useAuthStore((state) => state.project);

  const projectId = workspace.kind === 'project'
    ? workspace.projectId
    : workspace.kind === 'shared'
      ? `shared:${shareToken ?? sharedProject?.id ?? 'unknown'}`
      : workspace.kind === 'template'
        ? `template:${workspace.templateId}`
        : null;
  const persistedProjectId = workspace.kind === 'project' ? workspace.projectId : null;
  const chatSidebarVisible = showChat && workspace.kind === 'project' && workspace.chatOpen;

  useFilterPersistence();
  const taskFilter = useTaskFilter();

  const projectStates = useProjectUIStore((state) => state.projectStates);
  const resources = useProjectStore((state) => state.resources);
  const assignments = useProjectStore((state) => state.assignments);
  const progressEntries = useProjectStore((state) => state.progressEntries);
  const parentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.parentId) {
        ids.add(task.parentId);
      }
    }
    return ids;
  }, [tasks]);
  const pendingCommands = useProjectStore((state) => state.pending);
  const assignmentError = useProjectStore((state) => state.assignmentError);
  const replaceAssignmentsForTask = useProjectStore((state) => state.replaceAssignmentsForTask);
  const replaceAssignmentsForTasks = useProjectStore((state) => state.replaceAssignmentsForTasks);
  const replaceProgressEntriesForTask = useProjectStore((state) => state.replaceProgressEntriesForTask);
  const setAssignmentError = useProjectStore((state) => state.setAssignmentError);
  const clearResourcePlannerCache = useProjectStore((state) => state.clearResourcePlannerCache);
  const upsertResource = useProjectStore((state) => state.upsertResource);
  const pendingCommandCount = pendingCommands.length;
  const hasBlockedPendingCommand = pendingCommands.some((command) => command.status === 'conflict' || command.status === 'failed');
  const hasRetryingPendingCommand = pendingCommands.some((command) => command.status === 'retrying');
  const showConnectionIssue = !hasShareToken && isAuthenticated && !displayConnected;
  const [showDelayedSyncStatus, setShowDelayedSyncStatus] = useState(false);
  const [showDelayedSavingStatus, setShowDelayedSavingStatus] = useState(false);
  const showSyncStatus = !hasShareToken && isAuthenticated && (
    showConnectionIssue
    || hasBlockedPendingCommand
    || hasRetryingPendingCommand
    || (pendingCommandCount > 0 && showDelayedSyncStatus)
  );
  const showSavingStatus = !hasShareToken
    && isAuthenticated
    && pendingCommandCount === 0
    && savingState === 'saving'
    && showDelayedSavingStatus;
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
  const projectHiddenTaskListColumnsDefault = useMemo<TaskListColumnId[]>(() => {
    const configuredDefaults = hasShareToken
      ? sharedProject?.hiddenTaskListColumnsDefault
      : (persistedProjectId && authProject?.id === persistedProjectId ? authProject.hiddenTaskListColumnsDefault : null);
    return resolveHiddenTaskListColumns({
      userOverrideInitialized: false,
      projectHiddenTaskListColumnsDefault: configuredDefaults,
    });
  }, [authProject, hasShareToken, persistedProjectId, sharedProject]);
  const hiddenTaskListColumns = useMemo<TaskListColumnId[]>(() => {
    if (!projectId) {
      return [...projectHiddenTaskListColumnsDefault];
    }

    const projectState = projectStates[projectId];
    if (!projectState?.taskListColumnsInitialized) {
      return [...projectHiddenTaskListColumnsDefault];
    }

    return normalizeHiddenTaskListColumns(projectState.hiddenTaskListColumns);
  }, [projectHiddenTaskListColumnsDefault, projectId, projectStates]);
  const taskListColumnWidths = useMemo<TaskListColumnWidthMap>(() => {
    if (!projectId) {
      return TASK_LIST_COLUMN_WIDTHS;
    }

    const storedWidths = normalizeTaskListColumnWidthMap(projectStates[projectId]?.taskListColumnWidths);
    return {
      ...TASK_LIST_COLUMN_WIDTHS,
      ...storedWidths,
    };
  }, [projectId, projectStates]);
  const taskListWidth = useMemo(() => (
    Object.entries(TASK_LIST_COLUMN_WIDTHS).reduce(
      (width, [columnId]) => hiddenTaskListColumns.includes(columnId) ? width : width + (taskListColumnWidths[columnId] ?? 0),
      0,
    )
  ), [hiddenTaskListColumns, taskListColumnWidths]);
  const taskDateChangeMode = useMemo<TaskDateChangeMode>(() => {
    if (!projectId) {
      return 'preserve-duration';
    }

    return projectStates[projectId]?.taskDateChangeMode ?? 'preserve-duration';
  }, [projectId, projectStates]);
  const selectedBaselineState = useMemo(() => {
    if (!projectId) {
      return null;
    }

    return projectStates[projectId]?.selectedBaseline ?? null;
  }, [projectId, projectStates]);

  useEffect(() => {
    if (pendingCommandCount === 0 || hasBlockedPendingCommand || hasRetryingPendingCommand) {
      setShowDelayedSyncStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowDelayedSyncStatus(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [hasBlockedPendingCommand, hasRetryingPendingCommand, pendingCommandCount]);

  useEffect(() => {
    if (savingState !== 'saving' || pendingCommandCount > 0) {
      setShowDelayedSavingStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowDelayedSavingStatus(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [pendingCommandCount, savingState]);
  const selectedBaselineVisible = useMemo(() => {
    if (!projectId) {
      return false;
    }

    const projectState = projectStates[projectId];
    if (!projectState?.selectedBaseline) {
      return false;
    }

    return projectState.selectedBaselineVisible !== false;
  }, [projectId, projectStates]);
  const [baselineMenuOpen, setBaselineMenuOpen] = useState(false);
  const [assignmentSelectionTaskId, setAssignmentSelectionTaskId] = useState<string | null>(null);
  const [selectedAssignmentResourceIds, setSelectedAssignmentResourceIds] = useState<string[]>([]);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [workProgressLoadingTaskIds, setWorkProgressLoadingTaskIds] = useState<Set<string>>(() => new Set());
  const [createAssignmentResourceOpen, setCreateAssignmentResourceOpen] = useState(false);
  const [createAssignmentResourcePending, setCreateAssignmentResourcePending] = useState(false);
  const [createAssignmentResourceError, setCreateAssignmentResourceError] = useState<string | null>(null);
  const ganttSectionRef = useRef<HTMLDivElement | null>(null);
  const [projectShiftOpen, setProjectShiftOpen] = useState(false);
  const [projectShiftPending, setProjectShiftPending] = useState(false);
  const [projectShiftError, setProjectShiftError] = useState<string | null>(null);
  const [projectSettingsPending, setProjectSettingsPending] = useState(false);
  const [projectSettingsError, setProjectSettingsError] = useState<string | null>(null);
  const [undoPreviewEditMode, setUndoPreviewEditMode] = useState(false);
  const [historyBranchConfirmOpen, setHistoryBranchConfirmOpen] = useState(false);
  const [historyBranchConfirmPending, setHistoryBranchConfirmPending] = useState(false);
  const historyBranchConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const historyViewer = useHistoryViewerStore((state) => state.historyViewer);
  const projectSettingsOpen = useUIStore((state) => state.showProjectSettingsModal);
  const setProjectSettingsOpen = useUIStore((state) => state.setShowProjectSettingsModal);
  const previewModeActive = historyViewer.mode === 'preview';
  const effectiveTasks = historyViewer.mode === 'preview'
    ? historyViewer.snapshot.tasks
    : tasks;
  const previewRendering = previewState === 'rendering';
  const previewFailed = previewState === 'failed';
  const aiMutationLocked = aiMutationLock.active;
  const canOpenChatFromLoader = showChat && !chatSidebarVisible && !hasShareToken && Boolean(onToggleChat);
  const effectiveReadOnly = readOnly || aiMutationLocked || previewRendering || previewFailed || (previewModeActive && !undoPreviewEditMode);
  const historyPanelDisabled = readOnly || aiMutationLocked || previewRendering || previewFailed || !accessToken;
  const hasRenderableChart = effectiveTasks.length > 0 || effectiveReadOnly;
  const effectiveDisableTaskDrag = effectiveReadOnly || disableTaskDrag;
  const shareSelectionActive = shareSelectionMode && !effectiveReadOnly;
  const templateSelectionActive = templateSelectionMode && !effectiveReadOnly;
  const externalSelectionActive = shareSelectionActive || templateSelectionActive;
  const effectiveChatDisabled = chatDisabled || previewModeActive;
  const effectiveChatDisabledReason = previewModeActive
    ? 'Только чтение. Вернитесь к текущей версии, чтобы продолжить.'
    : chatDisabledReason;
  const projectDateRange = useMemo(() => getProjectDateRange(effectiveTasks), [effectiveTasks]);
  const projectDurationLabel = useMemo(() => {
    if (!projectDateRange) {
      return null;
    }

    return `${formatProjectRangeDate(projectDateRange.start)} - ${formatProjectRangeDate(projectDateRange.end)} (${formatProjectDurationDays(projectDateRange.durationDays)})`;
  }, [projectDateRange]);
  const handleSetDisableTaskDrag = useCallback((enabled: boolean) => {
    if (!projectId || effectiveReadOnly) return;
    setProjectState(projectId, { disableTaskDrag: enabled });
  }, [effectiveReadOnly, projectId, setProjectState]);
  const persistTaskListColumnOverride = useCallback(async (hiddenColumns: string[] | null) => {
    if (!persistedProjectId || !isAuthenticated) {
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem('gantt_access_token') || accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      return;
    }

    const doRequest = async (requestToken: string) => fetch(
      `/api/projects/${persistedProjectId}/task-list-columns/override`,
      {
        method: hiddenColumns === null ? 'DELETE' : 'PUT',
        headers: hiddenColumns === null
          ? { Authorization: `Bearer ${requestToken}` }
          : {
              Authorization: `Bearer ${requestToken}`,
              'Content-Type': 'application/json',
            },
        body: hiddenColumns === null ? undefined : JSON.stringify({ hiddenTaskListColumns: hiddenColumns }),
      },
    );

    let response = await doRequest(token);
    if (response.status === 401) {
      const refreshedToken = await useAuthStore.getState().refreshAccessToken();
      if (!refreshedToken) {
        return;
      }
      token = localStorage.getItem('gantt_access_token') || refreshedToken;
      response = await doRequest(token);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }, [accessToken, isAuthenticated, persistedProjectId]);

  const handleToggleTaskListColumn = useCallback((columnId: string) => {
    if (!projectId || !KNOWN_TASK_LIST_COLUMN_IDS.has(columnId)) {
      return;
    }

    const currentProjectState = getProjectState(projectId);
    const currentColumns = currentProjectState?.taskListColumnsInitialized
      ? (currentProjectState.hiddenTaskListColumns ?? [])
      : hiddenTaskListColumns;
    const currentSet = new Set(Array.isArray(currentColumns) ? currentColumns : []);
    if (currentSet.has(columnId)) {
      currentSet.delete(columnId);
    } else {
      currentSet.add(columnId);
    }

    setProjectState(projectId, {
      taskListColumnsInitialized: true,
      hiddenTaskListColumns: Array.from(currentSet).filter((id) => KNOWN_TASK_LIST_COLUMN_IDS.has(id)),
    });
    void persistTaskListColumnOverride(Array.from(currentSet).filter((id) => KNOWN_TASK_LIST_COLUMN_IDS.has(id)));
  }, [getProjectState, hiddenTaskListColumns, persistTaskListColumnOverride, projectId, setProjectState]);

  const handleSetAllTaskListColumnsVisible = useCallback((visible: boolean) => {
    if (!projectId) {
      return;
    }

    const nextHiddenColumns = visible ? [] : TASK_LIST_COLUMN_ROWS.map((column) => column.id);
    setProjectState(projectId, {
      taskListColumnsInitialized: true,
      hiddenTaskListColumns: nextHiddenColumns,
    });
    void persistTaskListColumnOverride(nextHiddenColumns);
  }, [persistTaskListColumnOverride, projectId, setProjectState]);

  const handleResetTaskListColumnOverride = useCallback(() => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskListColumnsInitialized: false,
      hiddenTaskListColumns: [],
    });
    void persistTaskListColumnOverride(null);
  }, [persistTaskListColumnOverride, projectId, setProjectState]);

  const handleTaskDateChangeModeChange = useCallback((mode: TaskDateChangeMode) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskDateChangeMode: mode,
    });
  }, [projectId, setProjectState]);
  const handleTaskListColumnWidthsChange = useCallback((widths: TaskListColumnWidthMap) => {
    if (!projectId) {
      return;
    }

    setProjectState(projectId, {
      taskListColumnWidths: normalizeTaskListColumnWidthMap(widths),
    });
  }, [projectId, setProjectState]);

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
  const [splitTaskDraft, setSplitTaskDraft] = useState<Task | null>(null);
  const [taskChatDraft, setTaskChatDraft] = useState<Task | null>(null);
  const {
    items: historyItems,
    loading: historyLoading,
    error: historyError,
    previewingGroupId,
    restoringGroupId,
    showVersion,
    showVersionById,
    refreshHistory,
    restoreVersion,
    returnToCurrentVersion,
  } = useProjectHistory(accessToken, Boolean(accessToken && workspace.kind === 'project'));
  const {
    items: baselineItems,
    loading: baselinesLoading,
    error: baselinesError,
    activeBaselineId,
    refreshBaselines,
    fetchBaseline,
    createFromCurrent,
    creatingFromCurrent,
    creatingFromHistoryGroupId,
    deleteBaseline,
    deletingBaselineId,
    createFromHistory,
    renamingBaselineId,
    updateBaseline,
  } = useProjectBaselines(accessToken);
  const hasBaselineAccess = Boolean(accessToken && workspace.kind === 'project');
  const selectedBaselineLabel = selectedBaselineState?.label ?? null;
  const selectedBaselineSnapshot = useMemo(() => {
    if (!selectedBaselineState) {
      return null;
    }

    return {
      tasks: Array.isArray(selectedBaselineState.snapshot.tasks)
        ? selectedBaselineState.snapshot.tasks as Task[]
        : [],
      dependencies: Array.isArray(selectedBaselineState.snapshot.dependencies)
        ? selectedBaselineState.snapshot.dependencies as BaselineSnapshotResponse['snapshot']['dependencies']
        : [],
      resources: Array.isArray(selectedBaselineState.snapshot.resources)
        ? selectedBaselineState.snapshot.resources as BaselineSnapshotResponse['snapshot']['resources']
        : [],
      assignments: Array.isArray(selectedBaselineState.snapshot.assignments)
        ? selectedBaselineState.snapshot.assignments as BaselineSnapshotResponse['snapshot']['assignments']
        : [],
    } satisfies BaselineSnapshotResponse['snapshot'];
  }, [selectedBaselineState]);
  const selectedBaselineTaskCount = selectedBaselineSnapshot?.tasks.length ?? 0;
  const effectiveTasksWithBaseline = useMemo(() => {
    if (!selectedBaselineSnapshot || !selectedBaselineVisible) {
      return effectiveTasks;
    }

    const baselineById = new Map(
      selectedBaselineSnapshot.tasks.map((task) => [task.id, task]),
    );

    return effectiveTasks.map((task) => {
      const baselineTask = baselineById.get(task.id);
      if (!baselineTask?.startDate || !baselineTask?.endDate) {
        return task;
      }

      return {
        ...task,
        baselineStartDate: baselineTask.startDate,
        baselineEndDate: baselineTask.endDate,
      } satisfies Task;
    });
  }, [effectiveTasks, selectedBaselineSnapshot, selectedBaselineVisible]);
  const baselineRows = useMemo(() => {
    const rows = baselineItems.map((item) => ({
      id: item.id,
      label: item.name || 'Без названия',
      selected: item.id === selectedBaselineState?.id,
    }));

    if (selectedBaselineState && !rows.some((row) => row.id === selectedBaselineState.id)) {
      rows.unshift({
        id: selectedBaselineState.id,
        label: selectedBaselineState.label || 'Без названия',
        selected: true,
      });
    }

    return rows;
  }, [baselineItems, selectedBaselineState]);
  const customDays = useMemo(() => buildCustomDays(calendarDays), [calendarDays]);
  const weekendPredicate = useMemo(
    () => getProjectWeekendPredicate(calendarWeeklyPattern, calendarDays),
    [calendarDays, calendarWeeklyPattern],
  );

  useEffect(() => {
    const previousMode = previousGanttDayModeRef.current;
    if (previousMode === ganttDayMode) {
      return;
    }

    previousGanttDayModeRef.current = ganttDayMode;

    if (effectiveReadOnly) {
      return;
    }

    if (previewModeActive) {
      return;
    }

    if (tasks.length === 0) {
      return;
    }

    const reflowedTasks = reflowTasksOnModeSwitch(tasks, ganttDayMode === 'business', weekendPredicate) as Task[];

    if (!batchUpdate) {
      setTasks(reflowedTasks);
      return;
    }
  }, [batchUpdate, effectiveReadOnly, ganttDayMode, previewModeActive, setTasks, tasks, weekendPredicate]);

  const handleAppendTaskToChat = useCallback((task: Task) => {
    setChatComposerDraft(buildTaskChatMention(task));
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
  }, [setChatComposerDraft, setWorkspace]);

  const handleTaskReferenceClick = useCallback((taskId: string) => {
    setTempHighlightedTaskId(taskId);
    window.setTimeout(() => {
      if (useUIStore.getState().tempHighlightedTaskId === taskId) {
        useUIStore.getState().setTempHighlightedTaskId(null);
      }
    }, 2000);

    if (typeof ganttRef.current?.scrollToRow === 'function') {
      ganttRef.current.scrollToRow(taskId, { behavior: 'auto' });
    }
    if (typeof ganttRef.current?.scrollToTask === 'function') {
      window.requestAnimationFrame(() => {
        ganttRef.current?.scrollToTask(taskId);
      });
    }
  }, [ganttRef, setTempHighlightedTaskId]);

  useEffect(() => () => {
    historyBranchConfirmResolverRef.current?.(false);
    historyBranchConfirmResolverRef.current = null;
  }, []);

  useEffect(() => {
    const correctionTarget = consumePlannerCorrectionTarget((target) => {
      if (!projectId || target.projectId !== projectId || !target.taskId) {
        return false;
      }
      return true;
    });
    if (!correctionTarget) {
      return;
    }

    handleTaskReferenceClick(correctionTarget.taskId);
  }, [consumePlannerCorrectionTarget, handleTaskReferenceClick, projectId]);

  const handleSplitTaskSubmit = useCallback(async (payload: SplitTaskSubmitPayload) => {
    if (!splitTaskDraft || !onSplitTask) {
      return {
        accepted: false,
        message: 'Не удалось определить задачу для разбиения.',
      };
    }

    return await Promise.resolve(onSplitTask(splitTaskDraft, payload));
  }, [onSplitTask, splitTaskDraft]);

  const applyTaskWorkMutation = useCallback((updatedTask: Task, nextEntries?: TaskProgressEntry[]) => {
    setTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)));

    const projectStoreState = useProjectStore.getState();
    projectStoreState.mergeConfirmedSnapshot({
      ...projectStoreState.confirmed.snapshot,
      tasks: projectStoreState.confirmed.snapshot.tasks.map((task) => (
        task.id === updatedTask.id ? { ...task, ...updatedTask } : task
      )),
    });

    if (nextEntries) {
      replaceProgressEntriesForTask(updatedTask.id, nextEntries);
    }
  }, [replaceProgressEntriesForTask, setTasks]);

  const applyTaskWorkMutations = useCallback((updatedTasks: Task[], nextEntries?: TaskProgressEntry[]) => {
    const taskMap = new Map(updatedTasks.map((task) => [task.id, task]));
    setTasks((prev) => prev.map((task) => taskMap.get(task.id) ?? task));

    const projectStoreState = useProjectStore.getState();
    projectStoreState.mergeConfirmedSnapshot({
      ...projectStoreState.confirmed.snapshot,
      tasks: projectStoreState.confirmed.snapshot.tasks.map((task) => {
        const updatedTask = taskMap.get(task.id);
        return updatedTask ? { ...task, ...updatedTask } : task;
      }),
    });

    if (nextEntries) {
      const taskIds = new Set(updatedTasks.map((task) => task.id));
      for (const currentTaskId of taskIds) {
        replaceProgressEntriesForTask(
          currentTaskId,
          nextEntries.filter((entry) => entry.taskId === currentTaskId),
        );
      }
    }
  }, [replaceProgressEntriesForTask, setTasks]);

  const handleUpdateTaskStatus = useCallback(async (
    task: Task,
    status: 'not_started' | 'in_progress' | 'done' | 'closed',
  ) => {
    if (parentTaskIds.has(task.id)) {
      throw new Error('Статус можно менять только у конечных задач.');
    }

    if (!accessToken || workspace.kind !== 'project') {
      const allNextEntries: TaskProgressEntry[] = [...progressEntries];
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0] ?? '';
      const resolvedTasks = [task].map((currentTask) => {
        let resolvedTask: Task = { ...currentTask, status };

        if (status === 'done') {
          const targetCompletedVolume = currentTask.workVolume && currentTask.workVolume > 0
            ? currentTask.workVolume
            : (currentTask.completedVolume ?? 0);
          const delta = targetCompletedVolume - (currentTask.completedVolume ?? 0);
          if (currentTask.workVolume && currentTask.workVolume > 0 && Math.abs(delta) > 0.000001) {
            const currentEntries = allNextEntries.filter((entry) => entry.taskId === currentTask.id);
            const existingTodayEntry = currentEntries.find((entry) => entry.entryDate === today);
            const replacementEntries = existingTodayEntry
              ? currentEntries.map((entry) => (
                entry.id === existingTodayEntry.id
                  ? { ...entry, amount: entry.amount + delta, updatedAt: now }
                  : entry
              ))
              : [
                ...currentEntries,
                {
                  id: `local-status:${currentTask.id}:${today}`,
                  projectId: projectId ?? 'local',
                  taskId: currentTask.id,
                  entryDate: today,
                  amount: delta,
                  createdAt: now,
                  updatedAt: now,
                },
              ];

            for (let index = allNextEntries.length - 1; index >= 0; index -= 1) {
              if (allNextEntries[index]?.taskId === currentTask.id) {
                allNextEntries.splice(index, 1);
              }
            }
            allNextEntries.push(...replacementEntries);
          }

          resolvedTask = {
            ...resolvedTask,
            progress: 100,
            completedVolume: targetCompletedVolume,
          };
        }

        return resolvedTask;
      });

      applyTaskWorkMutations(resolvedTasks, allNextEntries);
      return { task: resolvedTasks[0] ?? task };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status }),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: {
        workVolume: number | null;
        workUnit: string | null;
        completedVolume: number;
        status: 'not_started' | 'in_progress' | 'done' | 'closed';
        progress: number;
      };
      progressEntries?: TaskProgressEntry[];
      affectedTasks?: Task[];
      affectedProgressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    if (body.affectedTasks?.length) {
      applyTaskWorkMutations(body.affectedTasks, body.affectedProgressEntries);
    } else {
      applyTaskWorkMutation(resolvedTask, body.progressEntries);
    }

    return { task: resolvedTask };
  }, [accessToken, applyTaskWorkMutation, applyTaskWorkMutations, parentTaskIds, progressEntries, projectId, workspace.kind]);

  const handleUpdateTaskWorkMetadata = useCallback(async (
    task: Task,
    patch: { workVolume?: number | null; workUnit?: string | null },
  ) => {
    if (!accessToken || workspace.kind !== 'project') {
      const nextTask = {
        ...task,
        ...(patch.workVolume !== undefined ? { workVolume: patch.workVolume } : {}),
        ...(patch.workUnit !== undefined ? { workUnit: patch.workUnit } : {}),
      };
      const nextProgress = nextTask.workVolume && nextTask.workVolume > 0
        ? clampPercent(((nextTask.completedVolume ?? 0) / nextTask.workVolume) * 100)
        : 0;
      const resolvedTask = {
        ...nextTask,
        status: deriveTaskStatusFromProgress(task.status, nextProgress),
        progress: nextProgress,
      };
      applyTaskWorkMutation(resolvedTask);
      return { task: resolvedTask };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/work-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { workVolume: number | null; workUnit: string | null; completedVolume: number; status: 'not_started' | 'in_progress' | 'done' | 'closed'; progress: number };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, workspace.kind]);

  const handleAddTaskProgressEntry = useCallback(async (
    task: Task,
    input: { entryDate: string; value: number; inputMode: 'volume' | 'percent' },
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspace.kind !== 'project') {
      const nextAmount = input.inputMode === 'percent'
        ? task.workVolume * (input.value / 100)
        : input.value;
      const existingEntries = progressEntries.filter((entry) => entry.taskId === task.id);
      const currentEntry = existingEntries.find((entry) => entry.entryDate === input.entryDate);
      const now = new Date().toISOString();
      const nextEntries = currentEntry
        ? existingEntries.map((entry) => (
          entry.id === currentEntry.id
            ? { ...entry, amount: entry.amount + nextAmount, updatedAt: now }
            : entry
        ))
        : [
          ...existingEntries,
          {
            id: `local:${task.id}:${input.entryDate}`,
            projectId: projectId ?? 'local',
            taskId: task.id,
            entryDate: input.entryDate,
            amount: nextAmount,
            createdAt: now,
            updatedAt: now,
          },
        ];
      const completedVolume = nextEntries.reduce((sum, entry) => sum + entry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, projectId, workspace.kind]);

  const handleUpdateTaskProgressEntry = useCallback(async (
    task: Task,
    entry: TaskProgressEntry,
    input: { entryDate: string; amount: number },
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspace.kind !== 'project') {
      const existingEntries = progressEntries.filter((progressEntry) => progressEntry.taskId === task.id);
      const duplicateEntry = existingEntries.find((progressEntry) => (
        progressEntry.id !== entry.id && progressEntry.entryDate === input.entryDate
      ));
      if (duplicateEntry) {
        throw new Error('На эту дату уже есть запись.');
      }

      const now = new Date().toISOString();
      const nextEntries = existingEntries.map((progressEntry) => (
        progressEntry.id === entry.id
          ? { ...progressEntry, entryDate: input.entryDate, amount: input.amount, updatedAt: now }
          : progressEntry
      ));
      const completedVolume = nextEntries.reduce((sum, progressEntry) => sum + progressEntry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, workspace.kind]);

  const handleDeleteTaskProgressEntry = useCallback(async (
    task: Task,
    entry: TaskProgressEntry,
  ) => {
    if (!task.workVolume || task.workVolume <= 0) {
      throw new Error('Сначала задайте общий объём работы.');
    }

    if (!accessToken || workspace.kind !== 'project') {
      const nextEntries = progressEntries.filter((progressEntry) => (
        progressEntry.taskId === task.id && progressEntry.id !== entry.id
      ));
      const completedVolume = nextEntries.reduce((sum, progressEntry) => sum + progressEntry.amount, 0);
      const resolvedTask: Task = {
        ...task,
        completedVolume,
        status: deriveTaskStatusFromProgress(task.status, clampPercent((completedVolume / task.workVolume) * 100)),
        progress: clampPercent((completedVolume / task.workVolume) * 100),
      };
      applyTaskWorkMutation(resolvedTask, nextEntries);
      return { task: resolvedTask, progressEntries: nextEntries };
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/progress-entries/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      task?: { completedVolume: number; progress: number; workVolume: number | null; workUnit: string | null; status: 'not_started' | 'in_progress' | 'done' | 'closed' };
      progressEntries?: TaskProgressEntry[];
    } | null;

    if (!response.ok || !body?.task) {
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const resolvedTask: Task = {
      ...task,
      workVolume: body.task.workVolume,
      workUnit: body.task.workUnit,
      completedVolume: body.task.completedVolume,
      status: body.task.status,
      progress: body.task.progress,
    };
    applyTaskWorkMutation(resolvedTask, body.progressEntries);
    return { task: resolvedTask, progressEntries: body.progressEntries };
  }, [accessToken, applyTaskWorkMutation, progressEntries, workspace.kind]);

  const runWithWorkProgressLoader = useCallback(async <T,>(taskId: string, action: () => Promise<T>): Promise<T> => {
    setWorkProgressLoadingTaskIds((current) => new Set(current).add(taskId));
    try {
      return await action();
    } finally {
      setWorkProgressLoadingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, []);

  const applyProgressColumnVolumeDeltas = useCallback(async (changedTasks: Task[]): Promise<Task[]> => {
    const passthroughTasks: Task[] = [];

    for (const changedTask of changedTasks) {
      const originalTask = tasks.find((task) => task.id === changedTask.id);
      const originalProgress = originalTask?.progress ?? 0;
      const nextProgress = changedTask.progress ?? 0;
      const progressChanged = Math.abs(nextProgress - originalProgress) > 0.0001;

      if (!originalTask || !progressChanged) {
        passthroughTasks.push(changedTask);
        continue;
      }

      if (parentTaskIds.has(originalTask.id)) {
        const normalizedProgress = nextProgress >= 100 ? 100 : 0;
        passthroughTasks.push({
          ...changedTask,
          progress: normalizedProgress,
          status: deriveTaskStatusFromProgress(originalTask.status, normalizedProgress),
        });
        continue;
      }

      if (!originalTask.workVolume || originalTask.workVolume <= 0) {
        passthroughTasks.push({
          ...changedTask,
          progress: clampPercent(nextProgress),
          status: deriveTaskStatusFromProgress(originalTask.status, clampPercent(nextProgress)),
        });
        continue;
      }

      const currentPercent = ((originalTask.completedVolume ?? 0) / originalTask.workVolume) * 100;
      const targetPercent = clampPercent(nextProgress);
      const deltaAmount = ((targetPercent - currentPercent) / 100) * originalTask.workVolume;

      if (Math.abs(deltaAmount) < 0.000001) {
        continue;
      }

      const sanitizedTask = { ...changedTask, progress: originalProgress };
      const hasOnlyProgressChange = Object.keys(changedTask).every((key) => {
        const taskKey = key as keyof Task;
        return taskKey === 'progress' || changedTask[taskKey] === originalTask[taskKey];
      });

      if (!hasOnlyProgressChange) {
        passthroughTasks.push(sanitizedTask);
      }

      await runWithWorkProgressLoader(originalTask.id, async () => {
        await handleAddTaskProgressEntry(originalTask, {
          entryDate: new Date().toISOString().split('T')[0] ?? '',
          value: Number(deltaAmount.toFixed(6)),
          inputMode: 'volume',
        });
      });
    }

    return passthroughTasks;
  }, [handleAddTaskProgressEntry, parentTaskIds, runWithWorkProgressLoader, tasks]);

  const activeResources = useMemo(
    () => getAssignableResources(resources, workspace.kind === 'project' ? workspace.projectId : null),
    [resources, workspace],
  );
  const selectedAssignmentTask = useMemo(
    () => assignmentSelectionTaskId
      ? tasks.find((task) => task.id === assignmentSelectionTaskId) ?? null
      : null,
    [assignmentSelectionTaskId, tasks],
  );

  const selectedAssignmentResourceGroups = useMemo(
    () => getTaskAssignmentResourceGroups(assignmentSelectionTaskId, resources, assignments),
    [assignmentSelectionTaskId, assignments, resources],
  );

  const openAssignmentSelector = useCallback((task: Task) => {
    if (effectiveReadOnly) {
      return;
    }

    const activeResourceIds = new Set(activeResources.map((resource) => resource.id));
    const initialSelection = getInitialSelectedResourceIds(task.id, resources, assignments)
      .filter((resourceId) => activeResourceIds.has(resourceId));

    setAssignmentSelectionTaskId(task.id);
    setSelectedAssignmentResourceIds(initialSelection);
    setAssignmentSubmitting(false);
    setAssignmentError(null);
  }, [activeResources, assignments, effectiveReadOnly, resources, setAssignmentError]);

  const closeAssignmentSelector = useCallback(() => {
    setAssignmentSelectionTaskId(null);
    setSelectedAssignmentResourceIds([]);
    setAssignmentSubmitting(false);
    setCreateAssignmentResourceOpen(false);
    setCreateAssignmentResourcePending(false);
    setCreateAssignmentResourceError(null);
  }, []);

  const handleAssignmentResourceChange = useCallback((resourceIds: string[]) => {
    setSelectedAssignmentResourceIds(resourceIds);
    setAssignmentError(null);
  }, [setAssignmentError]);

  const handleOpenPlannerAssignment = useCallback((assignmentView: { assignment: { id: string } }) => {
    if (!projectId || workspace.kind !== 'project') {
      return;
    }

    setProjectState(projectId, {
      activeWorkspace: 'planner',
      plannerSelectedAssignmentId: assignmentView.assignment.id,
    });
    setWorkspace({ kind: 'planner', projectId });
  }, [projectId, setProjectState, setWorkspace, workspace.kind]);

  const handleCreateAssignmentResource = useCallback(async (input: { name: string; type: ResourceType; scope: ResourceScope }) => {
    if (!accessToken || effectiveReadOnly || workspace.kind !== 'project') {
      return;
    }

    setCreateAssignmentResourcePending(true);
    setCreateAssignmentResourceError(null);

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: input.name,
          type: input.type,
          scope: input.scope,
          projectId: workspace.projectId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const issueCode = body && typeof body === 'object' && 'issue' in body && body.issue && typeof body.issue === 'object' && 'code' in body.issue
          ? body.issue.code
          : null;
        if (issueCode === 'resource_limit_reached') {
          await onOpenLimitModal?.({
            code: 'RESOURCE_POOL_FEATURE_LOCKED',
            limitKey: 'resource_pool',
            reasonCode: 'feature_disabled',
            remaining: null,
            plan: 'free',
            planLabel: 'Бесплатный',
            upgradeHint: 'На бесплатном тарифе можно создать до 3 ресурсов. Обновите тариф, чтобы снять этот лимит.',
          });
          return;
        }
        const errorMessage = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const created = normalizeProjectResource(body);
      if (!created) {
        throw new Error('Resource payload was malformed.');
      }

      upsertResource(created);
      clearResourcePlannerCache();
      setSelectedAssignmentResourceIds((current) => (
        created.isActive && !current.includes(created.id)
          ? [...current, created.id]
          : current
      ));
      setCreateAssignmentResourceOpen(false);
    } catch (error) {
      setCreateAssignmentResourceError(error instanceof Error ? error.message : 'Не удалось создать ресурс.');
    } finally {
      setCreateAssignmentResourcePending(false);
    }
  }, [accessToken, clearResourcePlannerCache, effectiveReadOnly, onOpenLimitModal, upsertResource, workspace]);

  const handleAssignResources = useCallback(async (task: Task, selectedResourceIds: string[]) => {
    if (!accessToken || effectiveReadOnly) {
      return;
    }

    const nextResourceIds = Array.from(new Set(selectedResourceIds.map((resourceId) => resourceId.trim()).filter(Boolean)));

    const state = useProjectStore.getState();
    const activeResourceIds = new Set(
      getAssignableResources(state.resources, workspace.kind === 'project' ? workspace.projectId : null)
        .map((resource) => resource.id),
    );
    if (nextResourceIds.some((resourceId) => !activeResourceIds.has(resourceId))) {
      setAssignmentError('invalid_resource_selection: Можно назначить только активный ресурс текущего проекта.');
      return;
    }
    const childLeafIds = collectDescendantLeafIds(tasks, task.id);
    const isParentTask = childLeafIds.length > 0;
    const endpoint = isParentTask
      ? `/api/tasks/${task.id}/assignments/materialize`
      : `/api/tasks/${task.id}/assignments`;

    setAssignmentError(null);
    setAssignmentSubmitting(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resourceIds: nextResourceIds }),
      });

      const data = await response.json().catch(() => ({})) as {
        error?: string;
        issue?: { code?: string };
        taskAssignments?: Array<{ assignments: TaskAssignmentRecord[] }>;
        assignments?: TaskAssignmentRecord[];
      };

      if (!response.ok) {
        const issueCode = data.issue?.code;
        setAssignmentError(issueCode ? `${issueCode}: ${data.error ?? 'assignment failed'}` : (data.error ?? `HTTP ${response.status}`));
        return;
      }

      if (isParentTask) {
        const nextAssignments = Array.isArray(data.taskAssignments)
          ? data.taskAssignments.flatMap((entry) => Array.isArray(entry.assignments) ? entry.assignments : [])
          : null;
        if (!nextAssignments) {
          setAssignmentError('malformed_assignment_response: Сервер вернул назначения в неизвестном формате.');
          return;
        }
        replaceAssignmentsForTasks(childLeafIds, nextAssignments);
        clearResourcePlannerCache();
      } else {
        if (!Array.isArray(data.assignments)) {
          setAssignmentError('malformed_assignment_response: Сервер вернул назначения в неизвестном формате.');
          return;
        }
        const nextAssignments = data.assignments;
        replaceAssignmentsForTask(task.id, nextAssignments);
        clearResourcePlannerCache();
      }

      setAssignmentError(null);
      setAssignmentSelectionTaskId(null);
      setSelectedAssignmentResourceIds([]);
    } catch {
      setAssignmentError('network_failure: Не удалось сохранить назначения ресурсов.');
    } finally {
      setAssignmentSubmitting(false);
    }
  }, [accessToken, clearResourcePlannerCache, effectiveReadOnly, replaceAssignmentsForTask, replaceAssignmentsForTasks, setAssignmentError, tasks, workspace]);

  const taskListMenuCommands = useMemo<TaskListMenuCommand<Task>[]>(() => {
    if (effectiveReadOnly || externalSelectionActive || chatDisabled) {
      return [];
    }

    const commands: TaskListMenuCommand<Task>[] = [
      {
        id: 'assign-resource',
        label: 'Назначить ресурс',
        icon: <Users className="h-4 w-4" />,
        onSelect: (row) => openAssignmentSelector(row),
      },
    ];

    if (showChat) {
      commands.push({
        id: 'send-task-to-chat',
        label: 'Выполнить...',
        icon: <WandSparkles className="h-4 w-4" />,
        divider: 'top',
        onSelect: (row) => setTaskChatDraft(row),
      });
    }

    if (onSplitTask) {
      commands.push({
        id: 'split-task-with-ai',
        label: 'Разбить задачу...',
        icon: <ListTree className="h-4 w-4" />,
        divider: showChat ? undefined : 'top',
        scope: 'linear',
        onSelect: (row) => setSplitTaskDraft(row),
      });
    }

    if (onInsertTemplateAtTask) {
      commands.push({
        id: 'insert-template-at-task',
        label: 'Вставить шаблон...',
        icon: <ToyBrick className="h-4 w-4" />,
        divider: 'top',
        scope: 'linear',
        onSelect: (row) => { void onInsertTemplateAtTask(row); },
      });
    }

    if (onCreateTemplateFromTask) {
      commands.push({
        id: 'create-template-from-task',
        label: 'Сохранить шаблон...',
        icon: <SaveTemplateIcon className="h-4 w-4" />,
        onSelect: (row) => { void onCreateTemplateFromTask(row); },
      });
    }

    return commands;
  }, [chatDisabled, effectiveReadOnly, externalSelectionActive, onCreateTemplateFromTask, onInsertTemplateAtTask, onSplitTask, showChat, openAssignmentSelector]);

  const additionalColumns = useMemo<TaskListColumn<Task>[]>(() => {
    const columns: TaskListColumn<Task>[] = [
      ...createTaskWorkColumns({
        progressEntries,
        loadingTaskIds: workProgressLoadingTaskIds,
        parentTaskIds,
        readOnly: effectiveReadOnly || shareSelectionActive,
        onUpdateWorkMetadata: handleUpdateTaskWorkMetadata,
        onAddProgressEntry: handleAddTaskProgressEntry,
        onUpdateProgressEntry: handleUpdateTaskProgressEntry,
        onDeleteProgressEntry: handleDeleteTaskProgressEntry,
      }),
      ...createTaskStatusColumn({
        parentTaskIds,
        readOnly: effectiveReadOnly || shareSelectionActive,
        onUpdateStatus: handleUpdateTaskStatus,
      }),
    ];

    if (showResourceAssignments) {
      columns.push(
        createAssignedResourcesColumn({
          resources,
          assignments,
          editable: !effectiveReadOnly && !shareSelectionActive,
          readOnly: effectiveReadOnly || shareSelectionActive,
          width: taskListColumnWidths['assigned-resources'] ?? TASK_LIST_COLUMN_WIDTHS['assigned-resources'],
          onEdit: openAssignmentSelector,
        }),
      );
    }

    return columns;
  }, [
    assignments,
    effectiveReadOnly,
    handleAddTaskProgressEntry,
    handleDeleteTaskProgressEntry,
    handleUpdateTaskStatus,
    handleUpdateTaskProgressEntry,
    handleUpdateTaskWorkMetadata,
    openAssignmentSelector,
    parentTaskIds,
    progressEntries,
    resources,
    shareSelectionActive,
    showResourceAssignments,
    taskListColumnWidths,
    workProgressLoadingTaskIds,
  ]);

  const latestRestorableItem = useMemo(
    () => historyItems.find((item) => item.canRestore) ?? null,
    [historyItems],
  );
  const undoLoading = Boolean(previewingGroupId);
  const previewHistoryItem = useMemo(
    () => historyViewer.mode === 'preview'
      ? historyItems.find((item) => item.id === historyViewer.groupId) ?? null
      : null,
    [historyItems, historyViewer],
  );
  const previewHistoryLabel = previewHistoryItem
    ? formatHistoryVersionTimestamp(previewHistoryItem.createdAt)
    : null;
  const historyItemsById = useMemo(
    () => new Map(historyItems.map((item) => [item.id, item])),
    [historyItems],
  );
  const chatMessages = useMemo(
    () => messages.map((message) => {
      const historyItem = message.historyGroupId ? historyItemsById.get(message.historyGroupId) : null;
      return {
        ...message,
        checkpointLabel: message.role === 'user' && message.historyGroupId
          ? buildCheckpointLabel(message.historyGroupId, historyItem?.createdAt)
          : null,
        canPreviewHistory: message.role === 'user' && Boolean(message.historyGroupId),
        canRestoreHistory: message.role === 'user' && Boolean(message.historyGroupId && historyItem?.canRestore),
        previewLoading: previewingGroupId === message.historyGroupId,
        restoreLoading: restoringGroupId === message.historyGroupId,
      };
    }),
    [historyItemsById, messages, previewingGroupId, restoringGroupId],
  );

  const previewHistoryIndex = useMemo(
    () => historyViewer.mode === 'preview'
      ? historyItems.findIndex((item) => item.id === historyViewer.groupId)
      : -1,
    [historyItems, historyViewer],
  );
  const nextUndoPreviewItem = useMemo(
    () => previewHistoryIndex >= 0
      ? historyItems.slice(previewHistoryIndex + 1).find((item) => item.canRestore) ?? null
      : latestRestorableItem,
    [historyItems, latestRestorableItem, previewHistoryIndex],
  );

  const handleUndoLatest = useCallback(() => {
    if (!accessToken || readOnly || aiMutationLocked || previewRendering || previewFailed || historyLoading) {
      return;
    }

    if (!nextUndoPreviewItem) {
      return;
    }

    setUndoPreviewEditMode(true);
    void showVersion(nextUndoPreviewItem);
  }, [accessToken, aiMutationLocked, historyLoading, nextUndoPreviewItem, previewFailed, previewRendering, readOnly, showVersion]);

  const handleRedoLatest = useCallback(() => {
    if (!accessToken || readOnly || aiMutationLocked || previewRendering || previewFailed || historyLoading || previewHistoryIndex < 0) {
      return;
    }

    const targetItem = historyItems[previewHistoryIndex - 1];
    if (targetItem) {
      setUndoPreviewEditMode(true);
      void showVersion(targetItem);
      return;
    }

    setUndoPreviewEditMode(false);
    returnToCurrentVersion();
  }, [accessToken, aiMutationLocked, historyItems, historyLoading, previewFailed, previewHistoryIndex, previewRendering, readOnly, returnToCurrentVersion, showVersion]);

  const requestHistoryBranchConfirmation = useCallback(() => new Promise<boolean>((resolve) => {
    historyBranchConfirmResolverRef.current = resolve;
    setHistoryBranchConfirmOpen(true);
  }), []);

  const closeHistoryBranchConfirmation = useCallback((confirmed: boolean) => {
    historyBranchConfirmResolverRef.current?.(confirmed);
    historyBranchConfirmResolverRef.current = null;
    if (!confirmed) {
      setHistoryBranchConfirmOpen(false);
    }
  }, []);

  const prepareUndoPreviewForEdit = useCallback(async () => {
    if (!undoPreviewEditMode || historyViewer.mode !== 'preview') {
      return true;
    }

    const confirmed = await requestHistoryBranchConfirmation();
    if (!confirmed) {
      return false;
    }

    try {
      setHistoryBranchConfirmPending(true);
      await restoreVersion(historyViewer.groupId);
      setUndoPreviewEditMode(false);
      return true;
    } finally {
      setHistoryBranchConfirmPending(false);
      setHistoryBranchConfirmOpen(false);
    }
  }, [historyViewer, requestHistoryBranchConfirmation, restoreVersion, undoPreviewEditMode]);

  const guardedBatchUpdate = useMemo(() => {
    if (!batchUpdate) {
      return null;
    }

    return {
      ...batchUpdate,
      handleTasksChange: async (changedTasks: Task[]) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        const passthroughTasks = await applyProgressColumnVolumeDeltas(changedTasks);
        if (passthroughTasks.length > 0) {
          await batchUpdate.handleTasksChange(passthroughTasks);
        }
      },
      handleShiftProject: async (deltaDays: number) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleShiftProject(deltaDays);
      },
      handleAdd: async (task: Task) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleAdd(task);
      },
      handleDelete: async (taskId: string) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleDelete(taskId);
      },
      handleInsertAfter: async (taskId: string, newTask: Task) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleInsertAfter(taskId, newTask);
      },
      handleReorder: async (reorderedTasks: Task[], movedTaskId?: string, inferredParentId?: string) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleReorder(reorderedTasks, movedTaskId, inferredParentId);
      },
      handleUngroupTask: async (taskId: string) => {
        if (!(await prepareUndoPreviewForEdit())) {
          return;
        }
        await batchUpdate.handleUngroupTask(taskId);
      },
    };
  }, [applyProgressColumnVolumeDeltas, batchUpdate, prepareUndoPreviewForEdit]);

  const canShiftProject = !effectiveReadOnly && Boolean(guardedBatchUpdate) && Boolean(projectDateRange);
  const canOpenProjectSettings = canShiftProject || Boolean(onGanttDayModeChange) || Boolean(onTimelineMarkersChange) || Boolean(onProjectNameChange);

  useEffect(() => {
    if (templateMode && showHistoryPanel) {
      setShowHistoryPanel(false);
    }
  }, [templateMode, showHistoryPanel, setShowHistoryPanel]);

  const handleOpenProjectShift = useCallback(() => {
    if (!canShiftProject) {
      return;
    }

    setProjectShiftError(null);
    setProjectShiftOpen(true);
  }, [canShiftProject]);

  const handleOpenProjectSettings = useCallback(() => {
    if (!canOpenProjectSettings) {
      return;
    }

    setProjectSettingsError(null);
    setProjectSettingsOpen(true);
  }, [canOpenProjectSettings]);

  const handleOpenShiftFromSettings = useCallback(() => {
    setProjectSettingsOpen(false);
    setProjectSettingsError(null);
    handleOpenProjectShift();
  }, [handleOpenProjectShift]);

  const handleSubmitProjectShift = useCallback(async (deltaDays: number) => {
    if (!guardedBatchUpdate || !Number.isFinite(deltaDays) || deltaDays === 0) {
      return;
    }

    setProjectShiftPending(true);
    setProjectShiftError(null);
    try {
      await guardedBatchUpdate.handleShiftProject(deltaDays);
      setProjectShiftOpen(false);
    } catch (error) {
      console.error('[ProjectWorkspace] Failed to shift project:', error);
      setProjectShiftError('Не удалось сдвинуть проект. Попробуйте ещё раз.');
    } finally {
      setProjectShiftPending(false);
    }
  }, [guardedBatchUpdate]);

  const handleSaveProjectSettings = useCallback(async (settings: {
    projectName: string;
    ganttDayMode: 'business' | 'calendar';
    calendarWeeklyPattern: CalendarWeeklyPattern;
    calendarDays: CalendarDay[];
    timelineMarkers: TimelineMarker[];
    hiddenTaskListColumnsDefault: string[] | null;
  }) => {
    const currentProjectHiddenTaskListColumnsDefault = persistedProjectId && authProject?.id === persistedProjectId
      ? (authProject.hiddenTaskListColumnsDefault ?? null)
      : null;
    const calendarWeeklyPatternChanged = Boolean(persistedProjectId && authProject?.id === persistedProjectId)
      && !calendarWeeklyPatternEqual(settings.calendarWeeklyPattern, authProject?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN);
    const calendarDaysChanged = Boolean(persistedProjectId && authProject?.id === persistedProjectId)
      && !calendarDaysEqual(settings.calendarDays, authProject?.calendarDays ?? []);
    const projectNameChanged = Boolean(onProjectNameChange)
      && settings.projectName.trim() !== projectName.trim();
    const markersChanged = Boolean(onTimelineMarkersChange)
      && JSON.stringify(settings.timelineMarkers) !== JSON.stringify(timelineMarkers);
    const dayModeChanged = Boolean(onGanttDayModeChange)
      && settings.ganttDayMode !== ganttDayMode;
    const hiddenColumnsDefaultChanged = persistedProjectId
      && authProject?.id === persistedProjectId
      && JSON.stringify(settings.hiddenTaskListColumnsDefault ?? null) !== JSON.stringify(currentProjectHiddenTaskListColumnsDefault);

    if (!projectNameChanged && !calendarWeeklyPatternChanged && !calendarDaysChanged && !markersChanged && !dayModeChanged && !hiddenColumnsDefaultChanged) {
      setProjectSettingsOpen(false);
      setProjectSettingsError(null);
      return;
    }

    setProjectSettingsPending(true);
    setProjectSettingsError(null);
    try {
      if (projectNameChanged && onProjectNameChange) {
        await onProjectNameChange(settings.projectName.trim());
      }
      if ((calendarWeeklyPatternChanged || calendarDaysChanged) && persistedProjectId && authProject?.id === persistedProjectId) {
        await useAuthStore.getState().updateProject(persistedProjectId, {
          calendarWeeklyPattern: settings.calendarWeeklyPattern,
          calendarDays: settings.calendarDays,
        });
        if (settings.ganttDayMode === 'business' && !dayModeChanged && guardedBatchUpdate) {
          const nextWeekendPredicate = getProjectWeekendPredicate(settings.calendarWeeklyPattern, settings.calendarDays);
          const reflowedTasks = reflowTasksOnModeSwitch(tasks, true, nextWeekendPredicate) as Task[];
          await guardedBatchUpdate.handleTasksChange(reflowedTasks);
        }
      }
      if (dayModeChanged && onGanttDayModeChange) {
        await onGanttDayModeChange(settings.ganttDayMode);
      }
      if (markersChanged && onTimelineMarkersChange) {
        await onTimelineMarkersChange(settings.timelineMarkers);
      }
      if (hiddenColumnsDefaultChanged && persistedProjectId && authProject?.id === persistedProjectId) {
        await useAuthStore.getState().updateProject(persistedProjectId, {
          hiddenTaskListColumnsDefault: settings.hiddenTaskListColumnsDefault,
        });
      }
      setProjectSettingsOpen(false);
    } catch (error) {
      console.error('[ProjectWorkspace] Failed to save project settings:', error);
      setProjectSettingsError('Не удалось сохранить настройки проекта. Попробуйте ещё раз.');
    } finally {
      setProjectSettingsPending(false);
    }
  }, [authProject, ganttDayMode, guardedBatchUpdate, onGanttDayModeChange, onProjectNameChange, onTimelineMarkersChange, persistedProjectId, projectName, setProjectSettingsOpen, tasks, timelineMarkers]);

  useEffect(() => {
    // Block history shortcuts while preview/read-only modes are active.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!accessToken || readOnly || aiMutationLocked || previewRendering || previewFailed || event.defaultPrevented || !event.ctrlKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(
        target?.isContentEditable
        || tagName === 'input'
        || tagName === 'textarea',
      );

      if (isEditable) {
        return;
      }

      const key = event.key.toLowerCase();
      const isUndo = (key === 'z' || key === 'я') && !event.shiftKey;
      const isRedo = key === 'y' || key === 'н' || ((key === 'z' || key === 'я') && event.shiftKey);

      if (isUndo) {
        if (historyLoading || !nextUndoPreviewItem) {
          return;
        }
        event.preventDefault();
        handleUndoLatest();
        return;
      }

      if (isRedo) {
        if (historyLoading || previewHistoryIndex < 0) {
          return;
        }
        event.preventDefault();
        handleRedoLatest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accessToken, aiMutationLocked, handleRedoLatest, handleUndoLatest, historyLoading, nextUndoPreviewItem, previewFailed, previewHistoryIndex, previewRendering, readOnly]);

  useEffect(() => {
    if (!hasBaselineAccess) {
      return;
    }

    void refreshBaselines().catch(() => { });
  }, [hasBaselineAccess, refreshBaselines]);

  const handleRefreshBaselines = useCallback(async () => {
    if (!hasBaselineAccess) {
      return;
    }

    await refreshBaselines();
  }, [hasBaselineAccess, refreshBaselines]);

  const handleSelectBaseline = useCallback(async (baselineId: string) => {
    if (!projectId) {
      return;
    }

    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId) {
      return;
    }

    if (selectedBaselineState?.id === trimmedBaselineId) {
      setProjectState(projectId, { selectedBaselineVisible: true });
      return;
    }

    const baseline = await fetchBaseline(trimmedBaselineId);
    setProjectState(projectId, {
      selectedBaseline: {
        id: baseline.id,
        label: baseline.name || 'Без названия',
        snapshot: baseline.snapshot,
      },
      selectedBaselineVisible: true,
    });
  }, [fetchBaseline, projectId, selectedBaselineState?.id, setProjectState]);

  const handleCreateBaselineFromCurrent = useCallback(async () => {
    if (!projectId || creatingFromCurrent) {
      return;
    }

    try {
      const baseline = await createFromCurrent(buildDefaultBaselineName());
      setProjectState(projectId, {
        selectedBaseline: {
          id: baseline.id,
          label: baseline.name || 'Без названия',
          snapshot: baseline.snapshot,
        },
        selectedBaselineVisible: true,
      });
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [createFromCurrent, creatingFromCurrent, projectId, setProjectState]);

  const handleCreateBaselineFromHistory = useCallback(async (item: { id: string; createdAt: string }) => {
    if (!projectId || creatingFromHistoryGroupId === item.id) {
      return;
    }

    try {
      const baseline = await createFromHistory(item.id, buildDefaultBaselineName(item.createdAt));
      setProjectState(projectId, {
        selectedBaseline: {
          id: baseline.id,
          label: baseline.name || 'Без названия',
          snapshot: baseline.snapshot,
        },
        selectedBaselineVisible: true,
      });
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [createFromHistory, creatingFromHistoryGroupId, projectId, setProjectState]);

  const handleDeleteBaseline = useCallback(async (baselineId: string) => {
    if (!projectId) {
      return;
    }

    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId || deletingBaselineId === trimmedBaselineId) {
      return;
    }

    try {
      const deleted = await deleteBaseline(trimmedBaselineId);
      if (selectedBaselineState?.id === deleted.id) {
        setProjectState(projectId, { selectedBaseline: null, selectedBaselineVisible: false });
      }
    } catch {
      // Preserve the existing selected baseline; hook state already exposes the error.
    }
  }, [deleteBaseline, deletingBaselineId, projectId, selectedBaselineState?.id, setProjectState]);

  const handleRenameBaseline = useCallback(async (baselineId: string, name: string) => {
    if (!projectId) {
      return;
    }

    const trimmedBaselineId = baselineId.trim();
    const trimmedName = name.trim();
    if (!trimmedBaselineId || !trimmedName) {
      return;
    }

    try {
      const updated = await updateBaseline(trimmedBaselineId, trimmedName);
      if (selectedBaselineState?.id === updated.id) {
        setProjectState(projectId, {
          selectedBaseline: {
            ...selectedBaselineState,
            label: updated.name || 'Без названия',
            snapshot: updated.snapshot,
          },
        });
      }
    } catch {
      // Hook already exposes the error state.
    }
  }, [projectId, selectedBaselineState, setProjectState, updateBaseline]);

  const handleToggleBaselineVisibility = useCallback(() => {
    if (!projectId || !selectedBaselineState) {
      return;
    }

    setProjectState(projectId, { selectedBaselineVisible: !selectedBaselineVisible });
  }, [projectId, selectedBaselineState, selectedBaselineVisible, setProjectState]);


  useEffect(() => {
    if (!accessToken || historyRefreshRevision === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshHistory();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [accessToken, historyRefreshRevision, refreshHistory]);

  useEffect(() => {
    if (!projectId || loading) {
      return;
    }

    const ganttScrollElement = ganttSectionRef.current?.querySelector('.gantt-scrollContainer');
    if (!(ganttScrollElement instanceof HTMLElement)) {
      return;
    }

    const persistedState = getProjectState(projectId);
    if (persistedState && (persistedState.ganttScrollLeft !== 0 || persistedState.ganttScrollTop !== 0)) {
      ganttScrollElement.scrollLeft = persistedState.ganttScrollLeft;
      ganttScrollElement.scrollTop = persistedState.ganttScrollTop;
    }

    const handleScroll = () => {
      setProjectState(projectId, {
        ganttScrollLeft: ganttScrollElement.scrollLeft,
        ganttScrollTop: ganttScrollElement.scrollTop,
      });
    };

    ganttScrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      ganttScrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [effectiveTasksWithBaseline, getProjectState, loading, projectId, setProjectState]);

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
          onExportPdf={onExportPdf}
          onExportExcel={onExportExcel}
          onExportBackup={onExportBackup}
          onImportExcel={onImportExcel}
          onImportBackup={onImportBackup}
          onReturnToWizard={onReturnToWizard}
          onInsertTemplateToProject={effectiveReadOnly || hasShareToken ? null : onInsertTemplateToProject}
          isExportExcelLoading={isExportExcelLoading}
          shareStatus={shareStatus}
          onCreateShareLink={onCreateShareLink}
          showShareButton={!hasShareToken && isAuthenticated}
          templateSelectionActive={templateSelectionActive}
          onCreateTemplateFromProject={effectiveReadOnly || hasShareToken ? null : onCreateTemplateFromProject}
          onStartTemplateSelection={effectiveReadOnly || hasShareToken ? null : onStartTemplateSelection}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          disableTaskDrag={effectiveDisableTaskDrag}
          onToggleDisableTaskDrag={handleSetDisableTaskDrag}
          ganttDayMode={displayGanttDayMode ?? ganttDayMode}
          onGanttDayModeChange={onGanttDayModeChange}
          readOnly={readOnly || aiMutationLocked}
          previewMode={previewModeActive && !undoPreviewEditMode}
          canUndo={Boolean(nextUndoPreviewItem)}
          undoLoading={undoLoading}
          onUndo={handleUndoLatest}
          baselineMenuOpen={baselineMenuOpen}
          onBaselineMenuOpenChange={setBaselineMenuOpen}
          baselineActiveLabel={selectedBaselineLabel}
          baselineVisible={selectedBaselineVisible}
          baselineRows={baselineRows}
          baselineLoading={baselinesLoading}
          baselineActiveRequestId={activeBaselineId}
          baselineError={baselinesError}
          baselineCreateLabel="Сохранить текущий график"
          creatingBaselineFromCurrent={creatingFromCurrent}
          deletingBaselineId={deletingBaselineId}
          renamingBaselineId={renamingBaselineId}
          onCreateBaselineFromCurrent={() => {
            void handleCreateBaselineFromCurrent();
          }}
          onSelectBaseline={(baselineId) => {
            void handleSelectBaseline(baselineId);
          }}
          onToggleBaselineVisibility={handleToggleBaselineVisibility}
          onDeleteBaseline={(baselineId) => {
            void handleDeleteBaseline(baselineId);
          }}
          onRenameBaseline={(baselineId, name) => {
            void handleRenameBaseline(baselineId, name);
          }}
          onRefreshBaselines={() => {
            void handleRefreshBaselines();
          }}
          taskListColumnRows={TASK_LIST_COLUMN_ROWS}
          hiddenTaskListColumns={hiddenTaskListColumns}
          onToggleTaskListColumn={handleToggleTaskListColumn}
          onSetAllTaskListColumnsVisible={handleSetAllTaskListColumnsVisible}
          onResetTaskListColumnOverride={handleResetTaskListColumnOverride}
          onOpenProjectSettings={handleOpenProjectSettings}
          canOpenProjectSettings={canOpenProjectSettings}
          showStructureControls={true}
          showBaselineControls={!templateMode}
          showProjectShiftControl={!templateMode}
          showHistoryControl={!templateMode}
          showExpiredToggle={!templateMode}
          showUndoControl={!templateMode}
          showOverflowMenuControl={!templateMode}
        />
      </div>

      {/* Chart and Chat side by side */}
      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-3 md:px-4 lg:flex-row lg:overflow-hidden">
        {/* Chart card - hide on mobile when chat is open */}
        <div className={cn(
          "flex min-w-0 flex-1 overflow-hidden rounded-t-xl border-x border-t border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)]",
          chatSidebarVisible && "hidden md:flex"
        )}>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {projectShiftOpen && projectDateRange && (
              <ProjectShiftModal
                error={projectShiftError}
                isWeekend={weekendPredicate}
                onCancel={() => {
                  if (!projectShiftPending) {
                    setProjectShiftOpen(false);
                    setProjectShiftError(null);
                  }
                }}
                onSubmit={(deltaDays) => {
                  void handleSubmitProjectShift(deltaDays);
                }}
                pending={projectShiftPending}
                range={projectDateRange}
              />
            )}
            {projectSettingsOpen && (
              <ProjectSettingsModal
                projectName={projectName}
                ganttDayMode={displayGanttDayMode ?? ganttDayMode}
                calendarWeeklyPattern={calendarWeeklyPattern}
                calendarDays={calendarDays}
                timelineMarkers={timelineMarkers}
                hiddenTaskListColumnsDefault={persistedProjectId && authProject?.id === persistedProjectId ? authProject.hiddenTaskListColumnsDefault ?? null : null}
                taskListColumnRows={TASK_LIST_COLUMN_ROWS}
                pending={projectSettingsPending}
                error={projectSettingsError}
                canEditProjectName={Boolean(onProjectNameChange) && !effectiveReadOnly}
                canShiftProject={canShiftProject}
                canEditGanttDayMode={Boolean(onGanttDayModeChange) && !effectiveReadOnly}
                canEditTimelineMarkers={Boolean(onTimelineMarkersChange) && !effectiveReadOnly}
                canEditTaskListColumnsDefault={!effectiveReadOnly && Boolean(persistedProjectId && authProject?.id === persistedProjectId)}
                onClose={() => {
                  if (!projectSettingsPending) {
                    setProjectSettingsOpen(false);
                    setProjectSettingsError(null);
                  }
                }}
                onOpenProjectShift={handleOpenShiftFromSettings}
                onSave={(settings) => {
                  void handleSaveProjectSettings(settings);
                }}
              />
            )}
            {assignmentSelectionTaskId && selectedAssignmentTask && (
              <ResourceAssignmentModal
                activeAssignedResources={selectedAssignmentResourceGroups.activeAssignedResources}
                assignableResources={activeResources}
                error={assignmentError}
                inactiveAssignedResources={selectedAssignmentResourceGroups.inactiveAssignedResources}
                onCancel={closeAssignmentSelector}
                onCreateResource={() => {
                  setCreateAssignmentResourceError(null);
                  setCreateAssignmentResourceOpen(true);
                }}
                onOpenPlannerAssignment={handleOpenPlannerAssignment}
                onSelectionChange={handleAssignmentResourceChange}
                onSubmit={(resourceIds) => {
                  void handleAssignResources(selectedAssignmentTask, resourceIds);
                }}
                pending={assignmentSubmitting}
                selectedResourceIds={selectedAssignmentResourceIds}
                task={selectedAssignmentTask}
              />
            )}
            {assignmentSelectionTaskId && selectedAssignmentTask && createAssignmentResourceOpen && (
              <CreateResourceModal
                error={createAssignmentResourceError}
                pending={createAssignmentResourcePending}
                onCancel={() => {
                  if (!createAssignmentResourcePending) {
                    setCreateAssignmentResourceOpen(false);
                    setCreateAssignmentResourceError(null);
                  }
                }}
                onSubmit={(input) => {
                  void handleCreateAssignmentResource(input);
                }}
              />
            )}

            {assignmentError && !assignmentSelectionTaskId && (
              <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="assignment-error-banner" role="alert">
                {assignmentError}
              </div>
            )}

            {shareSelectionActive && (
              <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <div className="min-w-0">
                  <span className="font-semibold">Режим выбора для ссылки.</span>
                  <span className="ml-2 text-amber-800">Выбрано: {selectedShareTaskIds.size}. Отмечайте задачи прямо в текущем графике.</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={onCancelShareSelection}
                    className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onConfirmShareSelection?.(); }}
                    disabled={selectedShareTaskIds.size === 0 || shareStatus === 'creating'}
                    className={cn(
                      'inline-flex h-8 items-center rounded-md bg-amber-900 px-3 text-xs font-medium text-white transition-colors hover:bg-amber-950',
                      (selectedShareTaskIds.size === 0 || shareStatus === 'creating') && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {shareStatus === 'creating' ? 'Создаём ссылку...' : 'Создать ссылку'}
                  </button>
                </div>
              </div>
            )}

            {templateSelectionActive && (
              <div className="flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/20 px-3 py-2.5 text-sm text-slate-900">
                <div className="min-w-0">
                  <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-primary">Режим создания шаблона</span>
                  <span className="ml-2 font-medium text-slate-700">Выбрано: {selectedTemplateTaskIds.size}.</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={onCancelTemplateSelection}
                    className="inline-flex h-8 items-center rounded-md border border-primary/20 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onCreateTemplateFromProject?.(); }}
                    className="inline-flex h-8 items-center rounded-md border border-primary/20 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Весь график
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onConfirmTemplateSelection?.(); }}
                    disabled={selectedTemplateTaskIds.size === 0}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90',
                      selectedTemplateTaskIds.size === 0 && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <ToyBrick className="h-3.5 w-3.5" />
                    Сохранить шаблон
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden bg-white" ref={ganttSectionRef}>
              {loading ? (
                <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-400">
                  Загрузка...
                </div>
              ) : (
                <GanttChart
                  ref={ganttRef as Ref<GanttChartRef>}
                  tasks={effectiveTasksWithBaseline}
                  showBaseline={Boolean(selectedBaselineState && selectedBaselineVisible)}
                  taskFilter={taskFilter}
                  taskListMenuCommands={taskListMenuCommands}
                  additionalColumns={additionalColumns}
                  hiddenTaskListColumns={hiddenTaskListColumns}
                  taskListColumnWidths={taskListColumnWidths}
                  onTaskListColumnWidthsChange={handleTaskListColumnWidthsChange}
                  taskDateChangeMode={taskDateChangeMode}
                  onTaskDateChangeModeChange={handleTaskDateChangeModeChange}
                  getTaskListRowClassName={(task) => (
                    strikeClosedTasks && !parentTaskIds.has(task.id) && task.status === 'closed' ? 'gantt-tl-row-closed' : undefined
                  )}
                  onTasksChange={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleTasksChange}
                  dayWidth={viewMode === 'week' ? 8 : viewMode === 'month' ? 2 : 24}
                  rowHeight={36}
                  containerHeight="calc(100dvh - 132px)"
                  showTaskList={showTaskList}
                  showChart={showChart}
                  taskListWidth={taskListWidth}
                  onValidateDependencies={onValidation}
                  enableAutoSchedule={autoSchedule}
                  onCascade={effectiveReadOnly || externalSelectionActive ? undefined : onCascade}
                  disableTaskNameEditing={effectiveReadOnly || externalSelectionActive}
                  disableDependencyEditing={effectiveReadOnly || externalSelectionActive}
                  disableTaskDrag={effectiveDisableTaskDrag || externalSelectionActive}
                  highlightExpiredTasks={highlightExpiredTasks}
                  headerHeight={40}
                  viewMode={viewMode}
                  collapsedParentIds={collapsedParentIds}
                  onToggleCollapse={handleToggleCollapse}
                  onAdd={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleAdd}
                  onDelete={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleDelete}
                  onInsertAfter={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleInsertAfter}
                  onReorder={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleReorder}
                  onUngroupTask={effectiveReadOnly || externalSelectionActive ? undefined : guardedBatchUpdate?.handleUngroupTask}
                  customDays={customDays}
                  highlightedTaskIds={highlightedSearchTaskIds}
                  enableTaskMultiSelect={externalSelectionActive}
                  selectedTaskIds={shareSelectionActive ? selectedShareTaskIds : selectedTemplateTaskIds}
                  onSelectedTaskIdsChange={shareSelectionActive ? onSelectedShareTaskIdsChange : templateSelectionActive ? onSelectedTemplateTaskIdsChange : undefined}
                  filterMode={filterMode}
                  businessDays={ganttDayMode !== 'calendar'}
                  isWeekend={weekendPredicate}
                  timelineMarkers={timelineMarkers}
                />
              )}
            </div>

            {aiMutationLocked && (
              <div className="pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2">
                <div className="pointer-events-auto flex min-h-14 max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                  <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">AI готовит график. Подождите</p>
                    {aiMutationLock.message && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {aiMutationLock.message}
                      </p>
                    )}
                  </div>
                  {canOpenChatFromLoader && (
                    <button
                      type="button"
                      onClick={onToggleChat}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Открыть чат
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasRenderableChart && (
              <footer className="flex h-6 shrink-0 select-none items-center gap-3 border-t border-slate-200 bg-white px-3">
                {effectiveTasks.length > 0 && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTaskCount(effectiveTasks.length)}
                  </span>
                )}

                <span className="font-mono text-[11px] text-slate-400">
                  {ganttDayMode === 'calendar' ? 'Календарные дни' : 'Рабочие дни'}
                </span>

                {projectDurationLabel && (
                  <span className="font-mono text-[11px] text-slate-500">
                    Срок: {projectDurationLabel}
                  </span>
                )}

                {selectedBaselineLabel && selectedBaselineVisible && !previewHistoryItem && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
                    {selectedBaselineLabel}
                    <span className="ml-1 text-[10px] font-medium normal-case text-primary/80">
                      ({selectedBaselineTaskCount} задач)
                    </span>
                  </span>
                )}

                {previewHistoryItem && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-700">
                    Версия от {formatHistoryVersionTimestamp(previewHistoryItem.createdAt)}
                  </span>
                )}

                {(previewRendering || previewFailed) && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600">
                    {previewRendering ? 'Предпросмотр' : 'Не сохранено'}
                  </span>
                )}

                {aiMutationLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    AI занят
                  </span>
                )}

                {previewFailed && (
                  <span className="font-mono text-[11px] text-red-600">
                    {previewMessage ?? 'Предварительный график не был сохранён'}
                  </span>
                )}

                {hasShareToken && (
                  <span className="font-mono text-[11px] text-slate-500">
                    Только для чтения
                  </span>
                )}

                {showSyncStatus && (
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      hasBlockedPendingCommand ? 'text-red-600' : 'text-amber-600',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        hasBlockedPendingCommand ? 'bg-red-400' : 'bg-amber-400 animate-pulse',
                      )}
                    />
                    {hasBlockedPendingCommand
                      ? 'Конфликт версии'
                      : pendingCommandCount > 0
                        ? 'Синхронизация...'
                        : 'Офлайн'}
                  </span>
                )}

                {showSavingStatus && (
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[11px] transition-colors',
                      'text-amber-600',
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                    Сохранение...
                  </span>
                )}
              </footer>
            )}
          </div>
        </div>

        {!templateMode && showHistoryPanel && (
          <HistoryPanel
            items={historyItems}
            loading={historyLoading}
            error={historyError}
            disabled={historyPanelDisabled}
            previewGroupId={historyViewer.mode === 'preview' ? historyViewer.groupId : null}
            previewingGroupId={previewingGroupId}
            restoringGroupId={restoringGroupId}
            creatingBaselineFromHistoryGroupId={creatingFromHistoryGroupId}
            onClose={() => setShowHistoryPanel(false)}
            onRefresh={() => void refreshHistory()}
            onPreviewVersion={(item) => {
              setUndoPreviewEditMode(false);
              return showVersion(item);
            }}
            onRestoreVersion={(groupId) => {
              setUndoPreviewEditMode(false);
              return restoreVersion(groupId);
            }}
            onCreateBaselineFromHistory={(item) => {
              void handleCreateBaselineFromHistory(item);
            }}
            onReturnToCurrentVersion={() => {
              setUndoPreviewEditMode(false);
              returnToCurrentVersion();
            }}
          />
        )}

        {/* Chat card - full width on mobile when open, side on desktop */}
        {chatSidebarVisible && !hasShareToken && onSend && (
          <aside className="mb-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] lg:w-[360px] lg:flex-none lg:max-w-md xl:max-w-[320px]">
            <ChatSidebar
              messages={chatMessages}
              streaming={streaming}
              onSend={onSend}
              onStop={onStopGeneration}
              onTaskReferenceClick={handleTaskReferenceClick}
              disabled={effectiveChatDisabled}
              connected={displayConnected}
              usage={chatUsage}
              disabledReason={aiThinking ? null : effectiveChatDisabledReason}
              loading={aiThinking}
              onClose={onCloseChat}
              onShowChart={onCloseChat}
              showChartButton={hasRenderableChart}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
              onReturnToCurrentVersion={() => {
                setUndoPreviewEditMode(false);
                returnToCurrentVersion();
              }}
              showReturnToCurrentVersion={previewModeActive}
              activePreviewGroupId={historyViewer.mode === 'preview' ? historyViewer.groupId : null}
              onPreviewHistory={(groupId) => {
                setUndoPreviewEditMode(false);
                void showVersionById(groupId);
              }}
              onRestoreHistory={(groupId) => {
                setUndoPreviewEditMode(false);
                void restoreVersion(groupId);
              }}
            />
          </aside>
        )}
      </div>

      {splitTaskDraft && (
        <SplitTaskModal
          task={splitTaskDraft}
          onClose={() => setSplitTaskDraft(null)}
          onSubmit={handleSplitTaskSubmit}
        />
      )}

      {historyBranchConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !historyBranchConfirmPending) {
              closeHistoryBranchConfirmation(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-branch-confirm-title"
            className="w-[460px] max-w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <TriangleAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="history-branch-confirm-title" className="text-lg font-semibold text-slate-900">
                  Изменить старую версию?
                </h2>
                <div className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                  <p>Вы изменяете версию от {previewHistoryLabel ?? 'выбранной даты'}.</p>
                  <p>Все последующие версии будут перезаписаны. Продолжить?</p>
                  <button
                    type="button"
                    onClick={() => setShowHistoryPanel(true)}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Открыть историю
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeHistoryBranchConfirmation(false)}
                disabled={historyBranchConfirmPending}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => closeHistoryBranchConfirmation(true)}
                disabled={historyBranchConfirmPending}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {historyBranchConfirmPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Продолжить
              </button>
            </div>
          </section>
        </div>
      )}

      {taskChatDraft && (
        <TaskChatModal
          task={taskChatDraft}
          onClose={() => setTaskChatDraft(null)}
          onAppendToChat={handleAppendTaskToChat}
          onSendNow={onSend}
        />
      )}
    </div>
  );
}

