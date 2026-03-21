import { useCallback, useEffect, useRef } from 'react';

import { EditProjectModal } from './components/EditProjectModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import type { GanttChartRef } from './components/GanttChart.tsx';
import { ProjectMenu } from './components/layout/ProjectMenu.tsx';
import { DraftWorkspace } from './components/workspace/DraftWorkspace.tsx';
import { GuestWorkspace } from './components/workspace/GuestWorkspace.tsx';
import { ProjectWorkspace } from './components/workspace/ProjectWorkspace.tsx';
import { SharedWorkspace } from './components/workspace/SharedWorkspace.tsx';
import { useAuth } from './hooks/useAuth.ts';
import { useBatchTaskUpdate } from './hooks/useBatchTaskUpdate.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useSharedProject } from './hooks/useSharedProject.ts';
import { useTaskMutation } from './hooks/useTaskMutation.ts';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import { useChatStore } from './stores/useChatStore.ts';
import { useTaskStore } from './stores/useTaskStore.ts';
import { useUIStore } from './stores/useUIStore.ts';
import { useProjectUIStore } from './stores/useProjectUIStore.ts';
import type { Task, ValidationResult } from './types.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';

export default function App() {
  const auth = useAuth();
  const sharedProject = useSharedProject();
  const localTasks = useLocalTasks();
  const workspace = useUIStore((state) => state.workspace);
  const showOtpModal = useUIStore((state) => state.showOtpModal);
  const showEditProjectModal = useUIStore((state) => state.showEditProjectModal);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const setShowOtpModal = useUIStore((state) => state.setShowOtpModal);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const setProjectSidebarVisible = useUIStore((state) => state.setProjectSidebarVisible);
  const setValidationErrors = useUIStore((state) => state.setValidationErrors);
  const setShareStatus = useUIStore((state) => state.setShareStatus);
  const hasShareToken = Boolean(sharedProject.shareToken);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || hasShareToken) {
      return;
    }

    void auth.refreshProjects();
  }, [auth.isAuthenticated, auth.accessToken, hasShareToken]);

  const authenticatedTasks = useTasks(hasShareToken ? null : auth.accessToken, auth.refreshAccessToken);
  const { tasks, setTasks, loading, error } = hasShareToken
    ? sharedProject
    : auth.isAuthenticated
      ? authenticatedTasks
      : localTasks;
  const batchUpdate = useBatchTaskUpdate({
    tasks,
    setTasks,
    accessToken: hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null,
  });
  useTaskMutation(hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null);
  const ganttRef = useRef<GanttChartRef>(null);
  const activationInFlightRef = useRef(false);
  const createEmptyChartAfterActivationRef = useRef(false);
  const queuedPromptRef = useRef<string | null>(null);

  const replaceTasksFromSystem = useCallback((nextTasks: Task[]) => {
    setTasks(nextTasks);
  }, [setTasks]);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'tasks') {
      useTaskStore.getState().replaceFromSystem(msg.tasks as Task[]);
      return;
    }
    if (msg.type === 'token') {
      useChatStore.getState().appendToken(msg.content ?? '');
      return;
    }
    if (msg.type === 'done') {
      useChatStore.getState().finishStreaming();
      return;
    }
    if (msg.type === 'error') {
      useChatStore.getState().setError(msg.message ?? 'unknown error');
    }
  }, []);

  const { connected, connectedToken } = useWebSocket(
    handleWsMessage,
    () => (hasShareToken ? null : auth.accessToken),
    hasShareToken ? null : auth.accessToken,
    hasShareToken ? undefined : auth.refreshAccessToken,
  );
  const displayConnected = hasShareToken ? true : auth.isAuthenticated ? connected : true;

  const getDefaultProjectName = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `Проект ${year}-${month}-${day}`;
  }, []);

  useEffect(() => {
    if (hasShareToken) {
      setWorkspace({ kind: 'shared' });
      return;
    }

    const projectId = auth.project?.id;
    if (!auth.isAuthenticated || !projectId) {
      setWorkspace((current) => current.kind === 'draft' ? current : { kind: 'guest' });
      return;
    }

    setWorkspace((current) => {
      if (current.kind === 'draft') {
        return current;
      }
      if (current.kind === 'project' && current.projectId === projectId) {
        return current;
      }
      return { kind: 'project', projectId, chatOpen: false };
    });
  }, [auth.isAuthenticated, auth.project?.id, hasShareToken, setWorkspace]);

  const closeProjectChat = useCallback(() => {
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: false } : current);
  }, [setWorkspace]);

  const openProjectChat = useCallback(() => {
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
  }, [setWorkspace]);

  const toggleProjectChat = useCallback(() => {
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: !current.chatOpen } : current);
  }, [setWorkspace]);

  const resetWorkspacePresentation = useCallback(() => {
    replaceTasksFromSystem([]);
    useChatStore.getState().reset();
  }, [replaceTasksFromSystem]);

  const createPlaceholderTask = useCallback((): Task => {
    const today = new Date().toISOString().split('T')[0];
    return {
      id: `task-${Date.now()}`,
      name: 'Новая задача',
      startDate: today,
      endDate: today,
    };
  }, []);

  const submitChatMessage = useCallback(async (message: string) => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      return false;
    }

    let response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        return false;
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return true;
  }, [auth]);

  const handleSend = useCallback((text: string) => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    useChatStore.getState().addMessage({ role: 'user', content: text });
    openProjectChat();
    void submitChatMessage(text).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
  }, [auth.isAuthenticated, hasShareToken, openProjectChat, setShowOtpModal, submitChatMessage]);

  const activateDraftWorkspace = useCallback(async ({
    firstPrompt,
    createEmptyChart = false,
  }: {
    firstPrompt?: string;
    createEmptyChart?: boolean;
  }): Promise<boolean> => {
    if (hasShareToken) {
      return false;
    }
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return false;
    }
    if (workspace.kind !== 'draft' || activationInFlightRef.current) {
      return false;
    }

    activationInFlightRef.current = true;
    createEmptyChartAfterActivationRef.current = createEmptyChart;
    queuedPromptRef.current = firstPrompt ?? null;
    resetWorkspacePresentation();

    if (firstPrompt) {
      useChatStore.getState().addMessage({ role: 'user', content: firstPrompt });
    }

    setWorkspace((current) => current.kind === 'draft'
      ? { ...current, queuedPrompt: firstPrompt ?? null, activation: 'creating' }
      : current);

    const newProject = await auth.createProject(workspace.draftName);
    if (!newProject) {
      useChatStore.getState().finishStreaming();
      queuedPromptRef.current = null;
      setWorkspace((current) => current.kind === 'draft'
        ? { ...current, queuedPrompt: null, activation: 'idle' }
        : current);
      activationInFlightRef.current = false;
      createEmptyChartAfterActivationRef.current = false;
      return false;
    }

    setWorkspace((current) => current.kind === 'draft'
      ? { ...current, activation: 'switching' }
      : current);

    await auth.switchProject(newProject.id);
    setProjectSidebarVisible(false);
    if (createEmptyChart) {
      setTasks([createPlaceholderTask()]);
    } else {
      replaceTasksFromSystem([]);
    }
    setWorkspace({ kind: 'project', projectId: newProject.id, chatOpen: !createEmptyChart });
    activationInFlightRef.current = false;
    return true;
  }, [auth, createPlaceholderTask, hasShareToken, replaceTasksFromSystem, resetWorkspacePresentation, setProjectSidebarVisible, setShowOtpModal, setTasks, setWorkspace, workspace]);

  const handleStartScreenSend = useCallback(async (text: string) => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
      return;
    }
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ firstPrompt: text });
      return;
    }
    handleSend(text);
  }, [activateDraftWorkspace, auth.isAuthenticated, handleSend, hasShareToken, setShowOtpModal, workspace.kind]);

  const handleValidation = useCallback((result: ValidationResult) => {
    setValidationErrors(result.isValid ? [] : result.errors);
    // Log validation errors to console for debugging (not shown in UI)
    if (!result.isValid && result.errors.length > 0) {
      console.warn('[Gantt Validation] Dependency validation errors detected:', result.errors);
    }
  }, [setValidationErrors]);

  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    void batchUpdate.handleTasksChange(shiftedTasks);
  }, [batchUpdate]);

  const handleEmptyChart = useCallback(async () => {
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ createEmptyChart: true });
      return;
    }
    void batchUpdate.handleAdd(createPlaceholderTask());
    openProjectChat();
  }, [activateDraftWorkspace, batchUpdate, createPlaceholderTask, openProjectChat, workspace.kind]);

  const handleSwitchProject = useCallback(async (projectId: string) => {
    // Keep sidebar open after switching projects
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    resetWorkspacePresentation();
    await auth.switchProject(projectId);
    setWorkspace({ kind: 'project', projectId, chatOpen: false });
  }, [auth, resetWorkspacePresentation, setWorkspace]);

  const handleCreateProject = useCallback(async () => {
    if (auth.isAuthenticated) {
      createEmptyChartAfterActivationRef.current = false;
      queuedPromptRef.current = null;
      resetWorkspacePresentation();
      setWorkspace({
        kind: 'draft',
        draftName: getDefaultProjectName(),
        queuedPrompt: null,
        activation: 'idle',
      });
      return;
    }
    queuedPromptRef.current = null;
    resetWorkspacePresentation();
    setWorkspace({ kind: 'guest' });
  }, [auth.isAuthenticated, getDefaultProjectName, resetWorkspacePresentation, setWorkspace]);

  const handleSaveProjectName = useCallback(async (newName: string) => {
    if (!auth.isAuthenticated) {
      localTasks.setProjectName(newName);
      return;
    }
    if (!auth.accessToken || !auth.project || !auth.user) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`/api/projects/${auth.project.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || 'Failed to update project name');
    }

    const data = await response.json() as { project: { id: string; name: string } };
    auth.login(
      { accessToken: auth.accessToken, refreshToken: localStorage.getItem('gantt_refresh_token') || '' },
      auth.user,
      data.project,
    );
  }, [auth, localTasks]);

  const handleCreateShareLink = useCallback(async () => {
    if (!auth.accessToken || !auth.project) {
      return;
    }
    try {
      setShareStatus('creating');
      const response = await fetch(`/api/projects/${auth.project.id}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as { url: string };
      await navigator.clipboard.writeText(data.url);
      setShareStatus('copied');
      window.setTimeout(() => {
        if (useUIStore.getState().shareStatus === 'copied') {
          useUIStore.getState().setShareStatus('idle');
        }
      }, 2500);
    } catch (createError) {
      console.error('Failed to create share link:', createError);
      setShareStatus('error');
      window.setTimeout(() => {
        if (useUIStore.getState().shareStatus === 'error') {
          useUIStore.getState().setShareStatus('idle');
        }
      }, 2500);
    }
  }, [auth.accessToken, auth.project, setShareStatus]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken) {
      return;
    }
    replaceTasksFromSystem([]);
  }, [auth.isAuthenticated, auth.project?.id, hasShareToken, replaceTasksFromSystem]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || !auth.project?.id || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    const hasQueuedFirstPrompt = Boolean(queuedPromptRef.current);
    if (!hasQueuedFirstPrompt) {
      useChatStore.getState().reset();
    } else {
      useChatStore.setState({ streamingText: '', error: null });
    }

    fetch('/api/messages', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((response) => response.ok
        ? response.json() as Promise<Array<{ role: string; content: string }>>
        : Promise.resolve([]))
      .then((data) => {
        if (createEmptyChartAfterActivationRef.current || hasQueuedFirstPrompt) {
          return;
        }
        useChatStore.setState({
          messages: data.map((message) => ({
            id: crypto.randomUUID(),
            role: message.role as 'user' | 'assistant',
            content: message.content,
          })),
          streamingText: '',
          aiThinking: false,
          error: null,
        });
      })
      .catch(() => {});
  }, [auth.accessToken, auth.isAuthenticated, auth.project?.id, hasShareToken, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || !connected || workspace.kind !== 'project') {
      return;
    }
    if (!auth.accessToken || connectedToken !== auth.accessToken) {
      return;
    }
    const promptToSend = queuedPromptRef.current;
    if (!promptToSend) {
      return;
    }
    queuedPromptRef.current = null;
    void submitChatMessage(promptToSend).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
  }, [auth.accessToken, auth.isAuthenticated, connected, connectedToken, submitChatMessage, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    // Only sync if tasks are actually loaded (length > 0)
    // Don't overwrite stored counts with zero during project switches
    if (tasks.length === 0) {
      return;
    }

    auth.syncProjectTaskCount(workspace.projectId, tasks.length);
  }, [auth, auth.isAuthenticated, hasShareToken, tasks.length, workspace]);

  const handleScrollToToday = useCallback(() => ganttRef.current?.scrollToToday(), []);

  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const workspaceStateId = workspace.kind === 'project'
    ? workspace.projectId
    : workspace.kind === 'shared'
      ? `shared:${sharedProject.shareToken ?? sharedProject.project?.id ?? 'unknown'}`
      : null;

  const handleCollapseAll = useCallback(() => {
    // В controlled режиме (collapsedParentIds передан как prop) библиотека
    // автоматически реагирует на изменения store, поэтому НЕ вызываем ref методы
    // Сохраняем состояние всех свёрнутых родительских задач
    console.log('[App] handleCollapseAll called', {
      workspaceKind: workspace.kind,
      tasksCount: tasks.length,
      projectId: workspaceStateId,
    });
    if (workspaceStateId) {
      // Рекурсивно находим все родительские задачи (не только root)
      const getAllParentIds = (tasks: Task[]): string[] => {
        const parentIds = new Set<string>();

        // Сначала собираем всех прямых родителей
        tasks.forEach(task => {
          if (task.parentId) {
            parentIds.add(task.parentId);
          }
        });

        // Возвращаем только те ID, которые существуют в tasks и являются родителями
        return Array.from(parentIds).filter(id =>
          tasks.some(t => t.id === id)
        );
      };

      // Для отладки: покажем все задачи и их parentId
      console.log('[App] All tasks sample:', tasks.slice(0, 5).map(t => ({ id: t.id, name: t.name, parentId: t.parentId })));

      // Рекурсивно собираем ВСЕ родительские задачи (не только root)
      const allParentIds = getAllParentIds(tasks);
      console.log('[App] Found all parent IDs (recursive):', allParentIds);
      setProjectState(workspaceStateId, { collapsedParentIds: allParentIds });
    }
  }, [tasks, workspace, workspaceStateId, setProjectState]);

  const handleExpandAll = useCallback(() => {
    // В controlled режиме (collapsedParentIds передан как prop) библиотека
    // автоматически реагирует на изменения store, поэтому НЕ вызываем ref методы
    // Сохраняем пустое состояние (все развёрнуты)
    console.log('[App] handleExpandAll called', { workspaceKind: workspace.kind, projectId: workspaceStateId });
    if (workspaceStateId) {
      console.log('[App] Expanding all - clearing collapsedParentIds');
      setProjectState(workspaceStateId, { collapsedParentIds: [] });
    }
  }, [workspace, workspaceStateId, setProjectState]);

  const shareStatus = useUIStore((state) => state.shareStatus);
  const currentProjectLabel = hasShareToken
    ? (sharedProject.project?.name || 'Shared project')
    : workspace.kind === 'draft'
      ? workspace.draftName
      : auth.isAuthenticated
        ? auth.project?.name
        : (localTasks.projectName || 'Мой проект');

  const workspaceShell = workspace.kind === 'shared'
    ? (
      <SharedWorkspace
        ganttRef={ganttRef}
        displayConnected={displayConnected}
        onScrollToToday={handleScrollToToday}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
        onValidation={handleValidation}
      />
    )
    : workspace.kind === 'draft'
      ? (
        <DraftWorkspace
          isAuthenticated={auth.isAuthenticated}
          onSend={handleStartScreenSend}
          onEmptyChart={handleEmptyChart}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      )
      : workspace.kind === 'project'
        ? (
          <ProjectWorkspace
            ganttRef={ganttRef}
            hasShareToken={hasShareToken}
            displayConnected={displayConnected}
            isAuthenticated={auth.isAuthenticated}
            batchUpdate={batchUpdate}
            onSend={handleSend}
            onLoginRequired={() => setShowOtpModal(true)}
            onCloseChat={closeProjectChat}
            onToggleChat={toggleProjectChat}
            onScrollToToday={handleScrollToToday}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            onValidation={handleValidation}
            onCascade={handleCascade}
            shareStatus={shareStatus}
            onCreateShareLink={handleCreateShareLink}
          />
        )
        : (
          <GuestWorkspace
            ganttRef={ganttRef}
            isAuthenticated={auth.isAuthenticated}
            batchUpdate={batchUpdate}
            onSend={handleStartScreenSend}
            onEmptyChart={handleEmptyChart}
            onLoginRequired={() => setShowOtpModal(true)}
            onScrollToToday={handleScrollToToday}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            onValidation={handleValidation}
            onCascade={handleCascade}
            shareStatus={shareStatus}
            onCreateShareLink={handleCreateShareLink}
          />
        );

  return (
    <>
      <ProjectMenu
        error={error}
        hasShareToken={hasShareToken}
        currentProjectLabel={currentProjectLabel}
        onCreateProject={handleCreateProject}
        onSwitchProject={handleSwitchProject}
        onSaveProjectName={handleSaveProjectName}
        onCreateShareLink={handleCreateShareLink}
        onLoginRequired={() => setShowOtpModal(true)}
        ganttRef={ganttRef}
      >
        {workspaceShell}
      </ProjectMenu>

      {showOtpModal && (
        <OtpModal
          onSuccess={async (result) => {
            auth.login(result, result.user, result.project);
            setShowOtpModal(false);

            const hasLocalEdits = localTasks.tasks.length > 0;
            if (hasLocalEdits) {
              try {
                await fetch('/api/tasks', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${result.accessToken}`,
                  },
                  body: JSON.stringify(localTasks.tasks),
                });
                localStorage.removeItem('gantt_local_tasks');
                localStorage.removeItem('gantt_demo_mode');
              } catch (importError) {
                console.error('Failed to import local tasks after login:', importError);
              }
            }

            const defaultProjectName = 'Мой проект';
            if (localTasks.projectName && localTasks.projectName !== defaultProjectName) {
              try {
                await fetch(`/api/projects/${result.project.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${result.accessToken}`,
                  },
                  body: JSON.stringify({ name: localTasks.projectName }),
                });
                auth.login(result, result.user, { ...result.project, name: localTasks.projectName });
              } catch (transferError) {
                console.error('Failed to transfer project name after login:', transferError);
              }
            }
          }}
          onClose={() => setShowOtpModal(false)}
        />
      )}

      {showEditProjectModal && (
        <EditProjectModal
          projectName={auth.isAuthenticated && auth.project ? auth.project.name : localTasks.projectName}
          onSave={handleSaveProjectName}
          onClose={() => setShowEditProjectModal(false)}
        />
      )}
    </>
  );
}
