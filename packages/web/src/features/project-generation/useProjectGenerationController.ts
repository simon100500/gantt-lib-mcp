import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { SplitTaskSubmitPayload } from '../../components/SplitTaskModal.tsx';
import { buildSplitTaskTrace } from '../../components/SplitTaskModal.tsx';
import { useWebSocket, type ServerMessage } from '../../hooks/useWebSocket.ts';
import type { ConstraintDenialPayload } from '../../lib/constraintUi.ts';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import type { WorkspaceMode } from '../../stores/useUIStore.ts';
import { readProjectChatOpenState, useUIStore } from '../../stores/useUIStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import { normalizeTasks, type Task } from '../../types.ts';
import {
  buildDependencyRowsFromTasks,
  isActiveProjectGenerationJob,
  mergeOptimisticChatMessages,
  type PreviewState,
  type ProjectGenerationJobView,
  resolveGenerationLockMessage,
  summarizeTasksForLog,
  type StoredGenerationPreview,
} from './model.ts';
import { getGenerationJobStorageKey, getGenerationPreviewStorageKey } from './storage.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';
const AI_DONE_GRACE_PERIOD_MS = 10000;
const AI_MUTATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function isConstraintCode(code: string | undefined): code is ConstraintDenialPayload['code'] {
  return code === 'PROJECT_LIMIT_REACHED' || code === 'RESTORE_PROJECT_LIMIT_REACHED' || code === 'AI_LIMIT_REACHED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'ARCHIVE_FEATURE_LOCKED' || code === 'EXPORT_FEATURE_LOCKED';
}

function readStoredGenerationJob(projectId: string): ProjectGenerationJobView | null {
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
  if (!job || !isActiveProjectGenerationJob(job)) {
    window.sessionStorage.removeItem(getGenerationJobStorageKey(projectId));
    return;
  }

  window.sessionStorage.setItem(getGenerationJobStorageKey(projectId), JSON.stringify(job));
}

function readStoredGenerationPreview(projectId: string): StoredGenerationPreview | null {
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
  if (!preview) {
    window.sessionStorage.removeItem(getGenerationPreviewStorageKey(projectId));
    return;
  }

  window.sessionStorage.setItem(getGenerationPreviewStorageKey(projectId), JSON.stringify(preview));
}

type AuthLike = {
  accessToken: string | null;
  isAuthenticated: boolean;
  refreshAccessToken: () => Promise<string | null>;
};

