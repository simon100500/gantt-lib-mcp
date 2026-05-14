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
  onProjectLoaded?: (project: ProjectLoadResponse['project']) => void;
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
  onProjectLoaded,
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
      onProjectLoaded?.(projectPayload.project);
    } catch (loadError) {
      if (loadRequestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load admin project preview');
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [accessToken, exitHistoryPreview, isAuthenticated, onLoginRequired, onProjectLoaded, projectId, refreshAccessToken]);

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
    <>
      {error ? (
        <div className="pointer-events-none absolute left-0 right-0 top-[56px] z-50 flex justify-center p-2">
          <div className="pointer-events-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs text-red-700 shadow-sm">
            {error}
          </div>
        </div>
      ) : null}

      <ProjectWorkspace
        ganttRef={ganttRef}
        projectName={projectLabel}
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
    </>
  );
}
