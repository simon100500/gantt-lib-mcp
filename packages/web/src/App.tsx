import { useCallback, useEffect, useRef, useState } from 'react';

import { AccountPage } from './components/AccountPage.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { DeleteProjectModal } from './components/DeleteProjectModal.tsx';
import { CreateProjectModal } from './components/CreateProjectModal.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { LimitReachedModal } from './components/LimitReachedModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import { PurchasePage } from './components/PurchasePage.tsx';
import { YandexCallbackPage } from './components/YandexCallbackPage.tsx';
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
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import type { AuthSuccessResponse, ProjectLoadResponse } from './lib/apiTypes.ts';
import { PLAN_LABELS, type PlanId } from './lib/billing.ts';
import { normalizeConstraintDenialPayload, type ConstraintDenialPayload, type ConstraintLimitKey } from './lib/constraintUi.ts';
import { useAuthStore } from './stores/useAuthStore.ts';
import { useBillingStore, type SubscriptionStatus, type UsageStatus } from './stores/useBillingStore.ts';
import { useChatStore } from './stores/useChatStore.ts';
import { useTaskStore } from './stores/useTaskStore.ts';
import { useUIStore } from './stores/useUIStore.ts';
import { useProjectUIStore } from './stores/useProjectUIStore.ts';
import { useProjectStore } from './stores/useProjectStore.ts';
import { normalizeTasks, type Task, type ValidationResult } from './types.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const EMPTY_CALENDAR_DAYS: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }> = [];

interface RouteState {
  pathname: string;
  search: string;
}

type BillingConstraintStatus = UsageStatus | SubscriptionStatus | null;

function isConstraintCode(code: string | undefined): code is ConstraintDenialPayload['code'] {
  return code === 'PROJECT_LIMIT_REACHED' || code === 'AI_LIMIT_REACHED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'ARCHIVE_FEATURE_LOCKED' || code === 'EXPORT_FEATURE_LOCKED';
}

