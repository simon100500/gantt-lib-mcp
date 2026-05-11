import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';

import { AccountPage } from './components/AccountPage.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { DeleteProjectModal } from './components/DeleteProjectModal.tsx';
import { CreateProjectModal } from './components/CreateProjectModal.tsx';
import { EditProjectModal } from './components/EditProjectModal.tsx';
import { LimitReachedModal } from './components/LimitReachedModal.tsx';
import { OtpModal } from './components/OtpModal.tsx';
import { PdfHelperModal, isPdfHelperDismissed } from './components/PdfHelperModal.tsx';
import { PurchasePage } from './components/PurchasePage.tsx';
import { BlockPublicationIntentPage } from './components/PublicationIntentPages.tsx';
import { SaveTemplateModal } from './components/SaveTemplateModal.tsx';
import { ShareLinksManagerModal } from './components/ShareLinksManagerModal.tsx';
import { BackupRestoreModal, type BackupRestoreSummary } from './components/BackupRestoreModal.tsx';
import { buildSplitTaskTrace, type SplitTaskSubmitPayload } from './components/SplitTaskModal.tsx';
import { InsertTemplateModal } from './components/InsertTemplateModal.tsx';
import { ImportExcelModal } from './components/ImportExcelModal.tsx';
import { ProjectSettingsModal } from './components/ProjectSettingsModal.tsx';
import { YandexCallbackPage } from './components/YandexCallbackPage.tsx';
import type { GanttChartRef } from './components/GanttChart.tsx';
import { ProjectMenu } from './components/layout/ProjectMenu.tsx';
import { DraftWorkspace } from './components/workspace/DraftWorkspace.tsx';
import type { StartScreenSendResult } from './components/StartScreen.tsx';
import { GuestWorkspace } from './components/workspace/GuestWorkspace.tsx';
import { ProjectWorkspace } from './components/workspace/ProjectWorkspace.tsx';
import { FinanceWorkspace } from './components/workspace/FinanceWorkspace.tsx';
import { ResourcePlannerWorkspace } from './components/workspace/ResourcePlannerWorkspace.tsx';
import { SharedWorkspace } from './components/workspace/SharedWorkspace.tsx';
import { TemplateWorkspace } from './components/workspace/TemplateWorkspace.tsx';
import { useAuth, type AuthProject, type UseAuthResult } from './hooks/useAuth.ts';
import { useBatchTaskUpdate } from './hooks/useBatchTaskUpdate.ts';
import { useAppUpdateCheck } from './hooks/useAppUpdateCheck.ts';
import { useLocalTasks } from './hooks/useLocalTasks.ts';
import { useSharedProject } from './hooks/useSharedProject.ts';
import { useTasks } from './hooks/useTasks.ts';
import { useTemplateBatchUpdate } from './hooks/useTemplateBatchUpdate.ts';
import { useTemplates } from './hooks/useTemplates.ts';
import { useWebSocket, type ServerMessage } from './hooks/useWebSocket.ts';
import type { AuthSuccessResponse, ProjectLoadResponse, TemplatePublicationDetail } from './lib/apiTypes.ts';
import { PLAN_LABELS, type PlanId } from './lib/billing.ts';
import { normalizeConstraintDenialPayload, type ConstraintDenialPayload, type ConstraintLimitKey } from './lib/constraintUi.ts';
import { collectTaskSubtreeIds } from './lib/shareLinkSelection.ts';
import { useAuthStore } from './stores/useAuthStore.ts';
import { getExportAccessLevel, useBillingStore, type SubscriptionStatus, type UsageStatus } from './stores/useBillingStore.ts';
import { useChatStore } from './stores/useChatStore.ts';
import { useTaskStore } from './stores/useTaskStore.ts';
import { useTemplateStore } from './stores/useTemplateStore.ts';
import { readProjectChatOpenState, useUIStore } from './stores/useUIStore.ts';
import { DEFAULT_NEW_PROJECT_HIDDEN_TASK_LIST_COLUMNS, useProjectUIStore } from './stores/useProjectUIStore.ts';
import { useProjectStore } from './stores/useProjectStore.ts';
import { normalizeTasks, type ProjectSectionPermissions, type Task, type TimelineMarker, type ValidationResult } from './types.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const GENERATION_JOB_STORAGE_KEY_PREFIX = 'gantt_generation_job:';
const GENERATION_PREVIEW_STORAGE_KEY_PREFIX = 'gantt_generation_preview:';
const EMPTY_CALENDAR_DAYS: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }> = [];
const AI_DONE_GRACE_PERIOD_MS = 10000;
const AI_MUTATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

interface RouteState {
  pathname: string;
  search: string;
}

type BillingConstraintStatus = UsageStatus | SubscriptionStatus | null;
const SUPPORTED_APP_PATHS = new Set(['/', '/login', '/auth/yandex/callback', '/purchase', '/account', '/admin']);
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

function parseTemplateCreatePath(pathname: string): { publicationId: string } | null {
  const match = pathname.match(/^\/app\/templates\/([^/]+)\/create$/);
  if (!match) {
    return null;
  }

  const publicationId = match[1] ? decodeURIComponent(match[1]) : '';
  return publicationId ? { publicationId } : null;
}

