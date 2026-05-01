import { useCallback, useEffect, useRef, useState } from 'react';

import { AccountPage } from './components/AccountPage.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { DeleteProjectModal } from './components/DeleteProjectModal.tsx';
import { CreateProjectModal } from './components/CreateProjectModal.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { LimitReachedModal } from './components/LimitReachedModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import { PdfHelperModal, isPdfHelperDismissed } from './components/PdfHelperModal.tsx';
import { PurchasePage } from './components/PurchasePage.tsx';
import { ShareLinksManagerModal } from './components/ShareLinksManagerModal.tsx';
import { buildSplitTaskTrace } from './components/SplitTaskModal.tsx';
import { YandexCallbackPage } from './components/YandexCallbackPage.tsx';
import type { GanttChartRef } from './components/GanttChart.tsx';
import { ProjectMenu } from './components/layout/ProjectMenu.tsx';
import { DraftWorkspace } from './components/workspace/DraftWorkspace.tsx';
import type { StartScreenSendResult } from './components/StartScreen.tsx';
import { GuestWorkspace } from './components/workspace/GuestWorkspace.tsx';
import { ProjectWorkspace } from './components/workspace/ProjectWorkspace.tsx';
import { ResourcePlannerWorkspace } from './components/workspace/ResourcePlannerWorkspace.tsx';
import { SharedWorkspace } from './components/workspace/SharedWorkspace.tsx';
import { useAuth, type UseAuthResult } from './hooks/useAuth.ts';
import { useBatchTaskUpdate } from './hooks/useBatchTaskUpdate.ts';
import { useAppUpdateCheck } from './hooks/useAppUpdateCheck.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useSharedProject } from './hooks/useSharedProject.ts';
import { useTasks } from './hooks/useTasks.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import type { AuthSuccessResponse, ProjectLoadResponse } from './lib/apiTypes.ts';
import { PLAN_LABELS, type PlanId } from './lib/billing.ts';
import { normalizeConstraintDenialPayload, type ConstraintDenialPayload, type ConstraintLimitKey } from './lib/constraintUi.ts';
import { collectTaskSubtreeIds } from './lib/shareLinkSelection.ts';
import { useAuthStore } from './stores/useAuthStore.ts';
import { getExportAccessLevel, useBillingStore, type SubscriptionStatus, type UsageStatus } from './stores/useBillingStore.ts';
import { useChatStore } from './stores/useChatStore.ts';
import { useTaskStore } from './stores/useTaskStore.ts';
import { readProjectChatOpenState, useUIStore } from './stores/useUIStore.ts';
import { useProjectUIStore } from './stores/useProjectUIStore.ts';
import { useProjectStore } from './stores/useProjectStore.ts';
import { normalizeTasks, type Task, type ValidationResult } from './types.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const EMPTY_CALENDAR_DAYS: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }> = [];
const AI_DONE_GRACE_PERIOD_MS = 10000;
const AI_MUTATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

interface RouteState {
  pathname: string;
  search: string;
}

