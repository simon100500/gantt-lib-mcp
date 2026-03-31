import { useCallback, useEffect, useRef, useState } from 'react';

import { AccountPage } from './components/AccountPage.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { LimitReachedModal } from './components/LimitReachedModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import { PurchasePage } from './components/PurchasePage.tsx';
import type { GanttChartRef } from './components/GanttChart.tsx';
import { ProjectMenu } from './components/layout/ProjectMenu.tsx';
import { DraftWorkspace } from './components/workspace/DraftWorkspace.tsx';
import { GuestWorkspace } from './components/workspace/GuestWorkspace.tsx';
import { ProjectWorkspace } from './components/workspace/ProjectWorkspace.tsx';
import { SharedWorkspace } from './components/workspace/SharedWorkspace.tsx';
import { useAuth, type UseAuthResult } from './hooks/useAuth.ts';
import { useBatchTaskUpdate } from './hooks/useBatchTaskUpdate.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useSharedProject } from './hooks/useSharedProject.ts';
import { useTaskMutation } from './hooks/useTaskMutation.ts';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import { useAuthStore } from './stores/useAuthStore.ts';
import { useBillingStore } from './stores/useBillingStore.ts';
import { useChatStore } from './stores/useChatStore.ts';
import { useTaskStore } from './stores/useTaskStore.ts';
import { useUIStore } from './stores/useUIStore.ts';
import { useProjectUIStore } from './stores/useProjectUIStore.ts';
import type { Task, ValidationResult } from './types.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';

interface RouteState {
  pathname: string;
  search: string;
}

export default function App() {
  const auth = useAuth();
  const localTasks = useLocalTasks();
  const showOtpModal = useUIStore((state) => state.showOtpModal);
  const showEditProjectModal = useUIStore((state) => state.showEditProjectModal);
  const setShowOtpModal = useUIStore((state) => state.setShowOtpModal);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const [route, setRoute] = useState<RouteState>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      return;
    }

    const params = new URLSearchParams(route.search);
    if (params.get('auth') !== 'otp') {
      return;
    }

    setShowOtpModal(true);
  }, [auth.isAuthenticated, route.search, setShowOtpModal]);

  const handleOtpSuccess = useCallback(async (result: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    project: { id: string; name: string; ganttDayMode: 'business' | 'calendar' };
  }) => {
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
  }, [auth, localTasks, setShowOtpModal]);

  const isPurchaseRoute = route.pathname === '/purchase';
  const isAccountRoute = route.pathname === '/account';
  const initialPurchasePlan = new URLSearchParams(route.search).get('plan');

  return (
    <>
      {isPurchaseRoute ? (
        <PurchasePage
          initialPlan={initialPurchasePlan}
          isAuthenticated={auth.isAuthenticated}
          userEmail={auth.user?.email ?? null}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : isAccountRoute ? (
        <AccountPage
          isAuthenticated={auth.isAuthenticated}
          userEmail={auth.user?.email ?? null}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      ) : (
        <WorkspaceApp
          auth={auth}
          localTasks={localTasks}
          onLoginRequired={() => setShowOtpModal(true)}
        />
      )}

      {showOtpModal && (
        <OtpModal
          onSuccess={handleOtpSuccess}
          onClose={() => setShowOtpModal(false)}
        />
      )}

      {!isPurchaseRoute && !isAccountRoute && showEditProjectModal && (
        <EditProjectModal
          projectName={auth.isAuthenticated && auth.project ? auth.project.name : localTasks.projectName}
          onSave={async (name) => {
            if (!auth.isAuthenticated) {
              localTasks.setProjectName(name);
              return;
            }
            if (!auth.accessToken || !auth.project || !auth.user) {
              throw new Error('Not authenticated');
            }

            await auth.updateProject(auth.project.id, { name });
          }}
          onClose={() => setShowEditProjectModal(false)}
        />
      )}
    </>
  );
}

interface WorkspaceAppProps {
  auth: UseAuthResult;
  localTasks: ReturnType<typeof useLocalTasks>;
  onLoginRequired: () => void;
}