export function useProjectGenerationController(params: {
  auth: AuthLike;
  workspace: WorkspaceMode;
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  hasShareToken: boolean;
  isScheduleReadOnlyProject: boolean;
  proactiveChatDenial: Partial<ConstraintDenialPayload> | null | undefined;
  selectedWorkspaceProjectTaskCount: number | undefined;
  onLoginRequired: () => void;
  openLimitModal: (denial: Partial<ConstraintDenialPayload> | null | undefined) => Promise<void>;
  setWorkspace: (workspace: WorkspaceMode | ((current: WorkspaceMode) => WorkspaceMode)) => void;
}) {
  const {
    auth,
    workspace,
    tasks,
    setTasks,
    hasShareToken,
    isScheduleReadOnlyProject,
    proactiveChatDenial,
    selectedWorkspaceProjectTaskCount,
    onLoginRequired,
    openLimitModal,
    setWorkspace,
  } = params;

  // Active generation lifecycle, queueing, and empty-project state.
  const [preparedIntentChatProjectId, setPreparedIntentChatProjectId] = useState<string | null>(null);
  const [activeGenerationJob, setActiveGenerationJob] = useState<ProjectGenerationJobView | null>(null);
  const [generationJobLookupPending, setGenerationJobLookupPending] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
  const [pendingGanttDayMode, setPendingGanttDayMode] = useState<'business' | 'calendar' | null>(null);
  const [activeEmptyProjectModeProjectId, setActiveEmptyProjectModeProjectId] = useState<string | null>(null);
  const queuedPromptRef = useRef<string | null>(null);
  const createEmptyChartAfterActivationRef = useRef(false);
  const preserveStartScreenPrefillOnNextSessionRef = useRef(false);
  const forceProjectWorkspaceOnNextSessionRef = useRef<string | null>(null);
  const aiDoneGraceTimerRef = useRef<number | null>(null);
  const aiMutationWatchdogRef = useRef<number | null>(null);
  const lastGenerationFailureJobIdRef = useRef<string | null>(null);
  const activeWorkspaceProjectId = workspace.kind === 'project' ? workspace.projectId : null;
  const activeProjectGenerationRunning = Boolean(
    activeGenerationJob
    && isActiveProjectGenerationJob(activeGenerationJob)
    && activeGenerationJob.projectId === activeWorkspaceProjectId,
  );

  const setAiMutationLock = useUIStore((state) => state.setAiMutationLock);
  const clearAiMutationLock = useUIStore((state) => state.clearAiMutationLock);
  const bumpHistoryRefreshRevision = useUIStore((state) => state.bumpHistoryRefreshRevision);

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
    if (!activeWorkspaceProjectId || !activeGenerationJob || activeGenerationJob.projectId !== activeWorkspaceProjectId) {
      return;
    }

    writeStoredGenerationJob(activeWorkspaceProjectId, activeGenerationJob);

    if (activeGenerationJob.status === 'queued' || activeGenerationJob.status === 'running') {
      clearAiDoneGraceTimer();
      setAiMutationLock({
        active: true,
        stage: activeGenerationJob.previewAvailable ? 'preview' : 'thinking',
        message: resolveGenerationLockMessage(activeGenerationJob, 'Ручное редактирование пока недоступно'),
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
  }, [activeGenerationJob, activeWorkspaceProjectId, clearAiDoneGraceTimer, releaseAiMutationLock, setAiMutationLock]);

  useEffect(() => {
    if (!activeWorkspaceProjectId || generationJobLookupPending || activeProjectGenerationRunning || previewState.active) {
      return;
    }

    const storedJob = readStoredGenerationJob(activeWorkspaceProjectId);
    const lockActive = useUIStore.getState().aiMutationLock.active;
    if (!storedJob && !lockActive) {
      return;
    }

    writeStoredGenerationJob(activeWorkspaceProjectId, null);
    writeStoredGenerationPreview(activeWorkspaceProjectId, null);
    releaseAiMutationLock();
    setPreparedIntentChatProjectId(null);
  }, [activeProjectGenerationRunning, activeWorkspaceProjectId, generationJobLookupPending, previewState.active, releaseAiMutationLock]);

  const handleWsMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'preview_tasks' || msg.type === 'preview_tasks_replace') {
      const normalizedPreviewTasks = normalizeTasks(msg.tasks as Task[]);
      armAiMutationWatchdog();
      setAiMutationLock({ active: true, stage: 'preview', message: 'Ручное редактирование пока недоступно' });
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
      setAiMutationLock({ active: true, stage: 'failed', message: msg.message ?? 'Предварительный график не был сохранён.' });
      setPreparedIntentChatProjectId(null);
      setPreviewState((current) => current.active ? { ...current, mode: 'failed', message: msg.message ?? 'Предварительный график не был сохранён.' } : current);
      if (workspace.kind === 'project') {
        const storedPreview = readStoredGenerationPreview(workspace.projectId);
        if (storedPreview) {
          writeStoredGenerationPreview(workspace.projectId, { ...storedPreview, mode: 'failed', message: msg.message ?? 'Предварительный график не был сохранён.' });
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
      releaseAiMutationLock();
      scheduleAiDoneGraceExit();
      if (workspace.kind === 'project') {
        writeStoredGenerationPreview(workspace.projectId, null);
        writeStoredGenerationJob(workspace.projectId, null);
      }
      setPreviewState({ tasks: [], active: false, mode: 'rendering', message: null, wave: 0 });
      useTaskStore.getState().replaceFromSystem(normalizedTasks);

      if (!hasShareToken && auth.isAuthenticated) {
        useProjectStore.getState().mergeConfirmedSnapshot({
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
          writeStoredGenerationPreview(workspace.projectId, { ...storedPreview, mode: 'failed', message: msg.message ?? 'unknown error' });
        }
      }
      setPreviewState((current) => current.active ? { ...current, mode: 'failed', message: msg.message ?? 'unknown error' } : current);
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

  const { connected } = useWebSocket(
    handleWsMessage,
    () => (hasShareToken ? null : auth.accessToken),
    hasShareToken ? null : auth.accessToken,
    hasShareToken ? undefined : auth.refreshAccessToken,
  );

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
          pollTimer = window.setInterval(() => { void loadLatestGenerationJob(); }, 2000);
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

      setActiveGenerationJob(latestPayload.job ?? null);
      setGenerationJobLookupPending(false);
    };

    void loadLatestGenerationJob();
    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [auth.accessToken, auth.isAuthenticated, auth.refreshAccessToken, hasShareToken, workspace]);

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
    setAiMutationLock({ active: true, stage: 'thinking', message: 'AI готовит изменения графика. Редактирование временно заблокировано.' });

    let response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      } catch {}
      releaseAiMutationLock();
      throw new Error('HTTP 403');
    }

    if (!response.ok) {
      releaseAiMutationLock();
      throw new Error(`HTTP ${response.status}`);
    }

    const responsePayload = await response.json() as { job?: ProjectGenerationJobView | null };
    if (responsePayload.job) {
      setActiveGenerationJob(responsePayload.job);
    }
    return true;
  }, [armAiMutationWatchdog, auth, isScheduleReadOnlyProject, openLimitModal, proactiveChatDenial, releaseAiMutationLock, setAiMutationLock]);

  const submitSplitTask = useCallback(async (task: Task, payload: SplitTaskSubmitPayload) => {
    if (hasShareToken) {
      return { accepted: false as const };
    }
    if (isScheduleReadOnlyProject) {
      return { accepted: false as const, message: 'Проект доступен только для чтения.' };
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return { accepted: false as const };
    }
    if (proactiveChatDenial) {
      await openLimitModal(proactiveChatDenial);
      return { accepted: false as const };
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      return { accepted: false as const, message: 'Нет access token для AI-запроса.' };
    }

    useChatStore.getState().addMessage({ role: 'user', content: buildSplitTaskTrace(task, payload) });
    if (workspace.kind === 'project') {
      if (selectedWorkspaceProjectTaskCount === 0) {
        setActiveEmptyProjectModeProjectId(workspace.projectId);
      }
      setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
    }
    armAiMutationWatchdog();
    setAiMutationLock({ active: true, stage: 'thinking', message: 'AI обрабатывает задачу. Редактирование графика временно заблокировано.' });

    let response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        releaseAiMutationLock();
        return { accepted: false as const, message: 'Сессия истекла. Войдите заново.' };
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    }

    if (response.status === 403) {
      try {
        const body = await response.json() as Partial<ConstraintDenialPayload>;
        if (isConstraintCode(body.code)) {
          releaseAiMutationLock();
          await openLimitModal(body);
          return { accepted: false as const };
        }
      } catch {}
      releaseAiMutationLock();
      return { accepted: false as const, message: 'Доступ к AI-функции ограничен.' };
    }

    if (!response.ok) {
      releaseAiMutationLock();
      return { accepted: false as const, message: `HTTP ${response.status}` };
    }

    const responsePayload = await response.json() as { job?: ProjectGenerationJobView | null };
    if (responsePayload.job) {
      setActiveGenerationJob(responsePayload.job);
    }
    return { accepted: true as const };
  }, [armAiMutationWatchdog, auth, hasShareToken, isScheduleReadOnlyProject, onLoginRequired, openLimitModal, proactiveChatDenial, releaseAiMutationLock, selectedWorkspaceProjectTaskCount, setAiMutationLock, setWorkspace, workspace]);

  const handleCancelActiveGeneration = useCallback(async () => {
    const activeJob = activeGenerationJob;
    if (!activeJob || !isActiveProjectGenerationJob(activeJob)) {
      return;
    }

    const getLatestAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
    let token = getLatestAccessToken();
    if (!token) {
      return;
    }

    let response = await fetch(`/api/project-generation-jobs/${encodeURIComponent(activeJob.id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      const refreshedToken = await auth.refreshAccessToken();
      if (!refreshedToken) {
        return;
      }
      token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
      response = await fetch(`/api/project-generation-jobs/${encodeURIComponent(activeJob.id)}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!response.ok) {
      useChatStore.getState().setError(`Не удалось остановить AI-задачу (HTTP ${response.status}).`);
      return;
    }

    const payload = await response.json() as { job?: ProjectGenerationJobView | null };
    if (payload.job) {
      setActiveGenerationJob(payload.job);
    }
    if (workspace.kind === 'project' && tasks.length === 0) {
      setActiveEmptyProjectModeProjectId(null);
      setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: false } : current);
    }
    useChatStore.getState().finishStreaming();
  }, [activeGenerationJob, auth.accessToken, auth.refreshAccessToken, setWorkspace, tasks.length, workspace]);

  const handleSend = useCallback((text: string) => {
    const activeProjectId = workspace.kind === 'project' ? workspace.projectId : null;
    if (hasShareToken) {
      return { accepted: false as const };
    }
    if (isScheduleReadOnlyProject) {
      return { accepted: false as const, message: 'Проект доступен только для чтения.' };
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return { accepted: false as const };
    }
    if (proactiveChatDenial) {
      void openLimitModal(proactiveChatDenial);
      return { accepted: false as const };
    }
    if (workspace.kind !== 'project') {
      return { accepted: false as const };
    }
    if (activeProjectId && (selectedWorkspaceProjectTaskCount ?? tasks.length) === 0) {
      setActiveEmptyProjectModeProjectId(activeProjectId);
    }
    useChatStore.getState().addMessage({ role: 'user', content: text });
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
    void submitChatMessage(text).catch((submitError) => {
      useChatStore.getState().setError(String(submitError));
    });
    return { accepted: true as const };
  }, [auth.isAuthenticated, hasShareToken, isScheduleReadOnlyProject, onLoginRequired, openLimitModal, proactiveChatDenial, selectedWorkspaceProjectTaskCount, setWorkspace, submitChatMessage, tasks.length, workspace]);

  const closeProjectChat = useCallback(() => {
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: false } : current);
  }, [setWorkspace]);

  const openProjectChat = useCallback(() => {
    if (workspace.kind === 'project' && selectedWorkspaceProjectTaskCount === 0) {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: true } : current);
  }, [selectedWorkspaceProjectTaskCount, setWorkspace, workspace]);

  const toggleProjectChat = useCallback(() => {
    if (workspace.kind === 'project' && selectedWorkspaceProjectTaskCount === 0 && !workspace.chatOpen) {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
    setWorkspace((current) => current.kind === 'project' ? { ...current, chatOpen: !current.chatOpen } : current);
  }, [selectedWorkspaceProjectTaskCount, setWorkspace, workspace]);

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

  return {
    connected,
    previewState,
    pendingGanttDayMode,
    activeGenerationJob,
    generationJobLookupPending,
    activeEmptyProjectModeProjectId,
    activeProjectGenerationRunning,
    preparedIntentChatProjectId,
    queuedPromptRef,
    createEmptyChartAfterActivationRef,
    preserveStartScreenPrefillOnNextSessionRef,
    forceProjectWorkspaceOnNextSessionRef,
    setPreparedIntentChatProjectId,
    setPendingGanttDayMode,
    setActiveGenerationJob,
    setActiveEmptyProjectModeProjectId,
    setPreviewState,
    clearAiDoneGraceTimer,
    releaseAiMutationLock,
    handleSend,
    submitChatMessage,
    submitSplitTask,
    handleCancelActiveGeneration,
    closeProjectChat,
    openProjectChat,
    toggleProjectChat,
    resetWorkspacePresentation,
    readStoredGenerationJob,
    readStoredGenerationPreview,
    writeStoredGenerationJob,
    writeStoredGenerationPreview,
    mergeOptimisticChatMessages,
  };
}