function buildProactiveConstraintDenial(
  limitKey: ConstraintLimitKey | 'archive' | 'resource_pool',
  status: BillingConstraintStatus,
): Partial<ConstraintDenialPayload> | null {
  const plan = ((status?.plan as PlanId | undefined) ?? 'free');
  const planLabel = status?.planMeta.label ?? PLAN_LABELS[plan];

  if (status && 'isActive' in status && !status.isActive && plan !== 'free') {
    return {
      code: 'SUBSCRIPTION_EXPIRED',
      limitKey: null,
      reasonCode: 'subscription_expired',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: 'Продлите тариф, чтобы снова создавать проекты и пользоваться AI.',
    };
  }

  // Boolean feature gates (archive, resource_pool)
  if (limitKey === 'archive' || limitKey === 'resource_pool') {
    const limitValue = status?.limits?.[limitKey];
    if (limitValue === true) {
      return null;
    }
    const gateCode = limitKey === 'archive' ? 'ARCHIVE_FEATURE_LOCKED' : 'RESOURCE_POOL_FEATURE_LOCKED';
    const hint = limitKey === 'archive'
      ? 'Не теряйте доступ к проектам — расширьте тариф и используйте архив.'
      : 'Пул ресурсов доступен на тарифе Старт и выше.';
    return {
      code: gateCode,
      limitKey,
      reasonCode: 'feature_disabled',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: hint,
    };
  }

  const usageEntry = limitKey === 'projects' ? status?.usage.projects : status?.usage.ai_queries;
  const remainingEntry = limitKey === 'projects' ? status?.remaining.projects : status?.remaining.ai_queries;
  if (remainingEntry?.remainingState !== 'tracked' || remainingEntry.remaining > 0) {
    return null;
  }

  return {
    code: limitKey === 'projects' ? 'PROJECT_LIMIT_REACHED' : 'AI_LIMIT_REACHED',
    limitKey,
    reasonCode: 'limit_reached',
    remaining: remainingEntry.remaining,
    plan,
    planLabel,
    upgradeHint: limitKey === 'projects'
      ? 'Лимит активных проектов исчерпан. Освободите слот или обновите тариф.'
      : 'Лимит AI-запросов исчерпан. Обновите тариф, чтобы продолжить работу с ассистентом.',
    used: usageEntry?.usageState === 'tracked' ? usageEntry.used : undefined,
    limit: remainingEntry.limit,
  };
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function buildDependencyRowsFromTasks(tasks: Task[]) {
  return tasks.flatMap((task) =>
    (task.dependencies ?? []).map((dependency, index) => ({
      id: `${task.id}:${dependency.taskId}:${dependency.type}:${index}`,
      taskId: task.id,
      depTaskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  );
}

function summarizeTasksForLog(tasks: Task[]) {
  return tasks.slice(0, 20).map((task) => ({
    id: task.id,
    name: task.name,
    startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
    endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: dependency.lag ?? 0,
    })),
  }));
}

type PreviewState = {
  tasks: Task[];
  active: boolean;
  mode: 'rendering' | 'failed';
  message: string | null;
};

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
    const requestedAuthMode = params.get('auth');
    if (requestedAuthMode !== 'otp' && requestedAuthMode !== 'yandex') {
      return;
    }

    setShowOtpModal(true);
  }, [auth.isAuthenticated, route.search, setShowOtpModal]);

  const handleAuthSuccess = useCallback(async (result: AuthSuccessResponse) => {
    auth.login(result, result.user, result.project);
    setShowOtpModal(false);

    const hasLocalEdits = localTasks.tasks.length > 0;
    if (hasLocalEdits) {
      try {
        let currentVersionResponse = await fetch('/api/project', {
          headers: {
            Authorization: `Bearer ${result.accessToken}`,
          },
        });

        if (!currentVersionResponse.ok) {
          throw new Error(`Failed to load project version: ${currentVersionResponse.status}`);
        }

        let currentVersion = (await currentVersionResponse.json() as ProjectLoadResponse).version;

        for (const task of localTasks.tasks) {
          const commitResponse = await fetch('/api/commands/commit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${result.accessToken}`,
            },
            body: JSON.stringify({
              clientRequestId: crypto.randomUUID(),
              baseVersion: currentVersion,
              command: {
                type: 'create_task',
                task: {
                  name: task.name,
                  startDate: typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString().split('T')[0],
                  endDate: typeof task.endDate === 'string' ? task.endDate : task.endDate.toISOString().split('T')[0],
                  type: task.type,
                  color: task.color,
                  parentId: task.parentId,
                  progress: task.progress,
                  dependencies: task.dependencies,
                },
              },
            }),
          });

          if (!commitResponse.ok) {
            throw new Error(`Failed to import local task: ${commitResponse.status}`);
          }

          const commitResult = await commitResponse.json() as { accepted: boolean; newVersion?: number; reason?: string };
          if (!commitResult.accepted || commitResult.newVersion === undefined) {
            throw new Error(`Failed to import local task: ${commitResult.reason ?? 'unknown error'}`);
          }

          currentVersion = commitResult.newVersion;
        }

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

  const normalizedPathname = normalizePathname(route.pathname);
  const authModalMethod = new URLSearchParams(route.search).get('auth') === 'otp' ? 'otp' : 'yandex';
  const isYandexCallbackRoute = normalizedPathname === '/auth/yandex/callback';
  const isPurchaseRoute = normalizedPathname === '/purchase';
  const isAccountRoute = normalizedPathname === '/account';
  const isAdminRoute = normalizedPathname === '/admin';
  const purchaseParams = new URLSearchParams(route.search);
  const initialPurchasePlan = purchaseParams.get('plan');
  const initialPurchasePeriod = purchaseParams.get('period');
  const autoPurchaseCheckout = purchaseParams.get('checkout') === '1';

  return (
    <>
      {isYandexCallbackRoute ? (
        <YandexCallbackPage />
      ) : isPurchaseRoute ? (
        <PurchasePage
          initialPlan={initialPurchasePlan}
          initialPeriod={initialPurchasePeriod}
          autoCheckout={autoPurchaseCheckout}
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
      ) : isAdminRoute ? (
        <AdminPage
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
          initialMethod={authModalMethod}
          onSuccess={handleAuthSuccess}
          onClose={() => setShowOtpModal(false)}
        />
      )}

      {!isYandexCallbackRoute && !isPurchaseRoute && !isAccountRoute && !isAdminRoute && showEditProjectModal && (
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
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const [deleteProjectDraft, setDeleteProjectDraft] = useState<{ id: string; name: string } | null>(null);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const hasShareToken = Boolean(sharedProject.shareToken);
  const refreshProjects = auth.refreshProjects;
  const [limitModal, setLimitModal] = useState<{
    denial: ConstraintDenialPayload;
    usage: BillingConstraintStatus;
  } | null>(null);
  const constraintDenial = useAuthStore((s) => s.constraintDenial);
  const subscription = useBillingStore((state) => state.subscription);
  const usage = useBillingStore((state) => state.usage);
  const fetchSubscription = useBillingStore((state) => state.fetchSubscription);
  const fetchUsage = useBillingStore((state) => state.fetchUsage);
  const billingStatus = usage ?? subscription;
  const proactiveProjectDenial = buildProactiveConstraintDenial('projects', billingStatus);
  const proactiveChatDenial = buildProactiveConstraintDenial('ai_queries', billingStatus);
  const proactiveArchiveDenial = buildProactiveConstraintDenial('archive', billingStatus);
  const isArchivedProject = !hasShareToken && workspace.kind === 'project' && auth.project?.status === 'archived';
  const chatDisabledReason = isArchivedProject
    ? 'Проект в архиве. AI-изменения недоступны в режиме только чтения.'
    : proactiveChatDenial
      ? proactiveChatDenial.code === 'SUBSCRIPTION_EXPIRED'
        ? 'Подписка истекла. Продлите тариф, чтобы снова отправлять запросы.'
        : 'Лимит AI-запросов исчерпан. Обновите тариф, чтобы продолжить.'
      : null;

  const openLimitModal = useCallback(async (denial: Partial<ConstraintDenialPayload> | null | undefined) => {
    if (!denial?.code) {
      return;
    }

    if (auth.isAuthenticated && !hasShareToken) {
      await Promise.all([fetchSubscription(), fetchUsage()]);
    }

    const nextBillingStatus = useBillingStore.getState().usage ?? useBillingStore.getState().subscription;
    const normalizedDenial = normalizeConstraintDenialPayload(denial, nextBillingStatus);
    if (!normalizedDenial) {
      return;
    }

    setLimitModal({
      denial: normalizedDenial,
      usage: nextBillingStatus,
    });
  }, [auth.isAuthenticated, fetchUsage, hasShareToken]);

  useEffect(() => {
    if (auth.isAuthenticated && !hasShareToken) {
      void Promise.all([fetchSubscription(), fetchUsage()]);
    }
  }, [auth.isAuthenticated, fetchSubscription, fetchUsage, hasShareToken]);

  useEffect(() => {
    if (!constraintDenial) {
      return;
    }

    void openLimitModal(constraintDenial).finally(() => {
      useAuthStore.setState({ constraintDenial: null });
    });
  }, [openLimitModal, constraintDenial]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || hasShareToken) {
      return;
    }

    void refreshProjects();
  }, [auth.accessToken, auth.isAuthenticated, hasShareToken, refreshProjects]);

  const authenticatedTasks = useTasks(
    hasShareToken ? null : auth.accessToken,
    auth.refreshAccessToken,
    auth.project?.ganttDayMode ?? 'business',
    auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS,
  );
  const { tasks, setTasks, loading, error } = hasShareToken
    ? sharedProject
    : auth.isAuthenticated
      ? authenticatedTasks
      : localTasks;
  const batchUpdate = useBatchTaskUpdate({
    tasks,
    setTasks,
    accessToken: hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null,
    ganttDayMode: hasShareToken ? (sharedProject.project?.ganttDayMode ?? 'business') : (auth.project?.ganttDayMode ?? 'business'),
    calendarDays: hasShareToken
      ? (sharedProject.project?.calendarDays ?? EMPTY_CALENDAR_DAYS)
      : (auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS),
  });
  const ganttRef = useRef<GanttChartRef>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({ tasks: [], active: false, mode: 'rendering', message: null });
  const activationInFlightRef = useRef(false);
  const createEmptyChartAfterActivationRef = useRef(false);
  const queuedPromptRef = useRef<string | null>(null);
  const [activeEmptyProjectModeProjectId, setActiveEmptyProjectModeProjectId] = useState<string | null>(null);

  const replaceTasksFromSystem = useCallback((nextTasks: Task[]) => {
    setTasks(nextTasks);
  }, [setTasks]);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    console.log('[WS] message', msg);
    if (msg.type === 'preview_tasks') {
      const normalizedPreviewTasks = normalizeTasks(msg.tasks as Task[]);
      setPreviewState({
        tasks: normalizedPreviewTasks,
        active: true,
        mode: 'rendering',
        message: null,
      });
      return;
    }
    if (msg.type === 'preview_failed') {
      setPreviewState((current) => current.active
        ? {
            ...current,
            mode: 'failed',
            message: msg.message ?? 'Предварительный график не был сохранён.',
          }
        : current);
      useChatStore.getState().setError(msg.message ?? 'Предварительный график не был сохранён.');
      return;
    }
    if (msg.type === 'tasks') {
      const normalizedTasks = normalizeTasks(msg.tasks as Task[]);
      console.log('[WS->UI] tasks', {
        taskCount: normalizedTasks.length,
        tasks: summarizeTasksForLog(normalizedTasks),
      });
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
      useTaskStore.getState().replaceFromSystem(normalizedTasks);

      if (!hasShareToken && auth.isAuthenticated) {
        const projectStore = useProjectStore.getState();
        console.log('[WS->PROJECT_STORE] mergeConfirmedSnapshot', {
          taskCount: normalizedTasks.length,
          tasks: summarizeTasksForLog(normalizedTasks),
        });
        projectStore.mergeConfirmedSnapshot({
          tasks: normalizedTasks,
          dependencies: buildDependencyRowsFromTasks(normalizedTasks),
        });
      }
      return;
    }
    if (msg.type === 'token') {
      useChatStore.getState().appendToken(msg.content ?? '');
      return;
    }
    if (msg.type === 'done') {
      setPreviewState((current) => current.mode === 'failed'
        ? current
        : { tasks: [], active: false, mode: 'rendering', message: null });
      useChatStore.getState().finishStreaming();
      return;
    }
    if (msg.type === 'error') {
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
      useChatStore.getState().setError(msg.message ?? 'unknown error');
    }
  }, [auth.isAuthenticated, hasShareToken]);

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

  useEffect(() => {
    setActiveEmptyProjectModeProjectId(null);
  }, [auth.project?.id]);

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
    setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
    replaceTasksFromSystem([]);
    useProjectStore.getState().hydrateConfirmed(0, { tasks: [], dependencies: [] });
    useChatStore.getState().reset();
  }, [replaceTasksFromSystem]);

  const submitChatMessage = useCallback(async (message: string) => {
    if (isArchivedProject) {
      return false;
    }

    if (proactiveChatDenial) {
      await openLimitModal(proactiveChatDenial);
      return false;
    }

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
        const body = await response.json() as Partial<ConstraintDenialPayload>;
        if (isConstraintCode(body.code)) {
          await openLimitModal(body);
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
  }, [auth, isArchivedProject, openLimitModal, proactiveChatDenial]);

  const handleSend = useCallback((text: string) => {
    if (hasShareToken) {
      return;
    }
    if (isArchivedProject) {
      return;
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (proactiveChatDenial) {
      void openLimitModal(proactiveChatDenial);
      return;
    }
    if (!auth.project) {
      return;
    }
    if (auth.project?.taskCount === 0) {
      setActiveEmptyProjectModeProjectId(auth.project.id);
    }
    useChatStore.getState().addMessage({ role: 'user', content: text });
    openProjectChat();
    void submitChatMessage(text).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
  }, [auth.isAuthenticated, auth.project, hasShareToken, isArchivedProject, onLoginRequired, openLimitModal, openProjectChat, proactiveChatDenial, submitChatMessage]);

  const activateImplicitProject = useCallback(async ({
    firstPrompt,
    createEmptyChart = false,
  }: {
    firstPrompt?: string;
    createEmptyChart?: boolean;
  }): Promise<boolean> => {
    if (hasShareToken) {
      return false;
    }
    if (!auth.isAuthenticated || activationInFlightRef.current) {
      return false;
    }

    activationInFlightRef.current = true;
    createEmptyChartAfterActivationRef.current = createEmptyChart;
    queuedPromptRef.current = firstPrompt ?? null;
    resetWorkspacePresentation();

    if (firstPrompt) {
      useChatStore.getState().addMessage({ role: 'user', content: firstPrompt });
    }

    const newProject = await auth.createProject(getDefaultProjectName());
    if (!newProject) {
      useChatStore.getState().finishStreaming();
      queuedPromptRef.current = null;
      activationInFlightRef.current = false;
      createEmptyChartAfterActivationRef.current = false;
      return false;
    }

    await auth.switchProject(newProject.id);
    setSidebarState('closed');
    if (createEmptyChart) {
      setActiveEmptyProjectModeProjectId(newProject.id);
    } else {
      replaceTasksFromSystem([]);
    }
    setWorkspace({ kind: 'project', projectId: newProject.id, chatOpen: !createEmptyChart });
    activationInFlightRef.current = false;
    return true;
  }, [auth, getDefaultProjectName, hasShareToken, replaceTasksFromSystem, resetWorkspacePresentation, setSidebarState, setWorkspace]);

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
      setActiveEmptyProjectModeProjectId(newProject.id);
    } else {
      replaceTasksFromSystem([]);
    }
    setWorkspace({ kind: 'project', projectId: newProject.id, chatOpen: !createEmptyChart });
    activationInFlightRef.current = false;
    return true;
  }, [auth, getDefaultProjectName, hasShareToken, onLoginRequired, replaceTasksFromSystem, resetWorkspacePresentation, setProjectState, setSidebarState, setWorkspace, workspace]);

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
    if (!auth.project) {
      await activateImplicitProject({ firstPrompt: text });
      return;
    }
    handleSend(text);
  }, [activateDraftWorkspace, activateImplicitProject, auth.isAuthenticated, auth.project, handleSend, hasShareToken, onLoginRequired, workspace.kind]);

  const handleValidation = useCallback((result: ValidationResult) => {
    setValidationErrors(result.isValid ? [] : result.errors);
    if (!result.isValid && result.errors.length > 0) {
      console.warn('[Gantt Validation] Dependency validation errors detected:', result.errors);
    }
  }, [setValidationErrors]);

  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    if (isArchivedProject) {
      return;
    }
    void batchUpdate.handleTasksChange(shiftedTasks);
  }, [batchUpdate, isArchivedProject]);

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
    if (!auth.project) {
      await activateImplicitProject({ createEmptyChart: true });
      return;
    }
    if (workspace.kind === 'project') {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
  }, [activateDraftWorkspace, activateImplicitProject, auth.isAuthenticated, auth.project, hasShareToken, onLoginRequired, workspace]);

  const handleSwitchProject = useCallback(async (projectId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    useTaskStore.setState({ loading: true, error: null });
    useProjectStore.getState().clearTransientState();
    await auth.switchProject(projectId);
    setWorkspace({ kind: 'project', projectId, chatOpen: false });
  }, [auth, setWorkspace]);

  const handleCreateProject = useCallback(async () => {
    if (auth.isAuthenticated) {
      if (proactiveProjectDenial) {
        await openLimitModal(proactiveProjectDenial);
        return;
      }
      if (!auth.projects.some((project) => project.status !== 'archived')) {
        setShowCreateProjectModal(true);
        return;
      }
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
  }, [auth.isAuthenticated, auth.projects, openLimitModal, proactiveProjectDenial, resetWorkspacePresentation, setWorkspace]);

  const handleArchiveProject = useCallback(async (projectId: string) => {
    if (proactiveArchiveDenial) {
      await openLimitModal(proactiveArchiveDenial);
      return;
    }
    await auth.archiveProject(projectId);
    await fetchUsage();
  }, [auth, fetchUsage, openLimitModal, proactiveArchiveDenial]);

  const handleRestoreProject = useCallback(async (projectId: string) => {
    await auth.restoreProject(projectId);
    await fetchUsage();
  }, [auth, fetchUsage]);

  const handleOpenResourcePool = useCallback(async () => {
    const proactiveResourcePoolDenial = buildProactiveConstraintDenial('resource_pool', billingStatus);
    if (proactiveResourcePoolDenial) {
      await openLimitModal(proactiveResourcePoolDenial);
      return;
    }
    // Resource pool feature for paid tiers — no-op until full implementation
  }, [billingStatus, openLimitModal]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const project = auth.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    setDeleteProjectDraft({
      id: projectId,
      name: project.name,
    });
  }, [auth]);

  const handleSaveProjectName = useCallback(async (newName: string) => {
    if (!auth.isAuthenticated) {
      localTasks.setProjectName(newName);
      return;
    }
    if (!auth.project) {
      throw new Error('Not authenticated');
    }
    if (auth.project.status === 'archived') {
      return;
    }
    await auth.updateProject(auth.project.id, { name: newName });
  }, [auth, localTasks]);

  const handleGanttDayModeChange = useCallback(async (ganttDayMode: 'business' | 'calendar') => {
    if (!auth.project) {
      throw new Error('Not authenticated');
    }
    if (auth.project.status === 'archived') {
      return;
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
    useProjectStore.getState().clearTransientState();
  }, [auth.isAuthenticated, auth.project?.id, hasShareToken]);

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
    if (loading) {
      return;
    }

    auth.syncProjectTaskCount(workspace.projectId, tasks.length);
  }, [auth, auth.isAuthenticated, hasShareToken, loading, tasks.length, workspace]);

  const handleScrollToToday = useCallback(() => ganttRef.current?.scrollToToday(), []);

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
  const visibleTasks = previewState.active ? previewState.tasks : tasks;
  const currentProjectTaskCount = workspace.kind === 'project'
    ? (auth.projects.find((project) => project.id === workspace.projectId)?.taskCount ?? auth.project?.taskCount)
    : undefined;
  const hasActiveProjects = auth.projects.some((project) => project.status !== 'archived');
  const currentProjectIsEmpty = workspace.kind === 'project' && currentProjectTaskCount === 0;
  const hasQueuedProjectPrompt = workspace.kind === 'project' && Boolean(queuedPromptRef.current);
  const projectChatOpen = workspace.kind === 'project' && workspace.chatOpen;
  const showProjectStartScreen = workspace.kind === 'project'
    && !hasShareToken
    && currentProjectIsEmpty
    && !previewState.active
    && !hasQueuedProjectPrompt
    && !projectChatOpen
    && activeEmptyProjectModeProjectId !== workspace.projectId;
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
        tasks={tasks}
        setTasks={setTasks}
        loading={loading}
        sharedProject={sharedProject.project}
        shareToken={sharedProject.shareToken}
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
      : showProjectStartScreen
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
            tasks={visibleTasks}
            setTasks={setTasks}
            loading={loading}
            sharedProject={sharedProject.project}
            shareToken={sharedProject.shareToken}
            hasShareToken={hasShareToken}
            displayConnected={displayConnected}
            isAuthenticated={auth.isAuthenticated}
            chatUsage={billingStatus}
            chatDisabled={isArchivedProject || Boolean(proactiveChatDenial)}
            chatDisabledReason={chatDisabledReason}
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
            calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
            readOnly={isArchivedProject}
            previewState={previewState.active ? previewState.mode : 'idle'}
            previewMessage={previewState.active ? previewState.message : null}
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
            tasks={tasks}
            setTasks={setTasks}
            loading={loading}
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
      isArchivedProject={isArchivedProject}
      currentProjectLabel={currentProjectLabel}
      onCreateProject={handleCreateProject}
      onSwitchProject={handleSwitchProject}
      onArchiveProject={handleArchiveProject}
      onRestoreProject={handleRestoreProject}
      onDeleteProject={handleDeleteProject}
      onOpenResourcePool={handleOpenResourcePool}
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

    {limitModal && (
      <LimitReachedModal
        denial={limitModal.denial}
        usage={limitModal.usage}
        onClose={() => setLimitModal(null)}
        onActivateTrial={auth.isAuthenticated ? async () => {
          const token = useAuthStore.getState().accessToken;
          if (!token) return false;
          try {
            const res = await fetch('/api/billing/trial/start', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ triggerType: 'premium_feature_attempt' }),
            });
            if (!res.ok) return false;
            await fetchSubscription();
            return true;
          } catch { return false; }
        } : undefined}
      />
    )}

    {deleteProjectDraft && (
      <DeleteProjectModal
        projectName={deleteProjectDraft.name}
        onDelete={async () => {
          await auth.deleteProject(deleteProjectDraft.id);
          await fetchUsage();
          setDeleteProjectDraft(null);
        }}
        onClose={() => setDeleteProjectDraft(null)}
      />
    )}

    {showCreateProjectModal && (
      <CreateProjectModal
        onSave={async (name) => {
          const newProject = await auth.createProject(name.trim());
          if (!newProject) {
            return null;
          }

          createEmptyChartAfterActivationRef.current = false;
          queuedPromptRef.current = null;
          resetWorkspacePresentation();
          await auth.switchProject(newProject.id);
          setSidebarState('closed');
          replaceTasksFromSystem([]);
          setWorkspace({ kind: 'project', projectId: newProject.id, chatOpen: false });
          setShowCreateProjectModal(false);
          return { id: newProject.id, name: newProject.name };
        }}
        onClose={() => setShowCreateProjectModal(false)}
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