function parseBlockIntentPath(pathname: string): { publicationId: string } | null {
  const match = pathname.match(/^\/app\/blocks\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const publicationId = match[1] ? decodeURIComponent(match[1]) : '';
  return publicationId ? { publicationId } : null;
}

function parseProjectOpenSearch(search: string): { projectId: string } | null {
  const projectId = new URLSearchParams(search).get('projectId')?.trim() ?? '';
  return projectId ? { projectId } : null;
}

function parseProjectCreationIntentRoute(pathname: string, search: string): { intentId: string | null } | null {
  if (pathname !== '/app/new') {
    return null;
  }

  const intentId = new URLSearchParams(search).get('intent')?.trim() ?? '';
  return { intentId: intentId || null };
}

function sanitizeNextPath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    if (!url.pathname.startsWith('/')) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function buildLoginRoute(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
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

function getProjectPermissions(permissions: ProjectSectionPermissions | undefined): ProjectSectionPermissions {
  return permissions ?? { schedule: 'edit', resources: 'edit', finance: 'edit' };
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

type BackupImportResponse = {
  ok: true;
  summary: BackupRestoreSummary;
};

type PreviewState = {
  tasks: Task[];
  active: boolean;
  mode: 'rendering' | 'failed';
  message: string | null;
  wave: number;
};

type ProjectGenerationJobView = {
  id: string;
  projectId: string | null;
  intentId: string | null;
  userId: string;
  source: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  stage: 'queued' | 'interpreting' | 'planning' | 'compiling' | 'committing' | 'finalizing' | 'succeeded' | 'failed';
  statusMessage: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  progressPercent: number | null;
  previewMode: 'none' | 'ephemeral' | 'persisted';
  previewAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function isActiveProjectGenerationJob(job: ProjectGenerationJobView | null): boolean {
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}

type StoredGenerationPreview = {
  jobId: string;
  projectId: string;
  tasks: Task[];
  mode: 'rendering' | 'failed';
  message: string | null;
  wave: number;
};

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function getGenerationJobStorageKey(projectId: string): string {
  return `${GENERATION_JOB_STORAGE_KEY_PREFIX}${projectId}`;
}

function getGenerationPreviewStorageKey(projectId: string): string {
  return `${GENERATION_PREVIEW_STORAGE_KEY_PREFIX}${projectId}`;
}

function readStoredGenerationJob(projectId: string): ProjectGenerationJobView | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getGenerationJobStorageKey(projectId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ProjectGenerationJobView;
  } catch {
    return null;
  }
}

function writeStoredGenerationJob(projectId: string, job: ProjectGenerationJobView | null): void {
  if (!canUseSessionStorage()) {
    return;
  }

  if (!job || !isActiveProjectGenerationJob(job)) {
    window.sessionStorage.removeItem(getGenerationJobStorageKey(projectId));
    return;
  }

  window.sessionStorage.setItem(getGenerationJobStorageKey(projectId), JSON.stringify(job));
}

function readStoredGenerationPreview(projectId: string): StoredGenerationPreview | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getGenerationPreviewStorageKey(projectId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredGenerationPreview;
  } catch {
    return null;
  }
}

function writeStoredGenerationPreview(projectId: string, preview: StoredGenerationPreview | null): void {
  if (!canUseSessionStorage()) {
    return;
  }

  if (!preview) {
    window.sessionStorage.removeItem(getGenerationPreviewStorageKey(projectId));
    return;
  }

  window.sessionStorage.setItem(getGenerationPreviewStorageKey(projectId), JSON.stringify(preview));
}

export default function App() {
  const auth = useAuth();
  const localTasks = useLocalTasks();
  const showOtpModal = useUIStore((state) => state.showOtpModal);
  const showEditProjectModal = useUIStore((state) => state.showEditProjectModal);
  const setShowOtpModal = useUIStore((state) => state.setShowOtpModal);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const showProjectSettingsModal = useUIStore((state) => state.showProjectSettingsModal);
  const setShowProjectSettingsModal = useUIStore((state) => state.setShowProjectSettingsModal);
  const [route, setRoute] = useState<RouteState>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  const [workspaceTemplateCreateIntentId, setWorkspaceTemplateCreateIntentId] = useState<string | null>(null);
  const [workspaceProjectCreationIntentId, setWorkspaceProjectCreationIntentId] = useState<string | null>(null);
  const [workspaceProjectOpenIntentId, setWorkspaceProjectOpenIntentId] = useState<string | null>(null);

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

  const navigate = useCallback((target: string, replace = true) => {
    const nextUrl = `${window.location.origin}${target}`;
    if (replace) {
      window.history.replaceState(window.history.state, '', nextUrl);
    } else {
      window.history.pushState(window.history.state, '', nextUrl);
    }
    setRoute({
      pathname: window.location.pathname,
      search: window.location.search,
    });
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

    const nextPath = sanitizeNextPath(new URLSearchParams(route.search).get('next'));
    if (nextPath) {
      navigate(nextPath);
      return;
    }

    if (normalizePathname(route.pathname) === '/login') {
      navigate('/');
    }
  }, [auth, localTasks, navigate, route.pathname, route.search, setShowOtpModal]);

  const normalizedPathname = normalizePathname(route.pathname);
  const templateCreateRoute = parseTemplateCreatePath(normalizedPathname);
  const blockIntentRoute = parseBlockIntentPath(normalizedPathname);
  const projectCreationIntentRoute = parseProjectCreationIntentRoute(normalizedPathname, route.search);
  const isLoginRoute = normalizedPathname === '/login';
  const isKnownRoute = SUPPORTED_APP_PATHS.has(normalizedPathname)
    || Boolean(templateCreateRoute)
    || Boolean(blockIntentRoute)
    || Boolean(projectCreationIntentRoute);
  const authModalMethod = new URLSearchParams(route.search).get('auth') === 'otp' ? 'otp' : 'yandex';
  const projectOpenRoute = parseProjectOpenSearch(route.search);
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

  useEffect(() => {
    if (!isLoginRoute) {
      return;
    }

    if (auth.isAuthenticated) {
      const nextPath = sanitizeNextPath(new URLSearchParams(route.search).get('next'));
      navigate(nextPath ?? '/');
      return;
    }

    setShowOtpModal(true);
  }, [auth.isAuthenticated, isLoginRoute, navigate, route.search, setShowOtpModal]);

  useEffect(() => {
    const intentRoute = templateCreateRoute ?? blockIntentRoute;
    if (!intentRoute || auth.isAuthenticated) {
      return;
    }

    navigate(buildLoginRoute(`${route.pathname}${route.search}`));
  }, [auth.isAuthenticated, blockIntentRoute, navigate, route.pathname, route.search, templateCreateRoute]);

  useEffect(() => {
    if (!projectCreationIntentRoute) {
      return;
    }

    if (!auth.isAuthenticated) {
      navigate(buildLoginRoute(`${route.pathname}${route.search}`));
      return;
    }

    setWorkspaceProjectCreationIntentId(projectCreationIntentRoute.intentId);
    navigate('/');
  }, [auth.isAuthenticated, navigate, projectCreationIntentRoute, route.pathname, route.search]);

  useEffect(() => {
    if (!projectOpenRoute) {
      return;
    }

    if (!auth.isAuthenticated) {
      navigate(buildLoginRoute(`${route.pathname}${route.search}`));
      return;
    }

    setWorkspaceProjectOpenIntentId(projectOpenRoute.projectId);
    navigate('/');
  }, [auth.isAuthenticated, navigate, projectOpenRoute, route.pathname, route.search]);

  useEffect(() => {
    if (!auth.isAuthenticated || !templateCreateRoute) {
      return;
    }

    setWorkspaceTemplateCreateIntentId(templateCreateRoute.publicationId);
    navigate('/');
  }, [auth.isAuthenticated, navigate, templateCreateRoute]);

  const handleOtpClose = useCallback(() => {
    setShowOtpModal(false);
    if (isLoginRoute) {
      navigate('/');
    }
  }, [isLoginRoute, navigate, setShowOtpModal]);

  return (
    <>
      {isYandexCallbackRoute ? (
        <YandexCallbackPage />
      ) : blockIntentRoute ? (
        <BlockPublicationIntentPage
          publicationId={blockIntentRoute.publicationId}
          auth={auth}
          onLoginRequired={() => setShowOtpModal(true)}
        />
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
          templateCreateIntentId={workspaceTemplateCreateIntentId}
          onConsumeTemplateCreateIntent={() => setWorkspaceTemplateCreateIntentId(null)}
          projectCreationIntentId={workspaceProjectCreationIntentId}
          onConsumeProjectCreationIntent={() => setWorkspaceProjectCreationIntentId(null)}
          projectOpenIntentId={workspaceProjectOpenIntentId}
          onConsumeProjectOpenIntent={() => setWorkspaceProjectOpenIntentId(null)}
        />
      )}

      {showOtpModal && (
        <OtpModal
          initialMethod={authModalMethod}
          onSuccess={handleAuthSuccess}
          onClose={handleOtpClose}
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
  templateCreateIntentId: string | null;
  onConsumeTemplateCreateIntent: () => void;
  projectCreationIntentId: string | null;
  onConsumeProjectCreationIntent: () => void;
  projectOpenIntentId: string | null;
  onConsumeProjectOpenIntent: () => void;
}

interface PendingProjectCreation {
  firstPrompt?: string;
  createEmptyChart?: boolean;
  groupId?: string;
  projectIntentId?: string;
  templatePublicationId?: string;
  initialProjectName?: string;
  title?: string;
  description?: string;
}

function WorkspaceApp({
  auth,
  localTasks,
  onLoginRequired,
  templateCreateIntentId,
  onConsumeTemplateCreateIntent,
  projectCreationIntentId,
  onConsumeProjectCreationIntent,
  projectOpenIntentId,
  onConsumeProjectOpenIntent,
}: WorkspaceAppProps) {
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
  const showProjectSettingsModal = useUIStore((state) => state.showProjectSettingsModal);
  const setShowProjectSettingsModal = useUIStore((state) => state.setShowProjectSettingsModal);
  const setValidationErrors = useUIStore((state) => state.setValidationErrors);
  const setShareStatus = useUIStore((state) => state.setShareStatus);
  const aiMutationLock = useUIStore((state) => state.aiMutationLock);
  const setProjectState = useProjectUIStore((state) => state.setProjectState);
  const getProjectState = useProjectUIStore((state) => state.getProjectState);
  const activeTemplate = useTemplateStore((state) => state.activeTemplate);
  const setActiveTemplate = useTemplateStore((state) => state.setActiveTemplate);
  const updateActiveTemplateTasks = useTemplateStore((state) => state.updateActiveTemplateTasks);
  const [deleteProjectDraft, setDeleteProjectDraft] = useState<{ id: string; name: string } | null>(null);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showPdfHelper, setShowPdfHelper] = useState(false);
  const [pendingProjectCreation, setPendingProjectCreation] = useState<PendingProjectCreation | null>(null);
  const [pendingPreparedIntentStart, setPendingPreparedIntentStart] = useState<{ intentId: string; projectId: string } | null>(null);
  const [preparedIntentChatProjectId, setPreparedIntentChatProjectId] = useState<string | null>(null);
  const [activeGenerationJob, setActiveGenerationJob] = useState<ProjectGenerationJobView | null>(null);
  const [generationJobLookupPending, setGenerationJobLookupPending] = useState(false);
  const hasShareToken = Boolean(sharedProject.shareToken);
  const [isExportExcelLoading, setIsExportExcelLoading] = useState(false);
  const [isImportTemplateLoading, setIsImportTemplateLoading] = useState(false);
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupRestorePending, setBackupRestorePending] = useState(false);
  const [backupRestoreError, setBackupRestoreError] = useState<string | null>(null);
  const [backupRestoreSummary, setBackupRestoreSummary] = useState<BackupRestoreSummary | null>(null);
  const [startScreenProjectSettingsPending, setStartScreenProjectSettingsPending] = useState(false);
  const [startScreenProjectSettingsError, setStartScreenProjectSettingsError] = useState<string | null>(null);
  const [shareSelectionMode, setShareSelectionMode] = useState(false);
  const [selectedShareTaskIds, setSelectedShareTaskIds] = useState<Set<string>>(new Set());
  const [templateSelectionMode, setTemplateSelectionMode] = useState(false);
  const [selectedTemplateTaskIds, setSelectedTemplateTaskIds] = useState<Set<string>>(new Set());
  const [saveTemplateDraft, setSaveTemplateDraft] = useState<{ mode: 'project' | 'selection'; initialName: string; taskCount: number; rootTaskIds: string[] } | null>(null);
  const [saveTemplatePending, setSaveTemplatePending] = useState(false);
  const [insertTemplateDraft, setInsertTemplateDraft] = useState<{ anchorTaskId: string; anchorTaskName: string } | null>(null);
  const [insertTemplatePending, setInsertTemplatePending] = useState(false);
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
  const projectPermissions = getProjectPermissions(auth.project?.permissions);
  const canViewSchedule = hasShareToken || projectPermissions.schedule !== 'none';
  const canEditSchedule = hasShareToken ? false : projectPermissions.schedule === 'edit';
  const canViewResources = hasShareToken || projectPermissions.resources !== 'none';
  const canEditResources = hasShareToken ? false : projectPermissions.resources === 'edit';
  const canViewFinance = hasShareToken || projectPermissions.finance !== 'none';
  const canEditFinance = hasShareToken ? false : projectPermissions.finance === 'edit';
  const isArchivedProject = !hasShareToken && workspace.kind === 'project' && auth.project?.status === 'archived';
  const isScheduleReadOnlyProject = isArchivedProject || !canEditSchedule;
  const chatDisabledReason = isScheduleReadOnlyProject
    ? 'Проект доступен только для чтения. AI-изменения недоступны.'
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

  const {
    templates,
    loadingTemplate,
    saveTemplateSnapshot,
    loadTemplates,
    openTemplate,
    createTemplateFromProject,
    createTemplateFromSelection,
    renameTemplate,
    deleteTemplate,
    insertTemplateIntoProject,
  } = useTemplates(hasShareToken ? null : auth.accessToken);

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

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken) {
      useTemplateStore.getState().clear();
      return;
    }
    void loadTemplates();
  }, [auth.isAuthenticated, hasShareToken, loadTemplates]);

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
  const templateTasks = activeTemplate?.snapshot.tasks ?? [];
  const setTemplateTasks = useCallback((nextTasks: Task[] | ((prev: Task[]) => Task[])) => {
    const currentTasks = useTemplateStore.getState().activeTemplate?.snapshot.tasks ?? [];
    const resolved = typeof nextTasks === 'function' ? nextTasks(currentTasks) : nextTasks;
    updateActiveTemplateTasks(resolved);
  }, [updateActiveTemplateTasks]);
  const batchUpdate = useBatchTaskUpdate({
    tasks,
    setTasks,
    accessToken: hasShareToken ? null : auth.isAuthenticated ? auth.accessToken : null,
    ganttDayMode: hasShareToken ? (sharedProject.project?.ganttDayMode ?? 'calendar') : (auth.project?.ganttDayMode ?? 'calendar'),
    calendarDays: hasShareToken
      ? (sharedProject.project?.calendarDays ?? EMPTY_CALENDAR_DAYS)
      : (auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS),
  });
  const templateBatchUpdate = useTemplateBatchUpdate({
    tasks: templateTasks,
    setTasks: setTemplateTasks,
    saveTemplateSnapshot,
  });
  const ganttRef = useRef<GanttChartRef>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
  const [pendingGanttDayMode, setPendingGanttDayMode] = useState<'business' | 'calendar' | null>(null);
  const activationInFlightRef = useRef(false);
  const createEmptyChartAfterActivationRef = useRef(false);
  const queuedPromptRef = useRef<string | null>(null);
  const aiDoneGraceTimerRef = useRef<number | null>(null);
  const aiMutationWatchdogRef = useRef<number | null>(null);
  const lastGenerationFailureJobIdRef = useRef<string | null>(null);
  const [activeEmptyProjectModeProjectId, setActiveEmptyProjectModeProjectId] = useState<string | null>(null);
  const bumpHistoryRefreshRevision = useUIStore((state) => state.bumpHistoryRefreshRevision);
  const setAiMutationLock = useUIStore((state) => state.setAiMutationLock);
  const clearAiMutationLock = useUIStore((state) => state.clearAiMutationLock);
  const effectiveAuthGanttDayMode = pendingGanttDayMode ?? (auth.project?.ganttDayMode ?? 'calendar');
  const visibleTasks = previewState.active ? previewState.tasks : tasks;
  const activeWorkspaceProjectId = workspace.kind === 'project' ? workspace.projectId : null;
  const activeProjectGenerationRunning = Boolean(
    activeGenerationJob
    && isActiveProjectGenerationJob(activeGenerationJob)
    && activeGenerationJob.projectId === activeWorkspaceProjectId,
  );

  useLayoutEffect(() => {
    if (!activeWorkspaceProjectId) {
      return;
    }

    const storedJob = readStoredGenerationJob(activeWorkspaceProjectId);
    if (storedJob && isActiveProjectGenerationJob(storedJob)) {
      setActiveGenerationJob((current) => current?.id === storedJob.id ? current : storedJob);
      setAiMutationLock({
        active: true,
        stage: 'thinking',
        message: storedJob.statusMessage ?? 'Восстанавливаем активную генерацию...',
      });
      useChatStore.setState((state) => ({
        ...state,
        aiThinking: true,
        error: null,
      }));
    }

    const storedPreview = readStoredGenerationPreview(activeWorkspaceProjectId);
    if (storedPreview) {
      setPreviewState({
        tasks: normalizeTasks(storedPreview.tasks),
        active: true,
        mode: storedPreview.mode,
        message: storedPreview.message,
        wave: storedPreview.wave,
      });
    }
  }, [activeWorkspaceProjectId, setAiMutationLock]);

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
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
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

  useEffect(() => {
    if (!activeWorkspaceProjectId || !activeGenerationJob || activeGenerationJob.projectId !== activeWorkspaceProjectId) {
      return;
    }

    writeStoredGenerationJob(activeWorkspaceProjectId, activeGenerationJob);

    if (activeGenerationJob.status === 'queued' || activeGenerationJob.status === 'running') {
      clearAiDoneGraceTimer();
      setAiMutationLock({
        active: true,
        stage: activeGenerationJob.previewAvailable ? 'preview' : 'thinking',
        message: activeGenerationJob.statusMessage ?? 'AI формирует стартовый график и сохраняет его в проект.',
      });
      useChatStore.setState((state) => ({
        ...state,
        aiThinking: true,
        error: null,
      }));
      return;
    }

    if (activeGenerationJob.status === 'failed') {
      releaseAiMutationLock();
      setPreparedIntentChatProjectId(null);
      const storedPreview = readStoredGenerationPreview(activeWorkspaceProjectId);
      setPreviewState((current) => ({
        tasks: current.tasks.length > 0 ? current.tasks : normalizeTasks(storedPreview?.tasks ?? []),
        active: current.tasks.length > 0 || Boolean(storedPreview?.tasks?.length),
        mode: 'failed',
        message: activeGenerationJob.errorMessage ?? activeGenerationJob.statusMessage ?? 'Генерация завершилась ошибкой.',
        wave: current.wave > 0 ? current.wave : (storedPreview?.wave ?? 0),
      }));
      if (lastGenerationFailureJobIdRef.current !== activeGenerationJob.id) {
        lastGenerationFailureJobIdRef.current = activeGenerationJob.id;
        useChatStore.getState().setError(activeGenerationJob.errorMessage ?? activeGenerationJob.statusMessage ?? 'Генерация завершилась ошибкой.');
      }
      return;
    }

    if (activeGenerationJob.status === 'succeeded' || activeGenerationJob.status === 'canceled') {
      writeStoredGenerationJob(activeWorkspaceProjectId, null);
      writeStoredGenerationPreview(activeWorkspaceProjectId, null);
      releaseAiMutationLock();
      setPreparedIntentChatProjectId(null);
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
    }
  }, [
    activeGenerationJob,
    activeWorkspaceProjectId,
    clearAiDoneGraceTimer,
    releaseAiMutationLock,
    setAiMutationLock,
  ]);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    console.log('[WS] message', msg);
    if (msg.type === 'preview_tasks' || msg.type === 'preview_tasks_replace') {
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
        wave: msg.type === 'preview_tasks_replace' ? (msg.wave ?? 1) : 1,
      });
      if (workspace.kind === 'project') {
        const previewJobId = activeGenerationJob?.projectId === workspace.projectId ? activeGenerationJob.id : 'unknown';
        writeStoredGenerationPreview(workspace.projectId, {
          jobId: previewJobId,
          projectId: workspace.projectId,
          tasks: normalizedPreviewTasks,
          mode: 'rendering',
          message: null,
          wave: msg.type === 'preview_tasks_replace' ? (msg.wave ?? 1) : 1,
        });
      }
      return;
    }
    if (msg.type === 'preview_failed') {
      armAiMutationWatchdog();
      setAiMutationLock({
        active: true,
        stage: 'failed',
        message: msg.message ?? 'Предварительный график не был сохранён.',
      });
      setPreparedIntentChatProjectId(null);
      setPreviewState((current) => current.active
        ? {
            ...current,
            mode: 'failed',
            message: msg.message ?? 'Предварительный график не был сохранён.',
          }
        : current);
      if (workspace.kind === 'project') {
        const storedPreview = readStoredGenerationPreview(workspace.projectId);
        if (storedPreview) {
          writeStoredGenerationPreview(workspace.projectId, {
            ...storedPreview,
            mode: 'failed',
            message: msg.message ?? 'Предварительный график не был сохранён.',
          });
        }
      }
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
      if (workspace.kind === 'project') {
        writeStoredGenerationPreview(workspace.projectId, null);
        writeStoredGenerationJob(workspace.projectId, null);
      }
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
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
      setActiveGenerationJob((current) => current && isActiveProjectGenerationJob(current)
        ? { ...current, status: 'succeeded', stage: 'succeeded', statusMessage: 'График готов', errorCode: null, errorMessage: null }
        : current);
      return;
    }
    if (msg.type === 'token') {
      setPreparedIntentChatProjectId(null);
      armAiMutationWatchdog();
      useChatStore.getState().appendToken(msg.content ?? '');
      return;
    }
    if (msg.type === 'done') {
      setPreparedIntentChatProjectId(null);
      clearAiDoneGraceTimer();
      releaseAiMutationLock();
      if (workspace.kind === 'project') {
        writeStoredGenerationPreview(workspace.projectId, null);
        writeStoredGenerationJob(workspace.projectId, null);
      }
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
      setActiveGenerationJob((current) => current && isActiveProjectGenerationJob(current)
        ? { ...current, status: 'succeeded', stage: 'succeeded', statusMessage: 'График готов', errorCode: null, errorMessage: null }
        : current);
      useChatStore.getState().attachCheckpointToLatestUserMessage(msg.chatMessage);
      useChatStore.getState().finishStreaming(msg.chatMessage);
      return;
    }
    if (msg.type === 'error') {
      setPreparedIntentChatProjectId(null);
      clearAiDoneGraceTimer();
      releaseAiMutationLock();
      if (workspace.kind === 'project') {
        const storedPreview = readStoredGenerationPreview(workspace.projectId);
        if (storedPreview) {
          writeStoredGenerationPreview(workspace.projectId, {
            ...storedPreview,
            mode: 'failed',
            message: msg.message ?? 'unknown error',
          });
        }
      }
      setPreviewState((current) => current.active
        ? { ...current, mode: 'failed', message: msg.message ?? 'unknown error' }
        : current);
      setActiveGenerationJob((current) => current && isActiveProjectGenerationJob(current)
        ? { ...current, status: 'failed', stage: 'failed', statusMessage: msg.message ?? 'unknown error', errorMessage: msg.message ?? 'unknown error' }
        : current);
      useChatStore.getState().setError(msg.message ?? 'unknown error');
    }
  }, [
    activeGenerationJob,
    armAiMutationWatchdog,
    auth.isAuthenticated,
    bumpHistoryRefreshRevision,
    clearAiDoneGraceTimer,
    hasShareToken,
    releaseAiMutationLock,
    scheduleAiDoneGraceExit,
    setAiMutationLock,
    workspace,
  ]);

  const { connected, connectedToken } = useWebSocket(
    handleWsMessage,
    () => (hasShareToken ? null : auth.accessToken),
    hasShareToken ? null : auth.accessToken,
    hasShareToken ? undefined : auth.refreshAccessToken,
  );
  const displayConnected = hasShareToken ? true : auth.isAuthenticated ? connected : true;

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || hasShareToken || workspace.kind !== 'project') {
      setActiveGenerationJob(null);
      setGenerationJobLookupPending(false);
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;

    const loadLatestGenerationJob = async () => {
      setGenerationJobLookupPending(true);
      let token = getLatestAccessToken();
      if (!token) {
        setGenerationJobLookupPending(false);
        return;
      }

      let response = await fetch(`/api/project-generation-jobs/active?projectId=${encodeURIComponent(workspace.projectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          setGenerationJobLookupPending(false);
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch(`/api/project-generation-jobs/active?projectId=${encodeURIComponent(workspace.projectId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!response.ok || cancelled) {
        setGenerationJobLookupPending(false);
        return;
      }

      const payload = await response.json() as { job: ProjectGenerationJobView | null };
      if (cancelled) {
        setGenerationJobLookupPending(false);
        return;
      }

      if (payload.job) {
        setActiveGenerationJob(payload.job);
        setGenerationJobLookupPending(false);

        if ((payload.job.status === 'queued' || payload.job.status === 'running') && pollTimer === null) {
          pollTimer = window.setInterval(() => {
            void loadLatestGenerationJob();
          }, 2000);
        }

        if (!(payload.job.status === 'queued' || payload.job.status === 'running') && pollTimer !== null) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
        return;
      }

      const latestResponse = await fetch(`/api/project-generation-jobs/latest?projectId=${encodeURIComponent(workspace.projectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!latestResponse.ok || cancelled) {
        setGenerationJobLookupPending(false);
        return;
      }
      const latestPayload = await latestResponse.json() as { job: ProjectGenerationJobView | null };
      if (cancelled) {
        setGenerationJobLookupPending(false);
        return;
      }

      if (!latestPayload.job || latestPayload.job.status === 'succeeded') {
        setActiveGenerationJob(null);
      } else {
        setActiveGenerationJob(latestPayload.job);
      }
      setGenerationJobLookupPending(false);
    };

    void loadLatestGenerationJob();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [
    auth.accessToken,
    auth.isAuthenticated,
    auth.refreshAccessToken,
    hasShareToken,
    workspace,
  ]);

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
      if (current.kind === 'template') {
        return current;
      }
      if (current.kind === 'project' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'finance' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'planner' && current.projectId === projectId) {
        return current;
      }
      const activeWorkspace = getProjectState(projectId)?.activeWorkspace ?? 'project';
      return activeWorkspace === 'planner'
        ? { kind: 'planner', projectId }
        : activeWorkspace === 'finance'
          ? { kind: 'finance', projectId }
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
    if (auth.project?.taskCount === 0 && workspace.kind === 'project') {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
  }, [auth.project?.taskCount, setWorkspace, workspace]);

  const toggleProjectChat = useCallback(() => {
    if (auth.project?.taskCount === 0 && workspace.kind === 'project' && !workspace.chatOpen) {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: !current.chatOpen } : current);
  }, [auth.project?.taskCount, setWorkspace, workspace]);

  const resetWorkspacePresentation = useCallback(() => {
    clearAiDoneGraceTimer();
    releaseAiMutationLock();
    if (activeWorkspaceProjectId) {
      writeStoredGenerationJob(activeWorkspaceProjectId, null);
      writeStoredGenerationPreview(activeWorkspaceProjectId, null);
    }
    setActiveGenerationJob(null);
    setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
    replaceTasksFromSystem([]);
    useProjectStore.getState().hydrateConfirmed(0, { tasks: [], dependencies: [] });
    useChatStore.getState().reset();
  }, [activeWorkspaceProjectId, clearAiDoneGraceTimer, releaseAiMutationLock, replaceTasksFromSystem]);

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
      let newProject: AuthProject | null = null;

      if (options.projectIntentId) {
        const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
        let token = getLatestAccessToken();
        if (!token || !auth.user) {
          queuedPromptRef.current = null;
          createEmptyChartAfterActivationRef.current = false;
          return null;
        }

        let response = await fetch(`/api/project-intents/${encodeURIComponent(options.projectIntentId)}/create-project`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectName: name.trim(),
            groupId: options.groupId ?? auth.project?.groupId,
          }),
        });

        if (response.status === 401) {
          const refreshedToken = await auth.refreshAccessToken();
          if (!refreshedToken) {
            queuedPromptRef.current = null;
            createEmptyChartAfterActivationRef.current = false;
            return null;
          }
          token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
          response = await fetch(`/api/project-intents/${encodeURIComponent(options.projectIntentId)}/create-project`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              projectName: name.trim(),
              groupId: options.groupId ?? auth.project?.groupId,
            }),
          });
        }

        if (response.status === 403) {
          try {
            const body = await response.json() as Partial<ConstraintDenialPayload>;
            if (isConstraintCode(body.code)) {
              await openLimitModal(body);
              queuedPromptRef.current = null;
              createEmptyChartAfterActivationRef.current = false;
              return null;
            }
          } catch {
            // fall through
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json() as {
          accessToken: string;
          refreshToken: string;
          project: AuthProject;
        };
        auth.login(
          { accessToken: payload.accessToken, refreshToken: payload.refreshToken },
          auth.user,
          payload.project,
        );
        newProject = payload.project;
        queuedPromptRef.current = null;
        setPreparedIntentChatProjectId(payload.project.id);
        useChatStore.setState({
          streamingText: '',
          pendingAssistantMeta: null,
          aiThinking: true,
          error: null,
        });
        try {
          const startGenerationResponse = await fetch(`/api/project-intents/${encodeURIComponent(options.projectIntentId)}/start-generation`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${payload.accessToken}`,
            },
          });

          if (!startGenerationResponse.ok) {
            const startPayload = await startGenerationResponse.json().catch(() => ({ error: `HTTP ${startGenerationResponse.status}` })) as { error?: string };
            throw new Error(startPayload.error ?? `HTTP ${startGenerationResponse.status}`);
          }

          const startPayload = await startGenerationResponse.json() as { job?: ProjectGenerationJobView | null };
          setPendingPreparedIntentStart(null);
          if (startPayload.job) {
            setActiveGenerationJob(startPayload.job);
            setPreparedIntentChatProjectId(startPayload.job.projectId ?? payload.project.id);
          }
        } catch (startError) {
          console.error('Failed to start prepared project intent generation immediately:', startError);
          setPendingPreparedIntentStart({ intentId: options.projectIntentId, projectId: payload.project.id });
        }
      } else if (options.templatePublicationId) {
        const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
        let token = getLatestAccessToken();
        if (!token) {
          queuedPromptRef.current = null;
          createEmptyChartAfterActivationRef.current = false;
          return null;
        }

        let response = await fetch(`/api/template-publications/${encodeURIComponent(options.templatePublicationId)}/create-project`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectName: name.trim(),
            groupId: options.groupId ?? auth.project?.groupId,
          }),
        });

        if (response.status === 401) {
          const refreshedToken = await auth.refreshAccessToken();
          if (!refreshedToken) {
            queuedPromptRef.current = null;
            createEmptyChartAfterActivationRef.current = false;
            return null;
          }
          token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
          response = await fetch(`/api/template-publications/${encodeURIComponent(options.templatePublicationId)}/create-project`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              projectName: name.trim(),
              groupId: options.groupId ?? auth.project?.groupId,
            }),
          });
        }

        if (response.status === 403) {
          try {
            const body = await response.json() as Partial<ConstraintDenialPayload>;
            if (isConstraintCode(body.code)) {
              await openLimitModal(body);
              queuedPromptRef.current = null;
              createEmptyChartAfterActivationRef.current = false;
              return null;
            }
          } catch {
            // fall through to generic error below
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json() as { project: AuthProject };
        newProject = payload.project;
      } else {
        newProject = await auth.createProject(name.trim(), options.groupId ?? auth.project?.groupId);
      }

      if (!newProject) {
        queuedPromptRef.current = null;
        createEmptyChartAfterActivationRef.current = false;
        return null;
      }

      await auth.refreshProjects();

      if (!options.projectIntentId) {
        await auth.switchProject(newProject.id);
      }
      setSidebarState('closed');
      if (options.createEmptyChart) {
        setActiveEmptyProjectModeProjectId(newProject.id);
      } else {
        replaceTasksFromSystem([]);
      }
      if (options.firstPrompt && !options.projectIntentId) {
        useChatStore.getState().addMessage({ role: 'user', content: options.firstPrompt });
      }
      setWorkspace({
        kind: 'project',
        projectId: newProject.id,
        chatOpen: options.createEmptyChart
          ? false
          : (options.firstPrompt || options.projectIntentId ? true : readProjectChatOpenState()),
      });
      setPendingProjectCreation(null);
      setPendingPostAuthAction(null);
      return { id: newProject.id, name: newProject.name };
    } finally {
      activationInFlightRef.current = false;
    }
  }, [auth, hasShareToken, openLimitModal, replaceTasksFromSystem, resetWorkspacePresentation, setPendingPostAuthAction, setProjectState, setSidebarState, setWorkspace]);

  useEffect(() => {
    if (!projectCreationIntentId || !auth.isAuthenticated || hasShareToken) {
      return;
    }

    let cancelled = false;

    const openProjectIntentModal = async () => {
      const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
      let token = getLatestAccessToken();
      if (!token) {
        onConsumeProjectCreationIntent();
        return;
      }

      let response = await fetch(`/api/project-intents/${encodeURIComponent(projectCreationIntentId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onConsumeProjectCreationIntent();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch(`/api/project-intents/${encodeURIComponent(projectCreationIntentId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (cancelled) {
        return;
      }

      if (response.status === 410) {
        window.alert('Черновик запроса устарел. Опишите проект ещё раз.');
        onConsumeProjectCreationIntent();
        return;
      }

      if (!response.ok) {
        window.alert('Не удалось подготовить запрос. Попробуйте ещё раз.');
        onConsumeProjectCreationIntent();
        return;
      }

      await response.json();

      openCreateProjectModal({
        projectIntentId: projectCreationIntentId,
        groupId: auth.project?.groupId ?? auth.projectGroups[0]?.id,
        initialProjectName: 'Новый проект',
        title: 'Новый проект по вашему описанию',
        description: 'Запрос уже подготовлен. Создайте проект, и стартовый prompt появится в рабочем пространстве.',
      });
      onConsumeProjectCreationIntent();
    };

    void openProjectIntentModal();

    return () => {
      cancelled = true;
    };
  }, [
    auth.accessToken,
    auth.isAuthenticated,
    auth.project?.groupId,
    auth.projectGroups,
    auth.refreshAccessToken,
    hasShareToken,
    onConsumeProjectCreationIntent,
    openCreateProjectModal,
    projectCreationIntentId,
  ]);

  useEffect(() => {
    if (!pendingPreparedIntentStart || !auth.isAuthenticated || !auth.accessToken || workspace.kind !== 'project') {
      return;
    }
    if (workspace.projectId !== pendingPreparedIntentStart.projectId) {
      return;
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    if (!token) {
      return;
    }

    const currentIntentStart = pendingPreparedIntentStart;
    setPendingPreparedIntentStart(null);

    void fetch(`/api/project-intents/${encodeURIComponent(currentIntentStart.intentId)}/start-generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        }
        const payload = await response.json() as { job?: ProjectGenerationJobView | null };
        if (payload.job) {
          setActiveGenerationJob(payload.job);
          setPreparedIntentChatProjectId(payload.job.projectId ?? currentIntentStart.projectId);
        }
      })
      .catch((startError) => {
        setPreparedIntentChatProjectId(null);
        console.error('Failed to start prepared project intent generation:', startError);
        useChatStore.getState().setError(String(startError));
      });
  }, [auth.accessToken, auth.isAuthenticated, pendingPreparedIntentStart, workspace]);

  useEffect(() => {
    if (!templateCreateIntentId || !auth.isAuthenticated || hasShareToken) {
      return;
    }

    let cancelled = false;

    const openTemplateCreateModal = async () => {
      const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
      let token = getLatestAccessToken();
      let publication: TemplatePublicationDetail | null = null;

      if (token) {
        let response = await fetch(`/api/template-publications/${encodeURIComponent(templateCreateIntentId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          const refreshedToken = await auth.refreshAccessToken();
          if (refreshedToken) {
            token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
            response = await fetch(`/api/template-publications/${encodeURIComponent(templateCreateIntentId)}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
          }
        }

        if (response.ok) {
          publication = await response.json() as TemplatePublicationDetail;
        }
      }

      if (cancelled) {
        return;
      }

      const briefParts = [
        publication?.taskCount ? `${publication.taskCount} задач` : null,
        publication?.category?.trim() ? publication.category.trim() : null,
        publication?.industry?.trim() ? publication.industry.trim() : null,
      ].filter(Boolean);

      openCreateProjectModal({
        templatePublicationId: templateCreateIntentId,
        initialProjectName: publication?.title ?? 'Новый проект',
        groupId: auth.project?.groupId ?? auth.projectGroups[0]?.id,
        title: publication?.title ? `Новый проект из шаблона «${publication.title}»` : 'Новый проект из шаблона',
        description: publication
          ? [
              publication.summary?.trim() || 'Шаблон уже выбран. Укажите название проекта и группу, где он будет создан.',
              briefParts.length > 0 ? briefParts.join(' • ') : null,
            ].filter(Boolean).join(' ')
          : 'Шаблон уже выбран. Укажите название проекта и группу, где он будет создан.',
      });
      onConsumeTemplateCreateIntent();
    };

    void openTemplateCreateModal();

    return () => {
      cancelled = true;
    };
  }, [
    auth.accessToken,
    auth.isAuthenticated,
    auth.project?.groupId,
    auth.projectGroups,
    hasShareToken,
    onConsumeTemplateCreateIntent,
    openCreateProjectModal,
    templateCreateIntentId,
  ]);

  const submitChatMessage = useCallback(async (message: string) => {
    if (isScheduleReadOnlyProject) {
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
  }, [armAiMutationWatchdog, auth, isScheduleReadOnlyProject, openLimitModal, proactiveChatDenial, releaseAiMutationLock, setAiMutationLock]);

  const submitSplitTask = useCallback(async (task: Task, payload: SplitTaskSubmitPayload): Promise<StartScreenSendResult> => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (isScheduleReadOnlyProject) {
      return {
        accepted: false,
        message: 'Проект доступен только для чтения.',
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

    useChatStore.getState().addMessage({ role: 'user', content: buildSplitTaskTrace(task, payload) });
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
      body: JSON.stringify(payload),
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
        body: JSON.stringify(payload),
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
  }, [armAiMutationWatchdog, auth, hasShareToken, isScheduleReadOnlyProject, onLoginRequired, openLimitModal, openProjectChat, proactiveChatDenial, releaseAiMutationLock, setAiMutationLock]);

  const handleSend = useCallback((text: string): StartScreenSendResult => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (isScheduleReadOnlyProject) {
      return {
        accepted: false,
        message: 'Проект доступен только для чтения.',
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
  }, [auth.isAuthenticated, auth.project, hasShareToken, isScheduleReadOnlyProject, onLoginRequired, openLimitModal, openProjectChat, proactiveChatDenial, submitChatMessage]);

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
    if (isScheduleReadOnlyProject) {
      return {
        accepted: false,
        message: 'Проект доступен только для чтения.',
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
  }, [auth.isAuthenticated, auth.project, handleSend, hasShareToken, isScheduleReadOnlyProject, localTasks.tasks.length, onLoginRequired, openCreateProjectModal, openLimitModal, proactiveProjectDenial, setPendingPostAuthAction]);

  const handleValidation = useCallback((result: ValidationResult) => {
    setValidationErrors(result.isValid ? [] : result.errors);
    if (!result.isValid && result.errors.length > 0) {
      console.warn('[Gantt Validation] Dependency validation errors detected:', result.errors);
    }
  }, [setValidationErrors]);

  const handleCascade = useCallback((shiftedTasks: Task[]) => {
    if (isScheduleReadOnlyProject) {
      return;
    }
    void batchUpdate.handleTasksChange(shiftedTasks);
  }, [batchUpdate, isScheduleReadOnlyProject]);

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
    const activeWorkspace = getProjectState(projectId)?.activeWorkspace ?? 'project';
    setWorkspace(
      activeWorkspace === 'planner'
        ? { kind: 'planner', projectId }
        : activeWorkspace === 'finance'
          ? { kind: 'finance', projectId }
          : { kind: 'project', projectId, chatOpen: readProjectChatOpenState() }
    );
  }, [auth, getProjectState, setWorkspace]);

  const handleSwitchTemplate = useCallback(async (templateId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    await openTemplate(templateId);
    setWorkspace({ kind: 'template', templateId });
  }, [openTemplate, setWorkspace]);

  useEffect(() => {
    if (!projectOpenIntentId || !auth.isAuthenticated) {
      return;
    }

    if (auth.project?.id === projectOpenIntentId) {
      const activeWorkspace = getProjectState(projectOpenIntentId)?.activeWorkspace ?? 'project';
      setWorkspace(
        activeWorkspace === 'planner'
          ? { kind: 'planner', projectId: projectOpenIntentId }
          : activeWorkspace === 'finance'
            ? { kind: 'finance', projectId: projectOpenIntentId }
            : { kind: 'project', projectId: projectOpenIntentId, chatOpen: readProjectChatOpenState() },
      );
      onConsumeProjectOpenIntent();
      return;
    }

    void handleSwitchProject(projectOpenIntentId)
      .finally(() => {
        onConsumeProjectOpenIntent();
      });
  }, [
    auth.isAuthenticated,
    auth.project?.id,
    getProjectState,
    handleSwitchProject,
    onConsumeProjectOpenIntent,
    projectOpenIntentId,
    setWorkspace,
  ]);

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

  const handleCreateCurrentProjectTemplate = useCallback(() => {
    if (isScheduleReadOnlyProject) {
      return;
    }
    setShareSelectionMode(false);
    setSelectedShareTaskIds(new Set());
    setTemplateSelectionMode(false);
    setSaveTemplateDraft({
      mode: 'project',
      initialName: auth.project?.name ? `${auth.project.name} шаблон` : 'Новый шаблон',
      taskCount: visibleTasks.length,
      rootTaskIds: [],
    });
  }, [auth.project?.name, isScheduleReadOnlyProject, visibleTasks.length]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    const deletingCurrent = workspace.kind === 'template' && workspace.templateId === templateId;
    await deleteTemplate(templateId);
    if (deletingCurrent && auth.project?.id) {
      setWorkspace({ kind: 'project', projectId: auth.project.id, chatOpen: readProjectChatOpenState() });
    }
  }, [auth.project?.id, deleteTemplate, setWorkspace, workspace]);

  const handleSaveTemplateFromModal = useCallback(async (name: string) => {
    if (!saveTemplateDraft) {
      return;
    }
    setSaveTemplatePending(true);
    try {
      if (saveTemplateDraft.mode === 'project') {
        await createTemplateFromProject(name);
      } else {
        await createTemplateFromSelection({
          name,
          rootTaskIds: saveTemplateDraft.rootTaskIds,
        });
        setSelectedTemplateTaskIds(new Set());
        setTemplateSelectionMode(false);
      }
      setSaveTemplateDraft(null);
    } finally {
      setSaveTemplatePending(false);
    }
  }, [createTemplateFromProject, createTemplateFromSelection, saveTemplateDraft]);

  const handleInsertTemplateFromModal = useCallback(async (input: { templateId: string; placement: 'after' | 'inside' }) => {
    if (!insertTemplateDraft) {
      return;
    }
    setInsertTemplatePending(true);
    try {
      const response = await insertTemplateIntoProject({
        templateId: input.templateId,
        anchorTaskId: insertTemplateDraft.anchorTaskId,
        placement: input.placement,
      });
      if (response.accepted && response.snapshot) {
        useProjectStore.getState().hydrateConfirmed(response.newVersion, {
          tasks: normalizeTasks(response.snapshot.tasks),
          dependencies: response.snapshot.dependencies,
        });
      }
      setInsertTemplateDraft(null);
    } finally {
      setInsertTemplatePending(false);
    }
  }, [insertTemplateDraft, insertTemplateIntoProject]);

  const handleInsertTemplateAtTask = useCallback(async (task: Task) => {
    if (!templates.length) {
      return;
    }
    setInsertTemplateDraft({
      anchorTaskId: task.id,
      anchorTaskName: task.name,
    });
  }, [templates.length]);

  const handleOpenInsertTemplateIntoCurrentProject = useCallback(async () => {
    if (isScheduleReadOnlyProject || workspace.kind !== 'project' || !auth.project?.id || visibleTasks.length === 0 || templates.length === 0) {
      return;
    }

    const anchorTask = [...visibleTasks].reverse().find((task) => !task.parentId) ?? visibleTasks[visibleTasks.length - 1];
    if (!anchorTask) {
      return;
    }

    setInsertTemplateDraft({
      anchorTaskId: anchorTask.id,
      anchorTaskName: anchorTask.name,
    });
  }, [auth.project?.id, isScheduleReadOnlyProject, templates.length, visibleTasks, workspace.kind]);

  const handleInsertTemplateIntoCurrentProject = useCallback(async (templateId: string) => {
    if (isScheduleReadOnlyProject || workspace.kind !== 'project' || !auth.project?.id || visibleTasks.length === 0) {
      return;
    }

    const anchorTask = [...visibleTasks].reverse().find((task) => !task.parentId) ?? visibleTasks[visibleTasks.length - 1];
    if (!anchorTask) {
      return;
    }

    const response = await insertTemplateIntoProject({
      templateId,
      anchorTaskId: anchorTask.id,
      placement: 'after',
    });

    if (response.accepted && response.snapshot) {
      useProjectStore.getState().hydrateConfirmed(response.newVersion, {
        tasks: normalizeTasks(response.snapshot.tasks),
        dependencies: response.snapshot.dependencies,
      });
    }
  }, [auth.project?.id, insertTemplateIntoProject, isScheduleReadOnlyProject, visibleTasks, workspace.kind]);

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
    if (!canViewResources) {
      return;
    }
    const proactiveResourcePoolDenial = buildProactiveConstraintDenial('resource_pool', billingStatus);
    if (proactiveResourcePoolDenial) {
      await openLimitModal(proactiveResourcePoolDenial);
      return;
    }

    if (!auth.project) {
      return;
    }

    setWorkspace({ kind: 'planner', projectId: auth.project.id });
  }, [auth.project, billingStatus, canViewResources, openLimitModal, setWorkspace]);

  const handleOpenFinance = useCallback(async () => {
    if (!auth.project || !canViewFinance) {
      return;
    }

    setWorkspace({ kind: 'finance', projectId: auth.project.id });
  }, [auth.project, canViewFinance, setWorkspace]);

  useEffect(() => {
    if (!auth.project || hasShareToken) {
      return;
    }

    if (workspace.kind === 'project' && !canViewSchedule) {
      if (canViewResources) {
        setWorkspace({ kind: 'planner', projectId: auth.project.id });
      } else if (canViewFinance) {
        setWorkspace({ kind: 'finance', projectId: auth.project.id });
      }
      return;
    }

    if (workspace.kind === 'planner' && !canViewResources) {
      if (canViewSchedule) {
        setWorkspace({ kind: 'project', projectId: auth.project.id, chatOpen: readProjectChatOpenState() });
      } else if (canViewFinance) {
        setWorkspace({ kind: 'finance', projectId: auth.project.id });
      }
      return;
    }

    if (workspace.kind === 'finance' && !canViewFinance) {
      if (canViewSchedule) {
        setWorkspace({ kind: 'project', projectId: auth.project.id, chatOpen: readProjectChatOpenState() });
      } else if (canViewResources) {
        setWorkspace({ kind: 'planner', projectId: auth.project.id });
      }
    }
  }, [auth.project, canViewFinance, canViewResources, canViewSchedule, hasShareToken, setWorkspace, workspace.kind]);

  useEffect(() => {
    if (workspace.kind === 'project') {
      setProjectState(workspace.projectId, { activeWorkspace: 'project' });
    } else if (workspace.kind === 'planner') {
      setProjectState(workspace.projectId, { activeWorkspace: 'planner' });
    } else if (workspace.kind === 'finance') {
      setProjectState(workspace.projectId, { activeWorkspace: 'finance' });
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
    if (workspace.kind === 'template' && activeTemplate) {
      await renameTemplate(activeTemplate.metadata.id, newName);
      return;
    }
    if (!auth.project) {
      throw new Error('Not authenticated');
    }
    if (isScheduleReadOnlyProject) {
      return;
    }
    await auth.updateProject(auth.project.id, { name: newName });
  }, [activeTemplate, auth, isScheduleReadOnlyProject, localTasks, renameTemplate, workspace.kind]);

  const handleGanttDayModeChange = useCallback(async (ganttDayMode: 'business' | 'calendar') => {
    if (!auth.project) {
      throw new Error('Not authenticated');
    }
    if (isScheduleReadOnlyProject) {
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
  }, [auth.project, batchUpdate, effectiveAuthGanttDayMode, isScheduleReadOnlyProject]);

  const handleCreateShareLink = useCallback(async () => {
    if (!auth.accessToken || !auth.project || isScheduleReadOnlyProject) {
      return;
    }
    useUIStore.getState().setShowShareManager(true);
  }, [auth.accessToken, auth.project, isScheduleReadOnlyProject]);

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
    setSelectedTemplateTaskIds(new Set());
    setTemplateSelectionMode(false);
  }, [auth.project?.id, hasShareToken]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || !auth.project?.id || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    const hasQueuedFirstPrompt = Boolean(queuedPromptRef.current);
    const isPreparedIntentProject = preparedIntentChatProjectId === auth.project.id
      || (activeGenerationJob?.projectId === auth.project.id && isActiveProjectGenerationJob(activeGenerationJob));
    if (!hasQueuedFirstPrompt && !isPreparedIntentProject) {
      useChatStore.getState().reset();
    } else {
      useChatStore.setState((state) => ({
        ...state,
        streamingText: '',
        error: null,
        aiThinking: isPreparedIntentProject ? true : state.aiThinking,
      }));
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
        const normalizedMessages = data.map((message) => ({
          id: message.id ?? crypto.randomUUID(),
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
          requestContextId: message.requestContextId ?? null,
          historyGroupId: message.historyGroupId ?? null,
        }));
        if (isPreparedIntentProject) {
          useChatStore.setState((state) => ({
            ...state,
            messages: normalizedMessages,
            streamingText: '',
            pendingAssistantMeta: null,
            aiThinking: true,
            error: null,
          }));
          return;
        }
        useChatStore.getState().replaceMessages(normalizedMessages);
      })
      .catch(() => {});
  }, [activeGenerationJob, auth.accessToken, auth.isAuthenticated, auth.project?.id, hasShareToken, preparedIntentChatProjectId, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || workspace.kind !== 'project') {
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
  }, [auth.isAuthenticated, submitChatMessage, workspace.kind]);

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
      : workspace.kind === 'template'
        ? `template:${workspace.templateId}`
        : null;
  const workspaceTasks = workspace.kind === 'template' ? templateTasks : tasks;

  const handleCollapseAll = useCallback(() => {
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

      const allParentIds = getAllParentIds(workspaceTasks);
      setProjectState(workspaceStateId, { collapsedParentIds: allParentIds });
    }
  }, [workspaceStateId, workspaceTasks, setProjectState]);

  const handleExpandAll = useCallback(() => {
    if (workspaceStateId) {
      setProjectState(workspaceStateId, { collapsedParentIds: [] });
    }
  }, [workspaceStateId, setProjectState]);

  const shareStatus = useUIStore((state) => state.shareStatus);
  const showShareManager = useUIStore((state) => state.showShareManager);
  const { updateAvailable, reloadApp } = useAppUpdateCheck();
  const handleStartPartialShareSelection = useCallback(() => {
    setTemplateSelectionMode(false);
    setSelectedTemplateTaskIds(new Set());
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
  const handleStartTemplateSelection = useCallback(() => {
    setShareSelectionMode(false);
    setSelectedShareTaskIds(new Set());
    setSelectedTemplateTaskIds(new Set());
    setTemplateSelectionMode(true);
  }, []);
  const handleTemplateSelectionChange = useCallback((nextSelectedTaskIds: Set<string>) => {
    setSelectedTemplateTaskIds((previousSelectedTaskIds) => {
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
  const handleCancelTemplateSelection = useCallback(() => {
    setSelectedTemplateTaskIds(new Set());
    setTemplateSelectionMode(false);
  }, []);
  const handleConfirmTemplateSelection = useCallback(() => {
    if (selectedTemplateTaskIds.size === 0) {
      return;
    }
    const selectedTasks = visibleTasks.filter((task) => selectedTemplateTaskIds.has(task.id));
    const initialName = selectedTasks.find((task) => !task.parentId || !selectedTemplateTaskIds.has(task.parentId))?.name ?? 'Новый шаблон';
    setSaveTemplateDraft({
      mode: 'selection',
      initialName,
      taskCount: selectedTasks.length,
      rootTaskIds: Array.from(selectedTemplateTaskIds),
    });
  }, [selectedTemplateTaskIds, visibleTasks]);
  const handleCreateTemplateFromTask = useCallback((task: Task) => {
    setShareSelectionMode(false);
    setSelectedShareTaskIds(new Set());
    setSelectedTemplateTaskIds(new Set(collectTaskSubtreeIds(visibleTasks, task.id)));
    setTemplateSelectionMode(true);
  }, [visibleTasks]);
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
          label: auth.project.name,
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
    && !activeProjectGenerationRunning
    && !generationJobLookupPending
    && !hasQueuedProjectPrompt
    && activeEmptyProjectModeProjectId !== workspace.projectId;
  const canReturnEmptyProjectToWizard = workspace.kind === 'project'
    && currentProjectIsEmpty
    && !aiMutationLock.active;
  const shouldRenderStartScreenProjectSettingsModal = showProjectStartScreen
    && showProjectSettingsModal
    && Boolean(auth.project)
    && !hasShareToken;

  useEffect(() => {
    if (workspace.kind !== 'project' || !currentProjectIsEmpty) {
      return;
    }

    const currentProjectState = getProjectState(workspace.projectId);
    if (currentProjectState?.taskListColumnsInitialized) {
      return;
    }

    setProjectState(workspace.projectId, {
      taskListColumnsInitialized: true,
      hiddenTaskListColumns: [...DEFAULT_NEW_PROJECT_HIDDEN_TASK_LIST_COLUMNS],
    });
  }, [currentProjectIsEmpty, getProjectState, setProjectState, workspace]);

  const currentProjectLabel = hasShareToken
    ? (sharedProject.project?.name || 'Shared project')
    : workspace.kind === 'template'
      ? (activeTemplate?.metadata.name || 'Шаблон')
    : auth.isAuthenticated
      ? auth.project?.name
      : (localTasks.projectName || 'Мой проект');
  const handleSaveStartScreenProjectSettings = useCallback(async (settings: {
    projectName: string;
    ganttDayMode: 'business' | 'calendar';
    timelineMarkers: TimelineMarker[];
  }) => {
    if (!auth.project || isScheduleReadOnlyProject) {
      return;
    }

    const projectNameChanged = settings.projectName.trim() !== (auth.project.name ?? '').trim();
    const markersChanged = JSON.stringify(settings.timelineMarkers) !== JSON.stringify(auth.project.timelineMarkers ?? []);
    const dayModeChanged = settings.ganttDayMode !== effectiveAuthGanttDayMode;

    if (!projectNameChanged && !markersChanged && !dayModeChanged) {
      setShowProjectSettingsModal(false);
      setStartScreenProjectSettingsError(null);
      return;
    }

    setStartScreenProjectSettingsPending(true);
    setStartScreenProjectSettingsError(null);
    try {
      if (projectNameChanged) {
        await handleSaveProjectName(settings.projectName.trim());
      }
      if (dayModeChanged) {
        await handleGanttDayModeChange(settings.ganttDayMode);
      }
      if (markersChanged) {
        await auth.updateProject(auth.project.id, { timelineMarkers: settings.timelineMarkers });
      }
      setShowProjectSettingsModal(false);
    } catch (error) {
      console.error('[App] Failed to save project settings from start screen:', error);
      setStartScreenProjectSettingsError('Не удалось сохранить настройки проекта. Попробуйте ещё раз.');
    } finally {
      setStartScreenProjectSettingsPending(false);
    }
  }, [auth, effectiveAuthGanttDayMode, handleGanttDayModeChange, handleSaveProjectName, isScheduleReadOnlyProject, setShowProjectSettingsModal]);
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

  const handleExportBackup = useCallback(async () => {
    const proactiveExportDenial = buildProactiveConstraintDenial('export', billingStatus);
    if (proactiveExportDenial) {
      await openLimitModal(proactiveExportDenial);
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    let response = await fetch('/api/export/backup', {
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
      response = await fetch('/api/export/backup', {
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
      throw new Error('HTTP 403');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const projectName = currentProjectLabel?.trim() || 'Мой проект';
    const fallbackFileName = `ГетГант - ${projectName} - backup.gantt.json`;
    const fileName = getAttachmentFileName(response.headers.get('Content-Disposition'), fallbackFileName);
    await triggerBlobDownload(blob, fileName);
  }, [auth, billingStatus, currentProjectLabel, onLoginRequired, openLimitModal]);

  const reloadAuthenticatedProjectSnapshot = useCallback(async () => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    let response = await fetch('/api/project', {
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
      response = await fetch('/api/project', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as ProjectLoadResponse;
    useProjectStore.getState().hydrateConfirmed(payload.version, {
      tasks: normalizeTasks(payload.snapshot.tasks),
      dependencies: payload.snapshot.dependencies,
    }, {
      resources: payload.snapshot.resources,
      assignments: payload.snapshot.assignments,
      progressEntries: payload.snapshot.progressEntries ?? [],
    });
  }, [auth, onLoginRequired]);

  const handleOpenBackupImport = useCallback(() => {
    backupImportInputRef.current?.click();
  }, []);

  const handleBackupImportChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (hasShareToken) {
      return;
    }

    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }

    if (isScheduleReadOnlyProject) {
      return;
    }
    setSelectedBackupFile(file);
    setBackupRestoreError(null);
    setBackupRestoreSummary(null);
  }, [auth.isAuthenticated, hasShareToken, isScheduleReadOnlyProject, onLoginRequired]);

  const handleCloseBackupRestoreModal = useCallback(() => {
    if (backupRestorePending) {
      return;
    }
    setSelectedBackupFile(null);
    setBackupRestoreError(null);
    setBackupRestoreSummary(null);
  }, [backupRestorePending]);

  const handleConfirmBackupRestore = useCallback(async () => {
    if (!selectedBackupFile) {
      return;
    }

    let backup: unknown;
    try {
      backup = JSON.parse(await selectedBackupFile.text());
    } catch {
      setBackupRestoreError('Файл backup не является корректным JSON.');
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setBackupRestorePending(true);
    setBackupRestoreError(null);
    try {
      let response = await fetch('/api/import/backup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backup }),
      });

      if (response.status === 401) {
        const refreshedToken = await auth.refreshAccessToken();
        if (!refreshedToken) {
          onLoginRequired();
          return;
        }
        token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
        response = await fetch('/api/import/backup', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ backup }),
        });
      }

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // ignore invalid error body
        }
        setBackupRestoreError(`Не удалось восстановить backup: ${message}`);
        return;
      }

      const payload = await response.json() as BackupImportResponse;
      useProjectStore.getState().clearTransientState();
      await refreshProjects();
      await reloadAuthenticatedProjectSnapshot();
      setBackupRestoreSummary(payload.summary);
    } finally {
      setBackupRestorePending(false);
    }
  }, [auth, onLoginRequired, refreshProjects, reloadAuthenticatedProjectSnapshot, selectedBackupFile]);

  const handleDownloadImportTemplate = useCallback(async () => {
    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      onLoginRequired();
      return;
    }

    setIsImportTemplateLoading(true);
    try {
      let response = await fetch('/api/import/excel/template', {
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
        response = await fetch('/api/import/excel/template', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = getAttachmentFileName(
        response.headers.get('Content-Disposition'),
        'Шаблон импорта задач - GetGantt.xlsx',
      );
      await triggerBlobDownload(blob, fileName);
    } finally {
      setIsImportTemplateLoading(false);
    }
  }, [auth, onLoginRequired]);

  const handleImportExcelCompleted = useCallback(async () => {
    await reloadAuthenticatedProjectSnapshot();
  }, [reloadAuthenticatedProjectSnapshot]);

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
    : workspace.kind === 'finance'
      ? (
        <FinanceWorkspace
          accessToken={auth.accessToken}
          projectId={workspace.projectId}
          readOnly={isArchivedProject || !canEditFinance}
          onBackToProject={() => {
            setWorkspace({ kind: 'project', projectId: workspace.projectId, chatOpen: readProjectChatOpenState() });
          }}
        />
      )
    : workspace.kind === 'planner'
      ? (
        <ResourcePlannerWorkspace
          accessToken={auth.accessToken}
          projectId={workspace.projectId}
          ganttDayMode={effectiveAuthGanttDayMode}
          calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
          readonly={isArchivedProject || !canEditResources}
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
      : workspace.kind === 'template'
        ? (
          <TemplateWorkspace
            ganttRef={ganttRef}
            template={activeTemplate}
            tasks={templateTasks}
            setTasks={setTemplateTasks}
            loading={loadingTemplate}
            accessToken={auth.accessToken}
            batchUpdate={templateBatchUpdate}
            onScrollToToday={handleScrollToToday}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            onValidation={handleValidation}
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
              onImport={() => setShowImportExcelModal(true)}
              onLoginRequired={onLoginRequired}
            />
          )
        : workspace.kind === 'project'
          ? (
            <ProjectWorkspace
              ganttRef={ganttRef}
              projectName={currentProjectLabel}
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
              chatDisabled={isScheduleReadOnlyProject || Boolean(proactiveChatDenial)}
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
              onExportBackup={handleExportBackup}
              onImportExcel={() => setShowImportExcelModal(true)}
              onImportBackup={handleOpenBackupImport}
              onReturnToWizard={canReturnEmptyProjectToWizard ? () => setActiveEmptyProjectModeProjectId(null) : undefined}
              onInsertTemplateToProject={handleOpenInsertTemplateIntoCurrentProject}
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
              templateSelectionMode={templateSelectionMode}
              selectedTemplateTaskIds={selectedTemplateTaskIds}
              onSelectedTemplateTaskIdsChange={handleTemplateSelectionChange}
              onCancelTemplateSelection={handleCancelTemplateSelection}
              onConfirmTemplateSelection={handleConfirmTemplateSelection}
              ganttDayMode={effectiveAuthGanttDayMode}
              displayGanttDayMode={effectiveAuthGanttDayMode}
              calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
              timelineMarkers={auth.project?.timelineMarkers ?? []}
              readOnly={isScheduleReadOnlyProject}
              previewState={previewState.active ? previewState.mode : 'idle'}
              previewMessage={previewState.active ? previewState.message : null}
              onGanttDayModeChange={(ganttDayMode) => {
                void handleGanttDayModeChange(ganttDayMode).catch((error) => {
                  console.error('Failed to update gantt day mode:', error);
                });
              }}
              onTimelineMarkersChange={auth.project
                ? async (timelineMarkers) => {
                    const currentProject = auth.project;
                    if (!currentProject) {
                      return;
                    }
                    await auth.updateProject(currentProject.id, { timelineMarkers });
                  }
                : undefined}
              onProjectNameChange={handleSaveProjectName}
              onCreateTemplateFromTask={handleCreateTemplateFromTask}
              onInsertTemplateAtTask={handleInsertTemplateAtTask}
              onCreateTemplateFromProject={handleCreateCurrentProjectTemplate}
              onStartTemplateSelection={handleStartTemplateSelection}
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
    {showImportExcelModal && workspace.kind === 'project' && auth.isAuthenticated && !hasShareToken && (
      <ImportExcelModal
        accessToken={auth.accessToken}
        refreshAccessToken={auth.refreshAccessToken}
        onClose={() => setShowImportExcelModal(false)}
        onDownloadTemplate={handleDownloadImportTemplate}
        onImported={handleImportExcelCompleted}
        onLoginRequired={onLoginRequired}
        isDownloadTemplateLoading={isImportTemplateLoading}
      />
    )}
    {shouldRenderStartScreenProjectSettingsModal && auth.project && (
      <ProjectSettingsModal
        projectName={auth.project.name ?? 'Мой проект'}
        ganttDayMode={effectiveAuthGanttDayMode}
        timelineMarkers={auth.project.timelineMarkers ?? []}
        pending={startScreenProjectSettingsPending}
        error={startScreenProjectSettingsError}
        canEditProjectName={!isScheduleReadOnlyProject}
        canShiftProject={false}
        canEditGanttDayMode={!isScheduleReadOnlyProject}
        canEditTimelineMarkers={!isScheduleReadOnlyProject}
        onClose={() => {
          if (!startScreenProjectSettingsPending) {
            setShowProjectSettingsModal(false);
            setStartScreenProjectSettingsError(null);
          }
        }}
        onOpenProjectShift={() => {}}
        onSave={(settings) => {
          void handleSaveStartScreenProjectSettings(settings);
        }}
      />
    )}
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
      isReadOnlyProject={isScheduleReadOnlyProject}
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
      onSwitchTemplate={handleSwitchTemplate}
      onRenameTemplate={renameTemplate}
      onDeleteTemplate={handleDeleteTemplate}
      onInsertTemplateToProject={handleInsertTemplateIntoCurrentProject}
      onOpenInsertTemplateToProject={handleOpenInsertTemplateIntoCurrentProject}
      canInsertTemplateToProject={workspace.kind === 'project' && !isScheduleReadOnlyProject && visibleTasks.length > 0}
      onCreateProjectGroup={handleCreateProjectGroup}
      onRenameProjectGroup={handleRenameProjectGroup}
      onDeleteProjectGroup={handleDeleteProjectGroup}
      canViewChartMode={canViewSchedule}
      canViewResourcePool={canViewResources}
      canViewFinance={canViewFinance}
      onOpenResourcePool={handleOpenResourcePool}
      onOpenFinance={handleOpenFinance}
      onOpenChartMode={async () => {
        const targetProjectId = workspace.kind === 'planner' || workspace.kind === 'finance'
          ? workspace.projectId
          : auth.project?.id;
        if (!targetProjectId) {
          return;
        }
        setPlannerCorrectionTarget(null);
        setWorkspace({ kind: 'project', projectId: targetProjectId, chatOpen: readProjectChatOpenState() });
      }}
      onCreateProjectTemplate={handleCreateCurrentProjectTemplate}
      adminTemplateLinks={[
        { id: 'admin-template-cms', label: 'CMS шаблонов', href: '/admin?section=templates' },
      ]}
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

    <input
      ref={backupImportInputRef}
      type="file"
      accept="application/json,.json,.gantt.json"
      className="hidden"
      onChange={(event) => {
        void handleBackupImportChange(event);
      }}
    />

    {selectedBackupFile && (
      <BackupRestoreModal
        fileName={selectedBackupFile.name}
        loading={backupRestorePending}
        error={backupRestoreError}
        summary={backupRestoreSummary}
        onConfirm={handleConfirmBackupRestore}
        onClose={handleCloseBackupRestoreModal}
      />
    )}

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
        initialName={pendingProjectCreation?.initialProjectName}
        title={pendingProjectCreation?.templatePublicationId ? pendingProjectCreation.title : undefined}
        description={pendingProjectCreation?.templatePublicationId ? pendingProjectCreation.description : undefined}
        submitLabel={pendingProjectCreation?.templatePublicationId ? 'Создать проект' : undefined}
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

    {saveTemplateDraft && (
      <SaveTemplateModal
        initialName={saveTemplateDraft.initialName}
        taskCount={saveTemplateDraft.taskCount}
        mode={saveTemplateDraft.mode}
        loading={saveTemplatePending}
        onSave={handleSaveTemplateFromModal}
        onClose={() => {
          if (!saveTemplatePending) {
            if (saveTemplateDraft.mode === 'selection') {
              setSelectedTemplateTaskIds(new Set());
              setTemplateSelectionMode(false);
            }
            setSaveTemplateDraft(null);
          }
        }}
      />
    )}

    {insertTemplateDraft && (
      <InsertTemplateModal
        templates={templates}
        anchorTaskName={insertTemplateDraft.anchorTaskName}
        loading={insertTemplatePending}
        onInsert={handleInsertTemplateFromModal}
        onClose={() => {
          if (!insertTemplatePending) {
            setInsertTemplateDraft(null);
          }
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