type BillingConstraintStatus = UsageStatus | SubscriptionStatus | null;
const SUPPORTED_APP_PATHS = new Set(['/', '/auth/yandex/callback', '/purchase', '/account', '/admin']);
const TRANSIENT_QUERY_PARAMS = new Set(['auth']);

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

  if (limitKey === 'export') {
    const exportAccessLevel = getExportAccessLevel(status);
    if (exportAccessLevel !== 'none') {
      return null;
    }

    return {
      code: 'EXPORT_FEATURE_LOCKED',
      limitKey,
      reasonCode: 'feature_disabled',
      remaining: null,
      plan,
      planLabel,
      upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
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

function removeTransientSearchParams(search: string): string {
  if (!search) {
    return '';
  }

  const params = new URLSearchParams(search);
  let changed = false;

  TRANSIENT_QUERY_PARAMS.forEach((key) => {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  });

  if (!changed) {
    return search;
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
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

function formatPdfFileTimestamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}-${minutes}`;
}

function getAttachmentFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return fallback;
}

async function triggerBlobDownload(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
    const params = new URLSearchParams(route.search);
    const requestedAuthMode = params.get('auth');
    if (requestedAuthMode !== 'otp' && requestedAuthMode !== 'yandex') {
      return;
    }

    if (!auth.isAuthenticated) {
      setShowOtpModal(true);
    }

    const sanitizedSearch = removeTransientSearchParams(route.search);
    if (sanitizedSearch === route.search) {
      return;
    }

    const nextUrl = `${window.location.origin}${route.pathname}${sanitizedSearch}`;
    window.history.replaceState(window.history.state, '', nextUrl);
    setRoute({
      pathname: route.pathname,
      search: sanitizedSearch,
    });
  }, [auth.isAuthenticated, route.pathname, route.search, setShowOtpModal]);

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
  const isKnownRoute = SUPPORTED_APP_PATHS.has(normalizedPathname);
  const authModalMethod = new URLSearchParams(route.search).get('auth') === 'otp' ? 'otp' : 'yandex';
  const isYandexCallbackRoute = normalizedPathname === '/auth/yandex/callback';
  const isPurchaseRoute = normalizedPathname === '/purchase';
  const isAccountRoute = normalizedPathname === '/account';
  const isAdminRoute = normalizedPathname === '/admin';
  const purchaseParams = new URLSearchParams(route.search);
  const initialPurchasePlan = purchaseParams.get('plan');
  const initialPurchasePeriod = purchaseParams.get('period');
  const autoPurchaseCheckout = purchaseParams.get('checkout') === '1';

  useEffect(() => {
    if (isKnownRoute) {
      return;
    }

    const nextUrl = `${window.location.origin}/${route.search}`;
    window.history.replaceState(window.history.state, '', nextUrl);
    setRoute({
      pathname: '/',
      search: route.search,
    });
  }, [isKnownRoute, route.search]);

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

interface PendingProjectCreation {
  firstPrompt?: string;
  createEmptyChart?: boolean;
  groupId?: string;
}

function WorkspaceApp({ auth, localTasks, onLoginRequired }: WorkspaceAppProps) {
  const sharedProject = useSharedProject();
  const workspace = useUIStore((state) => state.workspace);
  const pendingPostAuthAction = useUIStore((state) => state.pendingPostAuthAction);
  const setWorkspace = useUIStore((state) => state.setWorkspace);
  const plannerCorrectionTarget = useUIStore((state) => state.plannerCorrectionTarget);
  const setPlannerCorrectionTarget = useUIStore((state) => state.setPlannerCorrectionTarget);
  const consumePlannerCorrectionTarget = useUIStore((state) => state.consumePlannerCorrectionTarget);
  const setPendingPostAuthAction = useUIStore((state) => state.setPendingPostAuthAction);
  const setSidebarState = useUIStore((state) => state.setSidebarState);
  const setShowChart = useUIStore((state) => state.setShowChart);
  const showBillingPage = useUIStore((state) => state.showBillingPage);
  const setShowBillingPage = useUIStore((state) => state.setShowBillingPage);
  const setValidationErrors = useUIStore((state) => state.setValidationErrors);
  const setShareStatus = useUIStore((state) => state.setShareStatus);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const [deleteProjectDraft, setDeleteProjectDraft] = useState<{ id: string; name: string } | null>(null);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showPdfHelper, setShowPdfHelper] = useState(false);
  const [pendingProjectCreation, setPendingProjectCreation] = useState<PendingProjectCreation | null>(null);
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
    auth.project?.ganttDayMode ?? 'calendar',
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
    ganttDayMode: hasShareToken ? (sharedProject.project?.ganttDayMode ?? 'calendar') : (auth.project?.ganttDayMode ?? 'calendar'),
    calendarDays: hasShareToken
      ? (sharedProject.project?.calendarDays ?? EMPTY_CALENDAR_DAYS)
      : (auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS),
  });
  const ganttRef = useRef<GanttChartRef>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({ tasks: [], active: false, mode: 'rendering', message: null });
  const [pendingGanttDayMode, setPendingGanttDayMode] = useState<'business' | 'calendar' | null>(null);
  const activationInFlightRef = useRef(false);
  const createEmptyChartAfterActivationRef = useRef(false);
  const queuedPromptRef = useRef<string | null>(null);
  const aiDoneGraceTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const aiMutationWatchdogRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [activeEmptyProjectModeProjectId, setActiveEmptyProjectModeProjectId] = useState<string | null>(null);
  const bumpHistoryRefreshRevision = useUIStore((state) => state.bumpHistoryRefreshRevision);
  const setAiMutationLock = useUIStore((state) => state.setAiMutationLock);
  const clearAiMutationLock = useUIStore((state) => state.clearAiMutationLock);
  const effectiveAuthGanttDayMode = pendingGanttDayMode ?? (auth.project?.ganttDayMode ?? 'calendar');

  useEffect(() => {
    if (!pendingGanttDayMode) {
      return;
    }

    if (auth.project?.ganttDayMode === pendingGanttDayMode) {
      setPendingGanttDayMode(null);
    }
  }, [auth.project?.ganttDayMode, pendingGanttDayMode]);

  const replaceTasksFromSystem = useCallback((nextTasks: Task[]) => {
    setTasks(nextTasks);
  }, [setTasks]);

  const clearAiDoneGraceTimer = useCallback(() => {
    if (aiDoneGraceTimerRef.current) {
      window.clearTimeout(aiDoneGraceTimerRef.current);
      aiDoneGraceTimerRef.current = null;
    }
  }, []);

  const scheduleAiDoneGraceExit = useCallback(() => {
    clearAiDoneGraceTimer();
    aiDoneGraceTimerRef.current = window.setTimeout(() => {
      aiDoneGraceTimerRef.current = null;
      useChatStore.getState().finishStreaming();
    }, AI_DONE_GRACE_PERIOD_MS);
  }, [clearAiDoneGraceTimer]);

  const armAiMutationWatchdog = useCallback(() => {
    if (aiMutationWatchdogRef.current) {
      window.clearTimeout(aiMutationWatchdogRef.current);
    }

    aiMutationWatchdogRef.current = window.setTimeout(() => {
      aiMutationWatchdogRef.current = null;
      clearAiMutationLock();
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
      useChatStore.getState().finishStreaming();
    }, AI_MUTATION_LOCK_TIMEOUT_MS);
  }, [clearAiMutationLock]);

  const releaseAiMutationLock = useCallback(() => {
    if (aiMutationWatchdogRef.current) {
      window.clearTimeout(aiMutationWatchdogRef.current);
      aiMutationWatchdogRef.current = null;
    }
    clearAiMutationLock();
  }, [clearAiMutationLock]);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    console.log('[WS] message', msg);
    if (msg.type === 'preview_tasks') {
      const normalizedPreviewTasks = normalizeTasks(msg.tasks as Task[]);
      armAiMutationWatchdog();
      setAiMutationLock({
        active: true,
        stage: 'preview',
        message: 'AI формирует стартовый график и сохраняет его в проект.',
      });
      setPreviewState({
        tasks: normalizedPreviewTasks,
        active: true,
        mode: 'rendering',
        message: null,
      });
      return;
    }
    if (msg.type === 'preview_failed') {
      armAiMutationWatchdog();
      setAiMutationLock({
        active: true,
        stage: 'failed',
        message: msg.message ?? 'Предварительный график не был сохранён.',
      });
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
    if (msg.type === 'history_changed') {
      bumpHistoryRefreshRevision();
      return;
    }
    if (msg.type === 'tasks') {
      const normalizedTasks = normalizeTasks(msg.tasks as Task[]);
      console.log('[WS->UI] tasks', {
        taskCount: normalizedTasks.length,
        tasks: summarizeTasksForLog(normalizedTasks),
      });
      releaseAiMutationLock();
      scheduleAiDoneGraceExit();
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
      armAiMutationWatchdog();
      useChatStore.getState().appendToken(msg.content ?? '');
      return;
    }
    if (msg.type === 'done') {
      clearAiDoneGraceTimer();
      releaseAiMutationLock();
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
      useChatStore.getState().attachCheckpointToLatestUserMessage(msg.chatMessage);
      useChatStore.getState().finishStreaming(msg.chatMessage);
      return;
    }
    if (msg.type === 'error') {
      clearAiDoneGraceTimer();
      releaseAiMutationLock();
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
      useChatStore.getState().setError(msg.message ?? 'unknown error');
    }
  }, [
    armAiMutationWatchdog,
    auth.isAuthenticated,
    bumpHistoryRefreshRevision,
    clearAiDoneGraceTimer,
    hasShareToken,
    releaseAiMutationLock,
    scheduleAiDoneGraceExit,
    setAiMutationLock,
  ]);

  const { connected, connectedToken } = useWebSocket(
    handleWsMessage,
    () => (hasShareToken ? null : auth.accessToken),
    hasShareToken ? null : auth.accessToken,
    hasShareToken ? undefined : auth.refreshAccessToken,
  );
  const displayConnected = hasShareToken ? true : auth.isAuthenticated ? connected : true;

  useEffect(() => {
    if (hasShareToken) {
      setWorkspace({ kind: 'shared' });
      return;
    }

    const projectId = auth.project?.id;
    if (!auth.isAuthenticated || !projectId) {
      setWorkspace({ kind: 'guest' });
      return;
    }

    setWorkspace((current) => {
      if (current.kind === 'project' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'planner' && current.projectId === projectId) {
        return current;
      }
      return (getProjectState(projectId)?.activeWorkspace ?? 'project') === 'planner'
        ? { kind: 'planner', projectId }
        : { kind: 'project', projectId, chatOpen: readProjectChatOpenState() };
    });
  }, [auth.isAuthenticated, auth.project?.id, getProjectState, hasShareToken, setWorkspace]);

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
    clearAiDoneGraceTimer();
    releaseAiMutationLock();
    setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null });
    replaceTasksFromSystem([]);
    useProjectStore.getState().hydrateConfirmed(0, { tasks: [], dependencies: [] });
    useChatStore.getState().reset();
  }, [clearAiDoneGraceTimer, releaseAiMutationLock, replaceTasksFromSystem]);

  const openCreateProjectModal = useCallback((nextIntent: PendingProjectCreation = {}) => {
    setPendingProjectCreation(nextIntent);
    setShowCreateProjectModal(true);
  }, []);

  const createProjectAndActivate = useCallback(async (
    name: string,
    options: PendingProjectCreation = {},
  ): Promise<{ id: string; name: string } | null> => {
    if (hasShareToken || !auth.isAuthenticated || activationInFlightRef.current) {
      return null;
    }

    activationInFlightRef.current = true;
    createEmptyChartAfterActivationRef.current = Boolean(options.createEmptyChart);
    queuedPromptRef.current = options.firstPrompt ?? null;
    resetWorkspacePresentation();

    try {
      const newProject = await auth.createProject(name.trim(), options.groupId ?? auth.project?.groupId);
      if (!newProject) {
        queuedPromptRef.current = null;
        createEmptyChartAfterActivationRef.current = false;
        return null;
      }

      await auth.switchProject(newProject.id);
      setSidebarState('closed');
      if (options.createEmptyChart) {
        setActiveEmptyProjectModeProjectId(newProject.id);
      } else {
        replaceTasksFromSystem([]);
      }
      if (options.firstPrompt) {
        useChatStore.getState().addMessage({ role: 'user', content: options.firstPrompt });
      }
      setWorkspace({
        kind: 'project',
        projectId: newProject.id,
        chatOpen: options.firstPrompt ? true : readProjectChatOpenState(),
      });
      setPendingProjectCreation(null);
      setPendingPostAuthAction(null);
      return { id: newProject.id, name: newProject.name };
    } finally {
      activationInFlightRef.current = false;
    }
  }, [auth, hasShareToken, replaceTasksFromSystem, resetWorkspacePresentation, setPendingPostAuthAction, setSidebarState, setWorkspace]);

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
      releaseAiMutationLock();
      return false;
    }

    armAiMutationWatchdog();
    setAiMutationLock({
      active: true,
      stage: 'thinking',
      message: 'AI готовит изменения графика. Редактирование временно заблокировано.',
    });

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
        releaseAiMutationLock();
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
          releaseAiMutationLock();
          await openLimitModal(body);
          return false;
        }
      } catch {
        // response body not JSON — fall through to generic error
      }
      releaseAiMutationLock();
      throw new Error(`HTTP 403`);
    }

    if (!response.ok) {
      releaseAiMutationLock();
      throw new Error(`HTTP ${response.status}`);
    }
    return true;
  }, [armAiMutationWatchdog, auth, isArchivedProject, openLimitModal, proactiveChatDenial, releaseAiMutationLock, setAiMutationLock]);

  const submitSplitTask = useCallback(async (task: Task, details: string): Promise<StartScreenSendResult> => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (isArchivedProject) {
      return {
        accepted: false,
        message: 'Проект в архиве. Восстановите его, чтобы разбить задачу.',
      };
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return { accepted: false };
    }
    if (proactiveChatDenial) {
      await openLimitModal(proactiveChatDenial);
      return { accepted: false };
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      return { accepted: false, message: 'Нет access token для AI-запроса.' };
    }

    useChatStore.getState().addMessage({ role: 'user', content: buildSplitTaskTrace(task, details) });
    openProjectChat();
    armAiMutationWatchdog();
    setAiMutationLock({
      active: true,
      stage: 'thinking',
      message: 'AI обрабатывает задачу. Редактирование графика временно заблокировано.',
    });

    let response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ details }),
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        releaseAiMutationLock();
        return { accepted: false, message: 'Сессия истекла. Войдите заново.' };
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/split`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ details }),
      });
    }

    if (response.status === 403) {
      try {
        const body = await response.json() as Partial<ConstraintDenialPayload>;
        if (isConstraintCode(body.code)) {
          releaseAiMutationLock();
          await openLimitModal(body);
          return { accepted: false };
        }
      } catch {
        // response body not JSON
      }
      releaseAiMutationLock();
      return { accepted: false, message: 'Доступ к AI-функции ограничен.' };
    }

    if (!response.ok) {
      releaseAiMutationLock();
      return { accepted: false, message: `HTTP ${response.status}` };
    }

    return { accepted: true };
  }, [armAiMutationWatchdog, auth, hasShareToken, isArchivedProject, onLoginRequired, openLimitModal, openProjectChat, proactiveChatDenial, releaseAiMutationLock, setAiMutationLock]);

  const handleSend = useCallback((text: string): StartScreenSendResult => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (isArchivedProject) {
      return {
        accepted: false,
        message: 'Проект в архиве. Восстановите его, чтобы отправить запрос.',
      };
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return { accepted: false };
    }
    if (proactiveChatDenial) {
      void openLimitModal(proactiveChatDenial);
      return { accepted: false };
    }
    if (!auth.project) {
      return { accepted: false };
    }
    if (auth.project?.taskCount === 0) {
      setActiveEmptyProjectModeProjectId(auth.project.id);
    }
    useChatStore.getState().addMessage({ role: 'user', content: text });
    openProjectChat();
    void submitChatMessage(text).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
    return { accepted: true };
  }, [auth.isAuthenticated, auth.project, hasShareToken, isArchivedProject, onLoginRequired, openLimitModal, openProjectChat, proactiveChatDenial, submitChatMessage]);

  const handleStartScreenSend = useCallback(async (text: string): Promise<StartScreenSendResult> => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (!auth.isAuthenticated) {
      setPendingPostAuthAction({
        kind: 'send_prompt',
        prompt: text,
        sourceProjectState: localTasks.tasks.length === 0 ? 'empty' : 'non_empty',
      });
      onLoginRequired();
      return { accepted: true };
    }
    if (isArchivedProject) {
      return {
        accepted: false,
        message: 'Проект в архиве. Восстановите его, чтобы отправить запрос.',
      };
    }
    if (!auth.project) {
      if (proactiveProjectDenial) {
        await openLimitModal(proactiveProjectDenial);
        return { accepted: false };
      }
      openCreateProjectModal({ firstPrompt: text });
      return { accepted: true };
    }
    return handleSend(text);
  }, [auth.isAuthenticated, auth.project, handleSend, hasShareToken, isArchivedProject, localTasks.tasks.length, onLoginRequired, openCreateProjectModal, openLimitModal, proactiveProjectDenial, setPendingPostAuthAction]);

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
    if (!auth.project) {
      if (proactiveProjectDenial) {
        await openLimitModal(proactiveProjectDenial);
        return;
      }
      openCreateProjectModal({ createEmptyChart: true });
      return;
    }
    if (workspace.kind === 'project') {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
  }, [auth.isAuthenticated, auth.project, hasShareToken, onLoginRequired, openCreateProjectModal, openLimitModal, proactiveProjectDenial, workspace]);

  const handleSwitchProject = useCallback(async (projectId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    useTaskStore.setState({ loading: true, error: null });
    useProjectStore.getState().clearTransientState();
    await auth.switchProject(projectId);
    setWorkspace(
      (getProjectState(projectId)?.activeWorkspace ?? 'project') === 'planner'
        ? { kind: 'planner', projectId }
        : { kind: 'project', projectId, chatOpen: readProjectChatOpenState() }
    );
  }, [auth, getProjectState, setWorkspace]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken || !auth.project?.id || !plannerCorrectionTarget) {
      return;
    }

    const { projectId, taskId } = plannerCorrectionTarget;
    if (!projectId || !taskId) {
      consumePlannerCorrectionTarget();
      return;
    }

    if (workspace.kind === 'project' && workspace.projectId === projectId) {
      return;
    }

    if (auth.project.id !== projectId) {
      void handleSwitchProject(projectId).catch(() => {
        consumePlannerCorrectionTarget();
      });
      return;
    }

    setWorkspace({ kind: 'project', projectId, chatOpen: readProjectChatOpenState() });
  }, [
    auth.isAuthenticated,
    auth.project?.id,
    consumePlannerCorrectionTarget,
    handleSwitchProject,
    hasShareToken,
    plannerCorrectionTarget,
    setWorkspace,
    workspace,
  ]);

  const handleCreateProject = useCallback(async (groupId?: string) => {
    if (hasShareToken) {
      window.location.assign(window.location.origin);
      return;
    }

    if (auth.isAuthenticated) {
      if (proactiveProjectDenial) {
        await openLimitModal(proactiveProjectDenial);
        return;
      }
      openCreateProjectModal({ groupId: groupId ?? auth.project?.groupId });
      return;
    }
    queuedPromptRef.current = null;
    setPendingPostAuthAction(null);
    onLoginRequired();
  }, [auth.isAuthenticated, auth.project?.groupId, hasShareToken, onLoginRequired, openCreateProjectModal, openLimitModal, proactiveProjectDenial, setPendingPostAuthAction]);

  const handleCreateProjectGroup = useCallback(async (name: string) => {
    await auth.createProjectGroup(name);
  }, [auth]);

  const handleRenameProjectGroup = useCallback(async (groupId: string, name: string) => {
    await auth.updateProjectGroup(groupId, { name });
  }, [auth]);

  const handleDeleteProjectGroup = useCallback(async (groupId: string) => {
    await auth.deleteProjectGroup(groupId);
  }, [auth]);

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

    if (!auth.project) {
      return;
    }

    setWorkspace({ kind: 'planner', projectId: auth.project.id });
  }, [auth.project, billingStatus, openLimitModal, setWorkspace]);

  useEffect(() => {
    if (workspace.kind === 'project') {
      setProjectState(workspace.projectId, { activeWorkspace: 'project' });
    } else if (workspace.kind === 'planner') {
      setProjectState(workspace.projectId, { activeWorkspace: 'planner' });
    }
  }, [setProjectState, workspace]);

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

    if (effectiveAuthGanttDayMode === ganttDayMode) {
      return;
    }

    setPendingGanttDayMode(ganttDayMode);
    try {
      await batchUpdate.handleGanttDayModeSwitch(ganttDayMode);
    } catch (error) {
      setPendingGanttDayMode(null);
      throw error;
    }
  }, [auth.project, batchUpdate, effectiveAuthGanttDayMode]);

  const handleCreateShareLink = useCallback(async () => {
    if (!auth.accessToken || !auth.project) {
      return;
    }
    useUIStore.getState().setShowShareManager(true);
  }, [auth.accessToken, auth.project]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken) {
      return;
    }
    useProjectStore.getState().clearTransientState();
    clearAiDoneGraceTimer();
    releaseAiMutationLock();
  }, [auth.isAuthenticated, auth.project?.id, clearAiDoneGraceTimer, hasShareToken, releaseAiMutationLock]);

  useEffect(() => () => {
    clearAiDoneGraceTimer();
    releaseAiMutationLock();
  }, [clearAiDoneGraceTimer, releaseAiMutationLock]);

  useEffect(() => {
    setSelectedShareTaskIds(new Set());
    setShareSelectionMode(false);
  }, [auth.project?.id, hasShareToken]);

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
        ? response.json() as Promise<Array<{
            id: string;
            role: string;
            content: string;
            requestContextId?: string | null;
            historyGroupId?: string | null;
          }>>
        : Promise.resolve([]))
      .then((data) => {
        if (createEmptyChartAfterActivationRef.current || hasQueuedFirstPrompt) {
          return;
        }
        useChatStore.getState().replaceMessages(data.map((message) => ({
          id: message.id ?? crypto.randomUUID(),
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
          requestContextId: message.requestContextId ?? null,
          historyGroupId: message.historyGroupId ?? null,
        })));
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
    if (!auth.isAuthenticated || hasShareToken || pendingPostAuthAction?.kind !== 'send_prompt') {
      return;
    }

    if (pendingPostAuthAction.sourceProjectState === 'non_empty') {
      if (proactiveProjectDenial) {
        void openLimitModal(proactiveProjectDenial);
        setPendingPostAuthAction(null);
        return;
      }
      openCreateProjectModal({ firstPrompt: pendingPostAuthAction.prompt });
      setPendingPostAuthAction(null);
      return;
    }

    if (proactiveChatDenial || !auth.project || workspace.kind !== 'project') {
      if (proactiveChatDenial) {
        void openLimitModal(proactiveChatDenial);
        setPendingPostAuthAction(null);
      }
      return;
    }

    queuedPromptRef.current = pendingPostAuthAction.prompt;
    resetWorkspacePresentation();
    useChatStore.getState().addMessage({ role: 'user', content: pendingPostAuthAction.prompt });
    setWorkspace({ kind: 'project', projectId: auth.project.id, chatOpen: true });
    setPendingPostAuthAction(null);
  }, [
    auth.isAuthenticated,
    auth.project,
    hasShareToken,
    openCreateProjectModal,
    openLimitModal,
    pendingPostAuthAction,
    proactiveChatDenial,
    proactiveProjectDenial,
    resetWorkspacePresentation,
    setPendingPostAuthAction,
    setWorkspace,
    workspace.kind,
  ]);

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
  const showShareManager = useUIStore((state) => state.showShareManager);
  const { updateAvailable, reloadApp } = useAppUpdateCheck();
  const [isExportExcelLoading, setIsExportExcelLoading] = useState(false);
  const [shareSelectionMode, setShareSelectionMode] = useState(false);
  const [selectedShareTaskIds, setSelectedShareTaskIds] = useState<Set<string>>(new Set());
  const visibleTasks = previewState.active ? previewState.tasks : tasks;
  const handleStartPartialShareSelection = useCallback(() => {
    setSelectedShareTaskIds(new Set());
    setShareSelectionMode(true);
    useUIStore.getState().setShowShareManager(false);
    setShareStatus('idle');
  }, [setShareStatus]);
  const handlePartialShareSelectionChange = useCallback((nextSelectedTaskIds: Set<string>) => {
    setSelectedShareTaskIds((previousSelectedTaskIds) => {
      const added = Array.from(nextSelectedTaskIds).filter((id) => !previousSelectedTaskIds.has(id));
      const removed = Array.from(previousSelectedTaskIds).filter((id) => !nextSelectedTaskIds.has(id));
      if (added.length + removed.length !== 1) {
        return nextSelectedTaskIds;
      }

      const changedTaskId = added[0] ?? removed[0];
      if (!changedTaskId) {
        return nextSelectedTaskIds;
      }

      const subtreeIds = collectTaskSubtreeIds(visibleTasks, changedTaskId);
      if (subtreeIds.length <= 1) {
        return nextSelectedTaskIds;
      }

      const normalized = new Set(nextSelectedTaskIds);
      const shouldSelect = added.length === 1;
      for (const taskId of subtreeIds) {
        if (shouldSelect) {
          normalized.add(taskId);
        } else {
          normalized.delete(taskId);
        }
      }
      return normalized;
    });
  }, [visibleTasks]);
  const handleCancelPartialShareSelection = useCallback(() => {
    setSelectedShareTaskIds(new Set());
    setShareSelectionMode(false);
    setShareStatus('idle');
  }, [setShareStatus]);
  const handleSubmitPartialShareSelection = useCallback(async () => {
    if (!auth.accessToken || !auth.project || selectedShareTaskIds.size === 0) {
      return;
    }

    try {
      setShareStatus('creating');
      const response = await fetch(`/api/projects/${auth.project.id}/share-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'task_selection',
          includedTaskIds: Array.from(selectedShareTaskIds),
          label: `${auth.project.name} · часть графика`,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setSelectedShareTaskIds(new Set());
      setShareSelectionMode(false);
      useUIStore.getState().setShowShareManager(true);
      setShareStatus('idle');
    } catch (error) {
      console.error('Failed to create partial share link:', error);
      setShareStatus('error');
      window.setTimeout(() => {
        if (useUIStore.getState().shareStatus === 'error') {
          useUIStore.getState().setShareStatus('idle');
        }
      }, 2500);
    }
  }, [auth.accessToken, auth.project, selectedShareTaskIds, setShareStatus]);
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
    : auth.isAuthenticated
      ? auth.project?.name
      : (localTasks.projectName || 'Мой проект');
  const doExportPdf = useCallback(async () => {
    const projectName = currentProjectLabel?.trim() || 'Мой проект';
    const exportDate = new Date();
    await ganttRef.current?.exportToPdf({
      fileName: `ГетГант - ${projectName} - ${formatPdfFileTimestamp(exportDate)}.pdf`,
      title: projectName,
      header: {
        logoUrl: `${window.location.origin}/favicon.svg`,
        logoHref: window.location.origin,
        serviceName: 'GetGantt.ru',
        serviceHref: window.location.origin,
        projectName,
        exportDate,
      },
    });
  }, [currentProjectLabel, ganttRef]);

  const handleExportPdf = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    if (isPdfHelperDismissed()) {
      await doExportPdf();
    } else {
      setShowPdfHelper(true);
    }
  }, [billingStatus, doExportPdf, openLimitModal]);

  const handleExportExcel = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    const exportAccessLevel = getExportAccessLevel(billingStatus);
    if (exportAccessLevel !== 'pdf_excel' && exportAccessLevel !== 'pdf_excel_api') {
      await openLimitModal({
        code: 'EXPORT_FEATURE_LOCKED',
        limitKey: 'export',
        reasonCode: 'feature_disabled',
        remaining: null,
        plan: ((billingStatus?.plan as PlanId | undefined) ?? 'free'),
        planLabel: billingStatus?.planMeta.label ?? PLAN_LABELS[((billingStatus?.plan as PlanId | undefined) ?? 'free')],
        upgradeHint: 'Экспорт PDF + Excel доступен на любом платном тарифе.',
      });
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setIsExportExcelLoading(true);
    try {
      let response = await fetch('/api/export/excel', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onLoginRequired();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch('/api/export/excel', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (response.status === 403) {
        try {
          const body = await response.json() as Partial<ConstraintDenialPayload>;
          if (isConstraintCode(body.code)) {
            await openLimitModal(body);
            return;
          }
        } catch {
          // fall through to generic error
        }
        throw new Error(`HTTP 403`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const projectName = currentProjectLabel?.trim() || 'Мой проект';
      const fallbackFileName = `ГетГант - ${projectName} - ${formatPdfFileTimestamp(new Date())}.xlsx`;
      const fileName = getAttachmentFileName(response.headers.get('Content-Disposition'), fallbackFileName);
      await triggerBlobDownload(blob, fileName);
    } finally {
      setIsExportExcelLoading(false);
    }
  }, [auth, billingStatus, currentProjectLabel, onLoginRequired, openLimitModal]);

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
        ganttDayMode={sharedProject.project?.ganttDayMode ?? 'calendar'}
      />
    )
    : workspace.kind === 'planner'
      ? (
        <ResourcePlannerWorkspace
          accessToken={auth.accessToken}
          projectId={workspace.projectId}
          ganttDayMode={effectiveAuthGanttDayMode}
          calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
          onBackToProject={() => {
            setPlannerCorrectionTarget(null);
            setWorkspace({ kind: 'project', projectId: workspace.projectId, chatOpen: readProjectChatOpenState() });
          }}
          onCorrectConflict={(target) => {
            setPlannerCorrectionTarget(target);
            setWorkspace({ kind: 'project', projectId: target.projectId, chatOpen: readProjectChatOpenState() });
          }}
          onOpenTask={(target) => {
            setShowChart(true);
            setPlannerCorrectionTarget(target);
            setWorkspace({ kind: 'project', projectId: target.projectId, chatOpen: readProjectChatOpenState() });
          }}
        />
      )
      : workspace.kind === 'draft'
        ? null
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
              accessToken={auth.accessToken}
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
              onSplitTask={submitSplitTask}
              onLoginRequired={onLoginRequired}
              onCloseChat={closeProjectChat}
              onToggleChat={toggleProjectChat}
              onScrollToToday={handleScrollToToday}
              onCollapseAll={handleCollapseAll}
              onExpandAll={handleExpandAll}
              onExportPdf={handleExportPdf}
              onExportExcel={handleExportExcel}
              isExportExcelLoading={isExportExcelLoading}
              onValidation={handleValidation}
              onCascade={handleCascade}
              shareStatus={shareStatus}
              onCreateShareLink={handleCreateShareLink}
              shareSelectionMode={shareSelectionMode}
              selectedShareTaskIds={selectedShareTaskIds}
              onSelectedShareTaskIdsChange={handlePartialShareSelectionChange}
              onCancelShareSelection={handleCancelPartialShareSelection}
              onConfirmShareSelection={handleSubmitPartialShareSelection}
              ganttDayMode={effectiveAuthGanttDayMode}
              displayGanttDayMode={effectiveAuthGanttDayMode}
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
              onExportPdf={handleExportPdf}
              isExportExcelLoading={isExportExcelLoading}
              onValidation={handleValidation}
              onCascade={handleCascade}
              shareStatus={shareStatus}
              onCreateShareLink={handleCreateShareLink}
              ganttDayMode="calendar"
            />
          );

  return (
    <>
    {updateAvailable && (
      <div className="fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-3">
        <div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Доступно обновление</p>
            <p className="text-xs text-slate-500">Откройте новую версию приложения, когда будет удобно.</p>
          </div>
          <button
            type="button"
            onClick={reloadApp}
            className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Обновить
          </button>
        </div>
      </div>
    )}
    <ProjectMenu
      error={error}
      hasShareToken={hasShareToken}
      isArchivedProject={isArchivedProject}
      currentProjectLabel={currentProjectLabel}
      onCreateProject={handleCreateProject}
      onSwitchProject={handleSwitchProject}
      onRenameProject={async (projectId, name) => {
        await auth.updateProject(projectId, { name });
      }}
      onMoveProject={async (projectId, groupId) => {
        await auth.updateProject(projectId, { groupId });
      }}
      onArchiveProject={handleArchiveProject}
      onRestoreProject={handleRestoreProject}
      onDeleteProject={handleDeleteProject}
      onCreateProjectGroup={handleCreateProjectGroup}
      onRenameProjectGroup={handleRenameProjectGroup}
      onDeleteProjectGroup={handleDeleteProjectGroup}
      onOpenResourcePool={handleOpenResourcePool}
      onOpenChartMode={async () => {
        const targetProjectId = workspace.kind === 'planner'
          ? workspace.projectId
          : auth.project?.id;
        if (!targetProjectId) {
          return;
        }
        setPlannerCorrectionTarget(null);
        setWorkspace({ kind: 'project', projectId: targetProjectId, chatOpen: readProjectChatOpenState() });
      }}
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
        projectGroups={auth.projectGroups}
        initialGroupId={pendingProjectCreation?.groupId ?? auth.project?.groupId ?? auth.projectGroups[0]?.id}
        onSave={async (name, groupId) => {
          return createProjectAndActivate(name, { ...(pendingProjectCreation ?? {}), groupId });
        }}
        onCreateGroup={async (name) => {
          return auth.createProjectGroup(name);
        }}
        onClose={() => {
          setPendingProjectCreation(null);
          setPendingPostAuthAction(null);
          setShowCreateProjectModal(false);
        }}
      />
    )}

    {showPdfHelper && (
      <PdfHelperModal
        onContinue={() => {
          setShowPdfHelper(false);
          void doExportPdf();
        }}
        onClose={() => setShowPdfHelper(false)}
      />
    )}

    {showShareManager && auth.accessToken && auth.project && (
      <ShareLinksManagerModal
        accessToken={auth.accessToken}
        projectId={auth.project.id}
        projectName={auth.project.name}
        selectionActive={shareSelectionMode}
        selectedTaskCount={selectedShareTaskIds.size}
        onStartPartialSelection={handleStartPartialShareSelection}
        onStatusChange={setShareStatus}
        onClose={() => {
          useUIStore.getState().setShowShareManager(false);
          useUIStore.getState().setShareLinkUrl(null);
          setShareStatus('idle');
        }}
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