function WorkspaceApp({ auth, localTasks, onLoginRequired }: WorkspaceAppProps) {
  const sharedProject = useSharedProject();
  const workspace = useUIStore((state) => state.workspace);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const setSidebarState = useUIStore((state) => state.setSidebarState);
  const showBillingPage = useUIStore((state) => state.showBillingPage);
  const setShowBillingPage = useUIStore((state) => state.setShowBillingPage);
  const setValidationErrors = useUIStore((state) => state.setValidationErrors);
  const setShareStatus = useUIStore((state) => state.setShareStatus);
  const hasShareToken = Boolean(sharedProject.shareToken);
  const refreshProjects = auth.refreshProjects;
  const [limitModalScenario, setLimitModalScenario] = useState<'free-ai' | 'paid-ai' | 'project-limit' | null>(null);
  const projectLimitReached = useAuthStore((s) => s.projectLimitReached);

  // Fetch billing subscription on auth to know current plan for modal scenario
  useEffect(() => {
    if (auth.isAuthenticated) {
      void useBillingStore.getState().fetchSubscription();
    }
  }, [auth.isAuthenticated]);

  // Watch projectLimitReached from auth store -> show modal
  useEffect(() => {
    if (projectLimitReached) {
      setLimitModalScenario('project-limit');
      useAuthStore.setState({ projectLimitReached: false });
    }
  }, [projectLimitReached]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || hasShareToken) {
      return;
    }

    void refreshProjects();
  }, [auth.accessToken, auth.isAuthenticated, hasShareToken, refreshProjects]);

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

    if (response.status === 403) {
      try {
        const body = await response.json() as { code?: string };
        if (body.code === 'AI_LIMIT_REACHED') {
          const plan = useBillingStore.getState().subscription?.plan ?? 'free';
          setLimitModalScenario(plan === 'free' ? 'free-ai' : 'paid-ai');
          return false;
        }
      } catch {
        // response body not JSON — fall through to generic error
      }
      throw new Error(`HTTP 403`);
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
      onLoginRequired();
      return;
    }
    useChatStore.getState().addMessage({ role: 'user', content: text });
    openProjectChat();
    void submitChatMessage(text).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
  }, [auth.isAuthenticated, hasShareToken, onLoginRequired, openProjectChat, submitChatMessage]);

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
      onLoginRequired();
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

    const projectName = workspace.draftName.trim() || getDefaultProjectName();
    const newProject = await auth.createProject(projectName);
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
    setSidebarState('closed');
    if (createEmptyChart) {
      setTasks([createPlaceholderTask()]);
    } else {
      replaceTasksFromSystem([]);
    }
    setWorkspace({ kind: 'project', projectId: newProject.id, chatOpen: !createEmptyChart });
    activationInFlightRef.current = false;
    return true;
  }, [auth, createPlaceholderTask, getDefaultProjectName, hasShareToken, onLoginRequired, replaceTasksFromSystem, resetWorkspacePresentation, setSidebarState, setTasks, setWorkspace, workspace]);

  const handleStartScreenSend = useCallback(async (text: string) => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ firstPrompt: text });
      return;
    }
    handleSend(text);
  }, [activateDraftWorkspace, auth.isAuthenticated, handleSend, hasShareToken, onLoginRequired, workspace.kind]);

  const handleValidation = useCallback((result: ValidationResult) => {
    setValidationErrors(result.isValid ? [] : result.errors);
    if (!result.isValid && result.errors.length > 0) {
      console.warn('[Gantt Validation] Dependency validation errors detected:', result.errors);
    }
  }, [setValidationErrors]);

  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    void batchUpdate.handleTasksChange(shiftedTasks);
  }, [batchUpdate]);

  const handleEmptyChart = useCallback(async () => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (workspace.kind === 'draft') {
      await activateDraftWorkspace({ createEmptyChart: true });
      return;
    }
    void batchUpdate.handleAdd(createPlaceholderTask());
    openProjectChat();
  }, [activateDraftWorkspace, auth.isAuthenticated, batchUpdate, createPlaceholderTask, hasShareToken, onLoginRequired, openProjectChat, workspace.kind]);

  const handleSwitchProject = useCallback(async (projectId: string) => {
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
        draftName: '',
        queuedPrompt: null,
        activation: 'idle',
      });
      return;
    }
    queuedPromptRef.current = null;
    resetWorkspacePresentation();
    setWorkspace({ kind: 'guest' });
  }, [auth.isAuthenticated, resetWorkspacePresentation, setWorkspace]);

  const handleSaveProjectName = useCallback(async (newName: string) => {
    if (!auth.isAuthenticated) {
      localTasks.setProjectName(newName);
      return;
    }
    if (!auth.project) {
      throw new Error('Not authenticated');
    }
    await auth.updateProject(auth.project.id, { name: newName });
  }, [auth, localTasks]);

  const handleGanttDayModeChange = useCallback(async (ganttDayMode: 'business' | 'calendar') => {
    if (!auth.project) {
      throw new Error('Not authenticated');
    }

    if (auth.project.ganttDayMode === ganttDayMode) {
      return;
    }

    await auth.updateProject(auth.project.id, { ganttDayMode });
  }, [auth]);

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
    console.log('[App] handleCollapseAll called', {
      workspaceKind: workspace.kind,
      tasksCount: tasks.length,
      projectId: workspaceStateId,
    });
    if (workspaceStateId) {
      const getAllParentIds = (allTasks: Task[]): string[] => {
        const parentIds = new Set<string>();

        allTasks.forEach((task) => {
          if (task.parentId) {
            parentIds.add(task.parentId);
          }
        });

        return Array.from(parentIds).filter((id) => allTasks.some((task) => task.id === id));
      };

      console.log('[App] All tasks sample:', tasks.slice(0, 5).map((task) => ({ id: task.id, name: task.name, parentId: task.parentId })));
      const allParentIds = getAllParentIds(tasks);
      console.log('[App] Found all parent IDs (recursive):', allParentIds);
      setProjectState(workspaceStateId, { collapsedParentIds: allParentIds });
    }
  }, [tasks, workspace, workspaceStateId, setProjectState]);

  const handleExpandAll = useCallback(() => {
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
      ? undefined
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
        ganttDayMode={sharedProject.project?.ganttDayMode ?? 'business'}
      />
    )
    : workspace.kind === 'draft'
      ? (
        <DraftWorkspace
          isAuthenticated={auth.isAuthenticated}
          onSend={handleStartScreenSend}
          onEmptyChart={handleEmptyChart}
          onLoginRequired={onLoginRequired}
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
            onLoginRequired={onLoginRequired}
            onCloseChat={closeProjectChat}
            onToggleChat={toggleProjectChat}
            onScrollToToday={handleScrollToToday}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            onValidation={handleValidation}
            onCascade={handleCascade}
            shareStatus={shareStatus}
            onCreateShareLink={handleCreateShareLink}
            ganttDayMode={auth.project?.ganttDayMode ?? 'business'}
            onGanttDayModeChange={(ganttDayMode) => {
              void handleGanttDayModeChange(ganttDayMode).catch((error) => {
                console.error('Failed to update gantt day mode:', error);
              });
            }}
          />
        )
        : (
          <GuestWorkspace
            ganttRef={ganttRef}
            isAuthenticated={auth.isAuthenticated}
            batchUpdate={batchUpdate}
            onSend={handleStartScreenSend}
            onEmptyChart={handleEmptyChart}
            onLoginRequired={onLoginRequired}
            onScrollToToday={handleScrollToToday}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            onValidation={handleValidation}
            onCascade={handleCascade}
            shareStatus={shareStatus}
            onCreateShareLink={handleCreateShareLink}
            ganttDayMode="business"
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
      onLoginRequired={onLoginRequired}
      ganttRef={ganttRef}
    >
      {showBillingPage && auth.isAuthenticated ? (
        <ButtonlessAccountRedirect onClose={() => setShowBillingPage(false)} />
      ) : (
        workspaceShell
      )}
    </ProjectMenu>

    {limitModalScenario && (
      <LimitReachedModal
        scenario={limitModalScenario}
        onClose={() => setLimitModalScenario(null)}
      />
    )}
    </>
  );
}

function ButtonlessAccountRedirect({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    onClose();
    window.location.href = '/account';
  }, [onClose]);

  return null;
}
