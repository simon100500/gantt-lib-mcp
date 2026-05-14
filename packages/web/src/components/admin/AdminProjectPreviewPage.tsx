import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GanttChartRef } from '../GanttChart.tsx';
import { ProjectWorkspace } from '../workspace/ProjectWorkspace.tsx';
import { DEFAULT_CALENDAR_WEEKLY_PATTERN } from '../../lib/projectScheduleOptions.ts';
import type { ProjectLoadResponse } from '../../lib/apiTypes.ts';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useHistoryViewerStore } from '../../stores/useHistoryViewerStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { readProjectChatOpenState, useUIStore } from '../../stores/useUIStore.ts';
import type { Task, ValidationResult } from '../../types.ts';

interface AdminProjectPreviewPageProps {
  projectId: string;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshAccessToken: () => Promise<string | null>;
  onLoginRequired: () => void;
  onBack: () => void;
}

async function fetchWithRetry(
  path: string,
  accessToken: string | null,
  refreshAccessToken: () => Promise<string | null>,
): Promise<Response> {
  if (!accessToken) {
    return new Response(null, { status: 401 });
  }

  const doFetch = (token: string) => fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  let response = await doFetch(accessToken);
  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    return response;
  }

  return doFetch(refreshedToken);
}

export function AdminProjectPreviewPage({
  projectId,
  isAuthenticated,
  accessToken,
  refreshAccessToken,
  onLoginRequired,
  onBack,
}: AdminProjectPreviewPageProps) {
  const ganttRef = useRef<GanttChartRef>(null);
  const loadRequestIdRef = useRef(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<ProjectLoadResponse['project'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const setShowHistoryPanel = useUIStore((state) => state.setShowHistoryPanel);
  const exitHistoryPreview = useHistoryViewerStore((state) => state.exitPreview);

  const loadPreview = useCallback(async () => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setProject(null);
    setTasks([]);
    exitHistoryPreview();
    useChatStore.getState().reset();
    useProjectStore.getState().hydrateConfirmed(0, {
      tasks: [],
      dependencies: [],
    }, {
      resources: [],
      assignments: [],
      progressEntries: [],
    });

    try {
      const projectQuery = encodeURIComponent(projectId);
      const [projectResponse, messagesResponse] = await Promise.all([
        fetchWithRetry(`/api/project?projectId=${projectQuery}`, accessToken, refreshAccessToken),
        fetchWithRetry(`/api/messages?projectId=${projectQuery}`, accessToken, refreshAccessToken),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      if (!projectResponse.ok) {
        throw new Error(`Failed to load project: HTTP ${projectResponse.status}`);
      }
      if (!messagesResponse.ok) {
        throw new Error(`Failed to load chat: HTTP ${messagesResponse.status}`);
      }

      const projectPayload = await projectResponse.json() as ProjectLoadResponse;
      const messagesPayload = await messagesResponse.json() as Array<{
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        requestContextId?: string | null;
        historyGroupId?: string | null;
      }>;

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      useProjectStore.getState().hydrateConfirmed(projectPayload.version, {
        tasks: projectPayload.snapshot.tasks,
        dependencies: projectPayload.snapshot.dependencies,
      }, {
        resources: projectPayload.snapshot.resources,
        assignments: projectPayload.snapshot.assignments,
        progressEntries: projectPayload.snapshot.progressEntries ?? [],
      });
      useProjectStore.getState().clearTransientState();

      useChatStore.getState().replaceMessages(messagesPayload.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        requestContextId: message.requestContextId ?? null,
        historyGroupId: message.historyGroupId ?? null,
      })));
      useChatStore.setState((state) => ({
        ...state,
        streamingText: '',
        aiThinking: false,
        loading: false,
        error: null,
      }));

      setTasks(projectPayload.snapshot.tasks);
      setProject(projectPayload.project);
    } catch (loadError) {
      if (loadRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load admin project preview');
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [accessToken, exitHistoryPreview, isAuthenticated, onLoginRequired, projectId, refreshAccessToken]);

  useEffect(() => {
    setWorkspace({ kind: 'project', projectId, chatOpen: readProjectChatOpenState() });
    setShowHistoryPanel(false);
    exitHistoryPreview();
    void loadPreview();

    return () => {
      loadRequestIdRef.current += 1;
      exitHistoryPreview();
      useChatStore.getState().reset();
      setShowHistoryPanel(false);
    };
  }, [exitHistoryPreview, loadPreview, projectId, setShowHistoryPanel, setWorkspace]);

  const projectLabel = useMemo(() => project?.name || projectId, [project?.name, projectId]);

  return (
    <div className="flex min-h-[calc(100dvh-65px)] flex-col bg-[#f4f5f7]">
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            Назад в админку
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{projectLabel}</div>
            <div className="text-xs text-slate-500">Полный readonly-просмотр: график, history, chat</div>
          </div>
          <div className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Только чтение
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mt-6 w-full max-w-[1600px] px-4 sm:px-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ProjectWorkspace
          ganttRef={ganttRef}
          projectName={project?.name}
          tasks={tasks}
          setTasks={setTasks}
          loading={loading}
          accessToken={accessToken}
          sharedProject={null}
          shareToken={null}
          hasShareToken={false}
          displayConnected
          isAuthenticated={isAuthenticated}
          chatDisabled
          chatDisabledReason="Админский просмотр открыт в режиме только чтение."
          onSend={() => ({ accepted: false, message: 'Админский просмотр открыт в режиме только чтение.' })}
          onLoginRequired={onLoginRequired}
          onCloseChat={() => setWorkspace((current) => (
            current.kind === 'project'
              ? { ...current, chatOpen: false }
              : current
          ))}
          onToggleChat={() => setWorkspace((current) => (
            current.kind === 'project'
              ? { ...current, chatOpen: !current.chatOpen }
              : current
          ))}
          onScrollToToday={() => ganttRef.current?.scrollToToday()}
          onCollapseAll={() => ganttRef.current?.collapseAll()}
          onExpandAll={() => ganttRef.current?.expandAll()}
          onValidation={(_result: ValidationResult) => {}}
          ganttDayMode={project?.ganttDayMode ?? 'calendar'}
          displayGanttDayMode={project?.ganttDayMode ?? 'calendar'}
          calendarWeeklyPattern={project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
          calendarDays={project?.calendarDays ?? []}
          timelineMarkers={project?.timelineMarkers ?? []}
          readOnly
          showChat
          projectIdOverride={projectId}
          hiddenTaskListColumnsDefaultOverride={project?.hiddenTaskListColumnsDefault ?? null}
        />
      </div>
    </div>
  );
}
