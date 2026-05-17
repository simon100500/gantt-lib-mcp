import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder } from 'lucide-react';

import { DeleteProjectModal } from '../../components/DeleteProjectModal.tsx';
import { CreateProjectModal } from '../../components/CreateProjectModal.tsx';
import { LimitReachedModal } from '../../components/LimitReachedModal.tsx';
import { PdfHelperModal, isPdfHelperDismissed } from '../../components/PdfHelperModal.tsx';
import { SaveTemplateModal } from '../../components/SaveTemplateModal.tsx';
import { ShareLinksManagerModal } from '../../components/ShareLinksManagerModal.tsx';
import { BackupRestoreModal } from '../../components/BackupRestoreModal.tsx';
import { InsertTemplateModal } from '../../components/InsertTemplateModal.tsx';
import { ImportExcelModal } from '../../components/ImportExcelModal.tsx';
import { ProjectSettingsModal } from '../../components/ProjectSettingsModal.tsx';
import type { GanttChartRef } from '../../components/GanttChart.tsx';
import { ProjectMenu } from '../../components/layout/ProjectMenu.tsx';
import { DraftWorkspace } from '../../components/workspace/DraftWorkspace.tsx';
import { GuestWorkspace } from '../../components/workspace/GuestWorkspace.tsx';
import { ProjectFactWorkspace } from '../../components/workspace/ProjectFactWorkspace.tsx';
import { GroupGanttWorkspace } from '../../components/workspace/GroupGanttWorkspace.tsx';
import { ProjectWorkspace } from '../../components/workspace/ProjectWorkspace.tsx';
import { FinanceWorkspace } from '../../components/workspace/FinanceWorkspace.tsx';
import { ResourcePlannerWorkspace } from '../../components/workspace/ResourcePlannerWorkspace.tsx';
import { SharedWorkspace } from '../../components/workspace/SharedWorkspace.tsx';
import { TemplateWorkspace } from '../../components/workspace/TemplateWorkspace.tsx';
import type { UseAuthResult } from '../../hooks/useAuth.ts';
import { useBatchTaskUpdate } from '../../hooks/useBatchTaskUpdate.ts';
import { useAppUpdateCheck } from '../../hooks/useAppUpdateCheck.ts';
import { useLocalTasks } from '../../hooks/useLocalTasks.ts';
import { useSharedProject } from '../../hooks/useSharedProject.ts';
import { useTasks } from '../../hooks/useTasks.ts';
import { useTemplateBatchUpdate } from '../../hooks/useTemplateBatchUpdate.ts';
import { useTemplates } from '../../hooks/useTemplates.ts';
import { PLAN_LABELS, type PlanId } from '../../lib/billing.ts';
import { normalizeConstraintDenialPayload, type ConstraintDenialPayload } from '../../lib/constraintUi.ts';
import { TASK_LIST_COLUMN_ROWS } from '../../lib/taskListColumns.ts';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useBillingStore } from '../../stores/useBillingStore.ts';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useTemplateStore } from '../../stores/useTemplateStore.ts';
import { readProjectChatOpenState, useUIStore } from '../../stores/useUIStore.ts';
import { useProjectUIStore } from '../../stores/useProjectUIStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { normalizeTasks, type ProjectSectionPermissions, type Task, type TimelineMarker, type ValidationResult } from '../../types.ts';
import {
  buildLocalArchiveLimitDenial,
  buildLocalFreeProjectLimitDenial,
  buildProactiveConstraintDenial,
  buildResourceCreationLimitDenial,
  type BillingConstraintStatus,
} from '../billing/policy.ts';
import { useProjectLifecycleController } from '../project-lifecycle/controller.ts';
import { FREE_ARCHIVED_PROJECT_LIMIT, mergeProjectsForLimitEvaluation } from '../project-lifecycle/model.ts';
import { isActiveProjectGenerationJob } from '../project-generation/model.ts';
import { useProjectGenerationController } from '../project-generation/useProjectGenerationController.ts';
import { useShareTemplateSelectionController } from '../share/useShareTemplateSelectionController.ts';
import { useExportImportController } from '../export-import/useExportImportController.ts';
import { DEFAULT_CALENDAR_WEEKLY_PATTERN } from '../../lib/projectScheduleOptions.ts';

const EMPTY_CALENDAR_DAYS: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }> = [];

function getAccessTokenProjectId(accessToken: string | null): string | null {
  if (!accessToken) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as { projectId?: unknown };
    return typeof payload.projectId === 'string' && payload.projectId.trim() ? payload.projectId : null;
  } catch {
    return null;
  }
}


function formatPdfFileTimestamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}-${minutes}`;
}

function getProjectPermissions(permissions: ProjectSectionPermissions | undefined): ProjectSectionPermissions {
  return permissions ?? { schedule: 'edit', resources: 'edit', finance: 'edit' };
}

type WorkspaceToast = {
  id: number;
  message: string;
};

type NormalizedChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requestContextId: string | null;
  historyGroupId: string | null;
};

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

export function WorkspaceShell({
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
  // Workspace-level state, store wiring, and modal drafts.
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
  const projectStates = useProjectUIStore((state) => state.projectStates);
  const activeTemplate = useTemplateStore((state) => state.activeTemplate);
  const setActiveTemplate = useTemplateStore((state) => state.setActiveTemplate);
  const updateActiveTemplateTasks = useTemplateStore((state) => state.updateActiveTemplateTasks);
  const [toasts, setToasts] = useState<WorkspaceToast[]>([]);
  const hasShareToken = Boolean(sharedProject.shareToken);
  const [startScreenProjectSettingsPending, setStartScreenProjectSettingsPending] = useState(false);
  const [startScreenProjectSettingsError, setStartScreenProjectSettingsError] = useState<string | null>(null);
  const toastIdRef = useRef(0);
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
  const isProjectGroupsLockedOnCurrentPlan = billingStatus != null
    && billingStatus.plan === 'free'
    && billingStatus.billingState !== 'trial_active';
  const projectGroupsLockedDenial: Partial<ConstraintDenialPayload> | null = isProjectGroupsLockedOnCurrentPlan
    ? {
        code: 'PROJECT_GROUPS_FEATURE_LOCKED',
        limitKey: null,
        reasonCode: 'feature_disabled',
        remaining: null,
        plan: ((billingStatus?.plan as PlanId | undefined) ?? 'free'),
        planLabel: billingStatus?.planMeta.label ?? PLAN_LABELS[((billingStatus?.plan as PlanId | undefined) ?? 'free')],
        upgradeHint: 'Расширьте тариф, чтобы создавать портфели проектов.',
      }
    : null;
  const projectsForLimitEvaluation = mergeProjectsForLimitEvaluation(auth.projects, auth.project ?? null);
  const activeProjectToReplace = projectsForLimitEvaluation.find((project) => project.status === 'active') ?? null;
  const activeProjectsCount = projectsForLimitEvaluation.filter((project) => project.status === 'active').length;
  const archivedProjectsCount = projectsForLimitEvaluation.filter((project) => project.status === 'archived').length;
  const isFreePlanProjectReplacementMode = billingStatus?.plan === 'free';
  const canSilentlyReplaceOnFree = isFreePlanProjectReplacementMode
    && Boolean(activeProjectToReplace)
    && archivedProjectsCount < FREE_ARCHIVED_PROJECT_LIMIT;
  const localProjectLimitDenial = buildLocalFreeProjectLimitDenial({
    billingStatus,
    activeProjectCount: activeProjectsCount,
    archivedProjectsCount,
    archivedProjectLimit: FREE_ARCHIVED_PROJECT_LIMIT,
  });
  const localArchiveLimitDenial = buildLocalArchiveLimitDenial({
    billingStatus,
    archivedProjectsCount,
    archivedProjectLimit: FREE_ARCHIVED_PROJECT_LIMIT,
  });
  const effectiveProjectDenial = isFreePlanProjectReplacementMode
    ? localProjectLimitDenial
    : proactiveProjectDenial;
  const effectiveArchiveDenial = localArchiveLimitDenial ?? proactiveArchiveDenial;
  const projectPermissions = getProjectPermissions(auth.project?.permissions);
  const canViewSchedule = hasShareToken || projectPermissions.schedule !== 'none';
  const canEditSchedule = hasShareToken ? false : projectPermissions.schedule === 'edit';
  const canViewResources = hasShareToken || projectPermissions.resources !== 'none';
  const canEditResources = hasShareToken ? false : projectPermissions.resources === 'edit';
  const canViewFinance = hasShareToken || projectPermissions.finance !== 'none';
  const canEditFinance = hasShareToken ? false : projectPermissions.finance === 'edit';
  const displayModeProjectId = workspace.kind === 'project'
    ? workspace.projectId
    : auth.project?.id ?? null;
  const activeProjectDisplayMode = displayModeProjectId
    ? projectStates[displayModeProjectId]?.projectDisplayMode ?? 'gantt'
    : 'gantt';
  const isFactModeActive = workspace.kind === 'project' && activeProjectDisplayMode === 'fact';
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

    const currentBillingStatus = useBillingStore.getState().usage ?? useBillingStore.getState().subscription ?? billingStatus;
    const shouldDeferProjectLimitModal = denial.code === 'PROJECT_LIMIT_REACHED' && !currentBillingStatus;
    const immediateDenial = shouldDeferProjectLimitModal
      ? null
      : normalizeConstraintDenialPayload(denial, currentBillingStatus);
    if (immediateDenial) {
      setLimitModal({
        denial: immediateDenial,
        usage: currentBillingStatus,
      });
    }

    let nextBillingStatus = currentBillingStatus;
    if (auth.isAuthenticated && !hasShareToken) {
      try {
        await Promise.all([fetchSubscription(), fetchUsage()]);
        nextBillingStatus = useBillingStore.getState().usage ?? useBillingStore.getState().subscription ?? currentBillingStatus;
      } catch {
        nextBillingStatus = currentBillingStatus;
      }
    }

    const normalizedDenial = normalizeConstraintDenialPayload(denial, nextBillingStatus);
    if (!normalizedDenial) {
      return;
    }

    setLimitModal({
      denial: normalizedDenial,
      usage: nextBillingStatus,
    });
  }, [auth.isAuthenticated, billingStatus, fetchSubscription, fetchUsage, hasShareToken]);

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
    auth.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN,
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
    calendarWeeklyPattern: hasShareToken
      ? (sharedProject.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN)
      : (auth.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN),
    calendarDays: hasShareToken
      ? (sharedProject.project?.calendarDays ?? EMPTY_CALENDAR_DAYS)
      : (auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS),
  });
  const replaceTasksFromSystem = useCallback((nextTasks: Task[]) => {
    setTasks(nextTasks);
  }, [setTasks]);
  const templateBatchUpdate = useTemplateBatchUpdate({
    tasks: templateTasks,
    setTasks: setTemplateTasks,
    saveTemplateSnapshot,
  });
  const ganttRef = useRef<GanttChartRef>(null);
  const syncProjectTaskCount = auth.syncProjectTaskCount;
  const sessionProjectId = getAccessTokenProjectId(auth.accessToken);
  const activeWorkspaceProjectId = workspace.kind === 'project' ? workspace.projectId : null;
  const selectedWorkspaceProject = workspace.kind === 'project'
    ? (
      auth.projects.find((project) => project.id === workspace.projectId)
      ?? (sessionProjectId === workspace.projectId ? auth.project : null)
    )
    : null;
  const generationController = useProjectGenerationController({
    auth: {
      accessToken: auth.accessToken,
      isAuthenticated: auth.isAuthenticated,
      refreshAccessToken: auth.refreshAccessToken,
    },
    workspace,
    tasks,
    setTasks,
    hasShareToken,
    isScheduleReadOnlyProject,
    proactiveChatDenial,
    selectedWorkspaceProjectTaskCount: selectedWorkspaceProject?.taskCount,
    onLoginRequired,
    openLimitModal,
    setWorkspace,
  });
  const {
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
    mergeOptimisticChatMessages,
  } = generationController;
  const effectiveAuthGanttDayMode = pendingGanttDayMode ?? (auth.project?.ganttDayMode ?? 'calendar');
  const visibleTasks = previewState.active ? previewState.tasks : tasks;
  const selectionController = useShareTemplateSelectionController({
    visibleTasks,
    accessToken: auth.accessToken,
    project: auth.project ? { id: auth.project.id, name: auth.project.name } : null,
  });
  const {
    shareSelectionMode,
    selectedShareTaskIds,
    templateSelectionMode,
    selectedTemplateTaskIds,
    saveTemplateDraft,
    insertTemplateDraft,
    saveTemplatePending,
    insertTemplatePending,
    setSaveTemplateDraft,
    setInsertTemplateDraft,
    setSaveTemplatePending,
    setInsertTemplatePending,
    setSelectedTemplateTaskIds,
    resetShareSelection,
    resetTemplateSelection,
    handleStartPartialShareSelection,
    handlePartialShareSelectionChange,
    handleStartTemplateSelection,
    handleTemplateSelectionChange,
    handleConfirmTemplateSelection,
    handleCreateTemplateFromTask,
    handleSubmitPartialShareSelection,
  } = selectionController;
  const lifecycleController = useProjectLifecycleController({
    auth,
    workspace,
    localTaskCount: localTasks.tasks.length,
    hasShareToken,
    isScheduleReadOnlyProject,
    sessionProjectId,
    proactiveChatDenial,
    constraintDenial,
    activeProjectToReplace,
    canSilentlyReplaceOnFree,
    effectiveArchiveDenial,
    isProjectGroupsLockedOnCurrentPlan,
    projectGroupsLockedDenial,
    templateCreateIntentId,
    onConsumeTemplateCreateIntent,
    projectCreationIntentId,
    onConsumeProjectCreationIntent,
    projectOpenIntentId,
    onConsumeProjectOpenIntent,
    plannerCorrectionTarget,
    consumePlannerCorrectionTarget,
    pendingPostAuthAction,
    setPendingPostAuthAction,
    onLoginRequired,
    openLimitModal,
    fetchUsage,
    getProjectState,
    setWorkspace,
    setSidebarState,
    replaceTasksFromSystem,
    openTemplate,
    resetWorkspacePresentation,
    handleSend,
    submitChatMessage,
    queuedPromptRef,
    createEmptyChartAfterActivationRef,
    preserveStartScreenPrefillOnNextSessionRef,
    forceProjectWorkspaceOnNextSessionRef,
    setActiveEmptyProjectModeProjectId,
  });
  const {
    deleteProjectDraft,
    showCreateProjectModal,
    pendingProjectCreation,
    startScreenPrefillPrompt,
    closeCreateProjectModal,
    hideDeleteProjectModal,
    handleConfirmDeleteProject,
    handleStartScreenSend,
    handleEmptyChart,
    handleCreateProject,
    handleSwitchProject,
    handleSwitchTemplate,
    handleArchiveProject,
    handleRestoreProject,
    handleDeleteProject,
    handleCreateProjectGroup,
    handleCreateProjectModalGroup,
    handleRenameProjectGroup,
    handleDeleteProjectGroup,
    handleCreateProjectModalSave,
  } = lifecycleController;

  useEffect(() => {
    if (!pendingGanttDayMode) {
      return;
    }

    if (auth.project?.ganttDayMode === pendingGanttDayMode) {
      setPendingGanttDayMode(null);
    }
  }, [auth.project?.ganttDayMode, pendingGanttDayMode]);
  const displayConnected = hasShareToken ? true : auth.isAuthenticated ? connected : true;

  const dismissToast = useCallback((toastId: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback((message: string) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

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

  const handleCreateCurrentProjectTemplate = useCallback(() => {
    if (isScheduleReadOnlyProject) {
      return;
    }
    resetShareSelection();
    resetTemplateSelection();
    setSaveTemplateDraft({
      mode: 'project',
      initialName: auth.project?.name ? `${auth.project.name} шаблон` : 'Новый шаблон',
      taskCount: visibleTasks.length,
      rootTaskIds: [],
    });
  }, [auth.project?.name, isScheduleReadOnlyProject, resetShareSelection, resetTemplateSelection, visibleTasks.length]);

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
        resetTemplateSelection();
      }
      setSaveTemplateDraft(null);
    } finally {
      setSaveTemplatePending(false);
    }
  }, [createTemplateFromProject, createTemplateFromSelection, resetTemplateSelection, saveTemplateDraft]);

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

  const handleOpenResourcePool = useCallback(async () => {
    if (!canViewResources) {
      return;
    }

    if (!auth.project) {
      return;
    }

    setWorkspace({ kind: 'planner', projectId: auth.project.id });
  }, [auth.project, canViewResources, setWorkspace]);

  const handleOpenGroupGantt = useCallback(async (groupId?: string) => {
    const targetGroupId = groupId ?? auth.project?.groupId;
    if (!targetGroupId || !canViewSchedule) {
      return;
    }

    setPlannerCorrectionTarget(null);
    setWorkspace({ kind: 'group-gantt', groupId: targetGroupId });
  }, [auth.project, canViewSchedule, setPlannerCorrectionTarget, setWorkspace]);

  const handleOpenFactMode = useCallback(async () => {
    if (!auth.project || !canViewSchedule) {
      return;
    }

    setPlannerCorrectionTarget(null);
    setProjectState(auth.project.id, { projectDisplayMode: 'fact' });
    setWorkspace({ kind: 'project', projectId: auth.project.id, chatOpen: readProjectChatOpenState() });
  }, [auth.project, canViewSchedule, setPlannerCorrectionTarget, setProjectState, setWorkspace]);

  const handleOpenChartMode = useCallback(async () => {
    const targetProjectId = workspace.kind === 'planner' || workspace.kind === 'finance'
      ? workspace.projectId
      : auth.project?.id;
    if (!targetProjectId || !canViewSchedule) {
      return;
    }

    setPlannerCorrectionTarget(null);
    setProjectState(targetProjectId, { projectDisplayMode: 'gantt' });
    setWorkspace({ kind: 'project', projectId: targetProjectId, chatOpen: readProjectChatOpenState() });
  }, [auth.project?.id, canViewSchedule, setPlannerCorrectionTarget, setProjectState, setWorkspace, workspace]);

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

    if (workspace.kind === 'group-gantt' && !canViewSchedule) {
      if (canViewResources) {
        setWorkspace({ kind: 'planner', projectId: auth.project.id });
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
    } else if (workspace.kind === 'group-gantt' && auth.project?.id) {
      setProjectState(auth.project.id, { activeWorkspace: 'group-gantt' });
    }
  }, [auth.project?.id, setProjectState, workspace]);

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
  }, [auth.isAuthenticated, clearAiDoneGraceTimer, hasShareToken, releaseAiMutationLock, sessionProjectId]);

  useEffect(() => () => {
    clearAiDoneGraceTimer();
    releaseAiMutationLock();
  }, [clearAiDoneGraceTimer, releaseAiMutationLock]);

  useEffect(() => {
    resetShareSelection();
    resetTemplateSelection();
  }, [hasShareToken, resetShareSelection, resetTemplateSelection, sessionProjectId]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken || !activeWorkspaceProjectId || hasShareToken || workspace.kind !== 'project') {
      return;
    }

    const hasQueuedFirstPrompt = Boolean(queuedPromptRef.current);
    const isPreparedIntentProject = preparedIntentChatProjectId === activeWorkspaceProjectId
      || (activeGenerationJob?.projectId === activeWorkspaceProjectId && isActiveProjectGenerationJob(activeGenerationJob));
    const chatState = useChatStore.getState();
    const hasLocalOptimisticChat = chatState.aiThinking || chatState.streamingText.length > 0 || chatState.messages.length > 0;
    if (!hasQueuedFirstPrompt && !isPreparedIntentProject && !hasLocalOptimisticChat) {
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
        const normalizedMessages: NormalizedChatMessage[] = data.map((message) => ({
          id: message.id ?? crypto.randomUUID(),
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
          requestContextId: message.requestContextId ?? null,
          historyGroupId: message.historyGroupId ?? null,
        }));
        const mergedMessages = mergeOptimisticChatMessages(
          normalizedMessages,
          useChatStore.getState().messages as NormalizedChatMessage[],
        );
        if (isPreparedIntentProject) {
          useChatStore.setState((state) => ({
            ...state,
            messages: mergedMessages,
            streamingText: '',
            pendingAssistantMeta: null,
            aiThinking: true,
            error: null,
          }));
          return;
        }
        useChatStore.getState().replaceMessages(mergedMessages);
      })
      .catch(() => {});
  }, [activeGenerationJob, activeWorkspaceProjectId, auth.accessToken, auth.isAuthenticated, hasShareToken, preparedIntentChatProjectId, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken || workspace.kind !== 'project' || !activeWorkspaceProjectId) {
      return;
    }
    if (loading) {
      return;
    }

    syncProjectTaskCount(activeWorkspaceProjectId, tasks.length);
  }, [activeWorkspaceProjectId, auth.isAuthenticated, hasShareToken, loading, syncProjectTaskCount, tasks.length, workspace.kind]);

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
  const currentProjectTaskCount = workspace.kind === 'project'
    ? (
      auth.projects.find((project) => project.id === workspace.projectId)?.taskCount
      ?? selectedWorkspaceProject?.taskCount
      ?? tasks.length
    )
    : undefined;
  const hasActiveProjects = auth.projects.some((project) => project.status !== 'archived');
  const currentProjectIsEmpty = workspace.kind === 'project' && currentProjectTaskCount === 0;
  const hasQueuedProjectPrompt = workspace.kind === 'project' && Boolean(queuedPromptRef.current);
  const projectChatOpen = workspace.kind === 'project' && workspace.chatOpen;
  const effectivePendingProjectCreation = pendingProjectCreation;
  const showProjectStartScreen = workspace.kind === 'project'
    && !hasShareToken
    && currentProjectIsEmpty
    && !projectChatOpen
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
  const shouldRenderCrossWorkspaceProjectSettingsModal = !showProjectStartScreen
    && showProjectSettingsModal
    && Boolean(auth.project)
    && !hasShareToken
    && (
      workspace.kind === 'planner'
      || workspace.kind === 'finance'
      || (workspace.kind === 'project' && isFactModeActive)
    );

  const currentProjectLabel = hasShareToken
    ? (sharedProject.project?.name || 'Shared project')
    : workspace.kind === 'template'
      ? (activeTemplate?.metadata.name || 'Шаблон')
    : workspace.kind === 'group-gantt'
      ? (auth.projectGroups.find((group) => group.id === workspace.groupId)?.name ?? 'Портфель проектов')
    : auth.isAuthenticated
      ? selectedWorkspaceProject?.name ?? auth.project?.name
      : (localTasks.projectName || 'Мой проект');
  const currentProjectDisplay = useMemo(() => (
    workspace.kind === 'group-gantt'
      ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Folder className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="truncate">{currentProjectLabel}</span>
        </span>
      )
      : currentProjectLabel
  ), [currentProjectLabel, workspace.kind]);
  const handleSaveStartScreenProjectSettings = useCallback(async (settings: {
    projectName: string;
    ganttDayMode: 'business' | 'calendar';
    calendarWeeklyPattern: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
    calendarDays: Array<{ date: string; kind: 'working' | 'non_working' | 'shortened' }>;
    timelineMarkers: TimelineMarker[];
    hiddenTaskListColumnsDefault: string[] | null;
  }) => {
    if (!auth.project || isScheduleReadOnlyProject) {
      return;
    }

    const projectNameChanged = settings.projectName.trim() !== (auth.project.name ?? '').trim();
    const calendarWeeklyPatternChanged = JSON.stringify(settings.calendarWeeklyPattern)
      !== JSON.stringify(auth.project.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN);
    const calendarDaysChanged = JSON.stringify(settings.calendarDays)
      !== JSON.stringify(auth.project.calendarDays ?? EMPTY_CALENDAR_DAYS);
    const markersChanged = JSON.stringify(settings.timelineMarkers) !== JSON.stringify(auth.project.timelineMarkers ?? []);
    const dayModeChanged = settings.ganttDayMode !== effectiveAuthGanttDayMode;
    const hiddenColumnsDefaultChanged = JSON.stringify(settings.hiddenTaskListColumnsDefault ?? null)
      !== JSON.stringify(auth.project.hiddenTaskListColumnsDefault ?? null);

    if (!projectNameChanged && !calendarWeeklyPatternChanged && !calendarDaysChanged && !markersChanged && !dayModeChanged && !hiddenColumnsDefaultChanged) {
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
      if (calendarWeeklyPatternChanged || calendarDaysChanged) {
        await auth.updateProject(auth.project.id, {
          calendarWeeklyPattern: settings.calendarWeeklyPattern,
          calendarDays: settings.calendarDays,
        });
      }
      if (dayModeChanged) {
        await handleGanttDayModeChange(settings.ganttDayMode);
      }
      if (markersChanged) {
        await auth.updateProject(auth.project.id, { timelineMarkers: settings.timelineMarkers });
      }
      if (hiddenColumnsDefaultChanged) {
        await auth.updateProject(auth.project.id, { hiddenTaskListColumnsDefault: settings.hiddenTaskListColumnsDefault });
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
  const groupExcelExportUrl = useMemo(() => {
    if (workspace.kind !== 'group-gantt') {
      return null;
    }

    const groupStateId = `group:${workspace.groupId}`;
    const loadDepth = projectStates[groupStateId]?.groupOverviewLoadDepth ?? 3;
    return `/api/project-groups/${encodeURIComponent(workspace.groupId)}/overview-gantt/export/excel?loadDepth=${loadDepth}`;
  }, [projectStates, workspace]);
  const exportImportController = useExportImportController({
    auth: {
      accessToken: auth.accessToken,
      isAuthenticated: auth.isAuthenticated,
      refreshAccessToken: auth.refreshAccessToken,
    },
    billingStatus,
    currentProjectLabel: currentProjectLabel ?? 'Мой проект',
    hasShareToken,
    isScheduleReadOnlyProject,
    onLoginRequired,
    openLimitModal,
    refreshProjects,
    doExportPdf,
    isPdfHelperDismissed,
    excelExportMode: isFactModeActive ? 'plan-fact' : 'gantt',
    excelExportUrl: groupExcelExportUrl,
  });
  const {
    backupImportInputRef,
    isExportExcelLoading,
    isImportTemplateLoading,
    showImportExcelModal,
    showPdfHelper,
    selectedBackupFile,
    backupRestorePending,
    backupRestoreError,
    backupRestoreSummary,
    setShowImportExcelModal,
    setShowPdfHelper,
    handleExportPdf,
    handleExportExcel,
    handleExportBackup,
    handleOpenBackupImport,
    handleBackupImportChange,
    handleCloseBackupRestoreModal,
    handleConfirmBackupRestore,
    handleDownloadImportTemplate,
    handleImportExcelCompleted,
  } = exportImportController;

  // Workspace view selection and shared overlays.
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
          projectGroupName={auth.projectGroups.find((group) => group.id === (
            auth.projects.find((project) => project.id === workspace.projectId)?.groupId
            ?? auth.project?.groupId
          ))?.name ?? null}
          scope={workspace.scope ?? 'current-project'}
          ganttDayMode={effectiveAuthGanttDayMode}
          calendarWeeklyPattern={auth.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
          calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
          readonly={isArchivedProject || !canEditResources}
          onScopeChange={(scope) => {
            setWorkspace({ kind: 'planner', projectId: workspace.projectId, scope });
          }}
          onResourceLimitReached={() => openLimitModal(buildResourceCreationLimitDenial(billingStatus))}
          onBackToProject={() => {
            setPlannerCorrectionTarget(null);
            setWorkspace({ kind: 'project', projectId: workspace.projectId, chatOpen: readProjectChatOpenState() });
          }}
          onCorrectConflict={(target) => {
            setPlannerCorrectionTarget(target);
            setProjectState(target.projectId, { projectDisplayMode: 'gantt' });
            setWorkspace({ kind: 'project', projectId: target.projectId, chatOpen: readProjectChatOpenState() });
          }}
          onOpenTask={(target) => {
            setShowChart(true);
            setPlannerCorrectionTarget(target);
            setProjectState(target.projectId, { projectDisplayMode: 'gantt' });
            setWorkspace({ kind: 'project', projectId: target.projectId, chatOpen: readProjectChatOpenState() });
          }}
        />
      )
    : workspace.kind === 'group-gantt'
      ? (
        <GroupGanttWorkspace
          accessToken={auth.accessToken}
          groupId={workspace.groupId}
          onExportExcel={handleExportExcel}
          isExportExcelLoading={isExportExcelLoading}
          onOpenProject={async (projectId, taskId) => {
            setShowChart(true);
            setProjectState(projectId, { projectDisplayMode: 'gantt' });
            await handleSwitchProject(projectId);
            if (taskId) {
              window.setTimeout(() => {
                ganttRef.current?.scrollToRow(taskId, { select: true, clearSelectionAfterMs: 2400 });
              }, 250);
            }
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
              initialPrompt={startScreenPrefillPrompt ?? undefined}
            />
          )
        : workspace.kind === 'project'
          ? isFactModeActive
            ? (
            <ProjectFactWorkspace
              ganttRef={ganttRef}
              tasks={visibleTasks}
              setTasks={setTasks}
              loading={loading}
              accessToken={auth.accessToken}
              sharedProject={sharedProject.project}
              shareToken={sharedProject.shareToken}
              hasShareToken={hasShareToken}
              isAuthenticated={auth.isAuthenticated}
              batchUpdate={batchUpdate}
              onScrollToToday={handleScrollToToday}
              onCollapseAll={handleCollapseAll}
              onExpandAll={handleExpandAll}
              onExportPdf={handleExportPdf}
              onExportExcel={handleExportExcel}
              onExportBackup={handleExportBackup}
              onImportExcel={() => setShowImportExcelModal(true)}
              onImportBackup={handleOpenBackupImport}
              isExportExcelLoading={isExportExcelLoading}
              onValidation={handleValidation}
              shareStatus={shareStatus}
              onCreateShareLink={handleCreateShareLink}
              readOnly={isScheduleReadOnlyProject}
              calendarWeeklyPattern={auth.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
              calendarDays={auth.project?.calendarDays ?? EMPTY_CALENDAR_DAYS}
            />
          )
            : (
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
              onStopGeneration={handleCancelActiveGeneration}
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
              onCancelShareSelection={resetShareSelection}
              onConfirmShareSelection={handleSubmitPartialShareSelection}
              templateSelectionMode={templateSelectionMode}
              selectedTemplateTaskIds={selectedTemplateTaskIds}
              onSelectedTemplateTaskIdsChange={handleTemplateSelectionChange}
              onCancelTemplateSelection={resetTemplateSelection}
              onConfirmTemplateSelection={handleConfirmTemplateSelection}
              ganttDayMode={effectiveAuthGanttDayMode}
              displayGanttDayMode={effectiveAuthGanttDayMode}
              calendarWeeklyPattern={auth.project?.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
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
              onOpenLimitModal={openLimitModal}
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
              initialPrompt={startScreenPrefillPrompt ?? undefined}
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
        calendarWeeklyPattern={auth.project.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
        calendarDays={auth.project.calendarDays ?? EMPTY_CALENDAR_DAYS}
        timelineMarkers={auth.project.timelineMarkers ?? []}
        hiddenTaskListColumnsDefault={auth.project.hiddenTaskListColumnsDefault ?? null}
        taskListColumnRows={TASK_LIST_COLUMN_ROWS}
        pending={startScreenProjectSettingsPending}
        error={startScreenProjectSettingsError}
        canEditProjectName={!isScheduleReadOnlyProject}
        canShiftProject={false}
        canEditGanttDayMode={!isScheduleReadOnlyProject}
        canEditTimelineMarkers={!isScheduleReadOnlyProject}
        canEditTaskListColumnsDefault={!isScheduleReadOnlyProject}
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
    {shouldRenderCrossWorkspaceProjectSettingsModal && auth.project && (
      <ProjectSettingsModal
        projectName={auth.project.name ?? 'Мой проект'}
        ganttDayMode={effectiveAuthGanttDayMode}
        calendarWeeklyPattern={auth.project.calendarWeeklyPattern ?? DEFAULT_CALENDAR_WEEKLY_PATTERN}
        calendarDays={auth.project.calendarDays ?? EMPTY_CALENDAR_DAYS}
        timelineMarkers={auth.project.timelineMarkers ?? []}
        hiddenTaskListColumnsDefault={auth.project.hiddenTaskListColumnsDefault ?? null}
        taskListColumnRows={TASK_LIST_COLUMN_ROWS}
        pending={startScreenProjectSettingsPending}
        error={startScreenProjectSettingsError}
        canEditProjectName={!isScheduleReadOnlyProject}
        canShiftProject={false}
        canEditGanttDayMode={!isScheduleReadOnlyProject}
        canEditTimelineMarkers={!isScheduleReadOnlyProject}
        canEditTaskListColumnsDefault={!isScheduleReadOnlyProject}
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
    {toasts.length > 0 && (
      <div className="fixed right-4 top-4 z-[95] flex max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
            role="status"
            aria-live="polite"
          >
            <div className="min-w-0 flex-1">{toast.message}</div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )}
      <ProjectMenu
      error={error}
      hasShareToken={hasShareToken}
      isArchivedProject={isArchivedProject}
      isReadOnlyProject={isScheduleReadOnlyProject}
        currentProjectLabel={currentProjectLabel}
        currentProjectDisplay={currentProjectDisplay}
      onCreateProject={handleCreateProject}
      onSwitchProject={handleSwitchProject}
      onRenameProject={async (projectId, name) => {
        await auth.updateProject(projectId, { name });
      }}
      onMoveProject={async (projectId, groupId) => {
        await auth.updateProject(projectId, { groupId });
      }}
      onArchiveProject={async (projectId) => {
        await handleArchiveProject(projectId);
      }}
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
      canViewFactMode={canViewSchedule}
      canViewResourcePool={canViewResources}
      canViewFinance={canViewFinance}
      canViewGroupGantt={canViewSchedule}
      isFactModeActive={isFactModeActive}
      onOpenResourcePool={handleOpenResourcePool}
      onOpenFinance={handleOpenFinance}
      onOpenGroupGantt={() => { void handleOpenGroupGantt(); }}
      onOpenProjectGroupGantt={handleOpenGroupGantt}
      onOpenChartMode={handleOpenChartMode}
      onOpenFactMode={handleOpenFactMode}
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
          await handleConfirmDeleteProject();
          setLimitModal(null);
        }}
        onClose={hideDeleteProjectModal}
      />
    )}

    {showCreateProjectModal && (
      <CreateProjectModal
        projectGroups={auth.projectGroups}
        initialGroupId={effectivePendingProjectCreation?.groupId ?? auth.project?.groupId ?? auth.projectGroups[0]?.id}
        initialName={effectivePendingProjectCreation?.initialProjectName}
        title={effectivePendingProjectCreation?.templatePublicationId ? effectivePendingProjectCreation.title : undefined}
        description={effectivePendingProjectCreation?.templatePublicationId ? effectivePendingProjectCreation.description : undefined}
        submitLabel={effectivePendingProjectCreation?.archiveProjectId
          ? 'Архивировать и создать'
          : effectivePendingProjectCreation?.templatePublicationId
            ? 'Создать проект'
            : undefined}
        archiveProjectName={effectivePendingProjectCreation?.archiveProjectName}
        onSave={handleCreateProjectModalSave}
        onCreateGroup={handleCreateProjectModalGroup}
        onClose={closeCreateProjectModal}
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
              resetTemplateSelection();
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
