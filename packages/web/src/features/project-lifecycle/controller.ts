import { useCallback, useEffect, useReducer, useRef, type MutableRefObject } from 'react';

import { useAuthStore, type AuthProject, type UseAuthResult } from '../../stores/useAuthStore.ts';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useProjectStore } from '../../stores/useProjectStore.ts';
import { readProjectChatOpenState, type PendingPostAuthAction, type PlannerCorrectionTarget, type SidebarMode, type WorkspaceMode } from '../../stores/useUIStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import type { ConstraintDenialPayload } from '../../lib/constraintUi.ts';
import type { StartScreenSendResult } from '../../components/StartScreen.tsx';
import type { ProjectGroup, Task } from '../../types.ts';
import {
  createProjectFromTemplatePublication,
  fetchProjectIntent,
  fetchTemplatePublicationDetail,
  parseTemplateProjectCreationResponse,
  type ProjectIntentReadResponse,
} from './api.ts';
import type { PendingProjectCreation } from './model.ts';
import { initialProjectLifecycleState, projectLifecycleReducer } from './reducer.ts';

type ProjectUiLookup = {
  activeWorkspace: 'project' | 'planfact' | 'planner' | 'finance';
} | null;

type WorkspaceSetter = (workspace: WorkspaceMode | ((current: WorkspaceMode) => WorkspaceMode)) => void;

function isConstraintCode(code: string | undefined): code is ConstraintDenialPayload['code'] {
  return code === 'PROJECT_LIMIT_REACHED' || code === 'RESTORE_PROJECT_LIMIT_REACHED' || code === 'AI_LIMIT_REACHED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'ARCHIVE_FEATURE_LOCKED' || code === 'EXPORT_FEATURE_LOCKED';
}

function getProjectWorkspaceMode(projectId: string, getProjectState: (projectId: string) => ProjectUiLookup): WorkspaceMode {
  const activeWorkspace = getProjectState(projectId)?.activeWorkspace ?? 'project';
  return activeWorkspace === 'planner'
    ? { kind: 'planner', projectId }
    : activeWorkspace === 'finance'
      ? { kind: 'finance', projectId }
      : activeWorkspace === 'planfact'
        ? { kind: 'planfact', projectId }
      : { kind: 'project', projectId, chatOpen: readProjectChatOpenState() };
}

export function useProjectLifecycleController(params: {
  auth: UseAuthResult;
  workspace: WorkspaceMode;
  localTaskCount: number;
  hasShareToken: boolean;
  isScheduleReadOnlyProject: boolean;
  sessionProjectId: string | null;
  proactiveChatDenial: Partial<ConstraintDenialPayload> | null | undefined;
  constraintDenial: Partial<ConstraintDenialPayload> | null;
  activeProjectToReplace: AuthProject | null;
  canSilentlyReplaceOnFree: boolean;
  effectiveArchiveDenial: Partial<ConstraintDenialPayload> | null | undefined;
  isProjectGroupsLockedOnCurrentPlan: boolean;
  projectGroupsLockedDenial: Partial<ConstraintDenialPayload> | null;
  templateCreateIntentId: string | null;
  onConsumeTemplateCreateIntent: () => void;
  projectCreationIntentId: string | null;
  onConsumeProjectCreationIntent: () => void;
  projectOpenIntentId: string | null;
  onConsumeProjectOpenIntent: () => void;
  plannerCorrectionTarget: PlannerCorrectionTarget | null;
  consumePlannerCorrectionTarget: (predicate?: (target: PlannerCorrectionTarget) => boolean) => PlannerCorrectionTarget | null;
  pendingPostAuthAction: PendingPostAuthAction;
  setPendingPostAuthAction: (action: PendingPostAuthAction) => void;
  onLoginRequired: () => void;
  openLimitModal: (denial: Partial<ConstraintDenialPayload> | null | undefined) => Promise<void>;
  fetchUsage: () => Promise<unknown>;
  getProjectState: (projectId: string) => ProjectUiLookup;
  setWorkspace: WorkspaceSetter;
  setSidebarState: (state: SidebarMode) => void;
  replaceTasksFromSystem: (tasks: Task[]) => void;
  openTemplate: (templateId: string) => Promise<unknown>;
  resetWorkspacePresentation: () => void;
  handleSend: (text: string) => StartScreenSendResult;
  submitChatMessage: (text: string) => Promise<unknown>;
  queuedPromptRef: MutableRefObject<string | null>;
  createEmptyChartAfterActivationRef: MutableRefObject<boolean>;
  preserveStartScreenPrefillOnNextSessionRef: MutableRefObject<boolean>;
  forceProjectWorkspaceOnNextSessionRef: MutableRefObject<string | null>;
  setActiveEmptyProjectModeProjectId: (projectId: string | null) => void;
}) {
  const {
    auth,
    workspace,
    localTaskCount,
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
  } = params;

  const [state, dispatch] = useReducer(projectLifecycleReducer, initialProjectLifecycleState);
  const activationInFlightRef = useRef(false);
  const resolvingProjectIntentRef = useRef<string | null>(null);

  const openCreateProjectModal = useCallback((nextIntent: PendingProjectCreation = {}) => {
    dispatch({ type: 'open_create_project_modal', pending: nextIntent });
  }, []);

  const closeCreateProjectModal = useCallback(() => {
    dispatch({ type: 'close_create_project_modal' });
    setPendingPostAuthAction(null);
  }, [setPendingPostAuthAction]);

  const createProjectAndActivate = useCallback(async (
    name: string,
    options: PendingProjectCreation = {},
    behavior: { skipProjectLimitRecovery?: boolean } = {},
  ): Promise<{ id: string; name: string } | null> => {
    if (hasShareToken || !auth.isAuthenticated || activationInFlightRef.current) {
      return null;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    activationInFlightRef.current = true;

    try {
      let newProject: AuthProject | null = null;

      if (options.templatePublicationId) {
        const response = await createProjectFromTemplatePublication(
          auth,
          options.templatePublicationId,
          {
            projectName: trimmedName,
            groupId: options.groupId ?? auth.project?.groupId,
          },
        );

        if (response.status === 403) {
          try {
            const body = await response.json() as Partial<ConstraintDenialPayload>;
            if (isConstraintCode(body.code)) {
              if (
                !behavior.skipProjectLimitRecovery
                && body.code === 'PROJECT_LIMIT_REACHED'
                && !canSilentlyReplaceOnFree
              ) {
                await openLimitModal(body);
                return null;
              }
              await openLimitModal(body);
              return null;
            }
          } catch {
            // fall through to generic error below
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await parseTemplateProjectCreationResponse(response);
        newProject = payload.project;
      } else {
        newProject = await auth.createProject(trimmedName, options.groupId ?? auth.project?.groupId);
        if (!newProject) {
          const denial = useAuthStore.getState().constraintDenial;
          if (
            !behavior.skipProjectLimitRecovery
            && denial?.code === 'PROJECT_LIMIT_REACHED'
            && !canSilentlyReplaceOnFree
          ) {
            useAuthStore.setState({ constraintDenial: null });
            await openLimitModal(denial);
            return null;
          }
        }
      }

      if (!newProject) {
        return null;
      }

      createEmptyChartAfterActivationRef.current = Boolean(options.createEmptyChart);
      queuedPromptRef.current = null;
      resetWorkspacePresentation();
      await auth.refreshProjects();

      preserveStartScreenPrefillOnNextSessionRef.current = true;
      forceProjectWorkspaceOnNextSessionRef.current = newProject.id;
      await auth.switchProject(newProject.id);
      setSidebarState('closed');
      if (options.createEmptyChart) {
        setActiveEmptyProjectModeProjectId(newProject.id);
      } else {
        replaceTasksFromSystem([]);
      }
      setWorkspace({
        kind: 'project',
        projectId: newProject.id,
        chatOpen: false,
      });
      dispatch({ type: 'project_created', prompt: options.firstPrompt ?? null });
      setPendingPostAuthAction(null);
      return { id: newProject.id, name: newProject.name };
    } finally {
      activationInFlightRef.current = false;
    }
  }, [
    auth,
    canSilentlyReplaceOnFree,
    createEmptyChartAfterActivationRef,
    forceProjectWorkspaceOnNextSessionRef,
    hasShareToken,
    openLimitModal,
    preserveStartScreenPrefillOnNextSessionRef,
    queuedPromptRef,
    replaceTasksFromSystem,
    resetWorkspacePresentation,
    setActiveEmptyProjectModeProjectId,
    setPendingPostAuthAction,
    setSidebarState,
    setWorkspace,
  ]);

  const handleSwitchProject = useCallback(async (projectId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    useTaskStore.setState({ loading: true, error: null });
    useProjectStore.getState().clearTransientState();
    await auth.switchProject(projectId);
    setWorkspace(getProjectWorkspaceMode(projectId, getProjectState));
  }, [auth, createEmptyChartAfterActivationRef, getProjectState, queuedPromptRef, setWorkspace]);

  const handleSwitchTemplate = useCallback(async (templateId: string) => {
    createEmptyChartAfterActivationRef.current = false;
    queuedPromptRef.current = null;
    await openTemplate(templateId);
    setWorkspace({ kind: 'template', templateId });
  }, [createEmptyChartAfterActivationRef, openTemplate, queuedPromptRef, setWorkspace]);

  const handleArchiveProject = useCallback(async (projectId: string) => {
    if (effectiveArchiveDenial) {
      await openLimitModal(effectiveArchiveDenial);
      return false;
    }
    await auth.archiveProject(projectId);
    await fetchUsage();
    await auth.refreshProjects();
    return true;
  }, [auth, effectiveArchiveDenial, fetchUsage, openLimitModal]);

  const handleArchiveAndCreateProject = useCallback(async (
    name: string,
    groupId: string | undefined,
    options: PendingProjectCreation = {},
  ): Promise<{ id: string; name: string } | null> => {
    const archiveProjectId = options.archiveProjectId;
    if (!archiveProjectId) {
      return createProjectAndActivate(name, { ...options, groupId }, { skipProjectLimitRecovery: true });
    }

    const archived = await handleArchiveProject(archiveProjectId);
    if (!archived) {
      return null;
    }

    return createProjectAndActivate(
      name,
      {
        ...options,
        groupId,
        archiveProjectId: undefined,
        archiveProjectName: undefined,
      },
      { skipProjectLimitRecovery: true },
    );
  }, [createProjectAndActivate, handleArchiveProject]);

  const handleRestoreProject = useCallback(async (projectId: string) => {
    try {
      await auth.restoreProject(projectId);
      await fetchUsage();
      await auth.refreshProjects();
    } catch (error) {
      if (error instanceof Error && error.message === 'RESTORE_PROJECT_LIMIT_REACHED') {
        return;
      }
      throw error;
    }
  }, [auth, fetchUsage]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const project = auth.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    dispatch({
      type: 'show_delete_project_modal',
      draft: {
        id: projectId,
        name: project.name,
      },
    });
  }, [auth.projects]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!state.deleteProjectDraft) {
      return;
    }

    await auth.deleteProject(state.deleteProjectDraft.id);
    await auth.refreshProjects();
    await fetchUsage();
    useAuthStore.setState({ constraintDenial: null });
    dispatch({ type: 'hide_delete_project_modal' });
  }, [auth, fetchUsage, state.deleteProjectDraft]);

  const handleCreateProject = useCallback(async (groupId?: string) => {
    if (hasShareToken) {
      window.location.assign(window.location.origin);
      return;
    }

    if (auth.isAuthenticated) {
      openCreateProjectModal({ groupId: groupId ?? auth.project?.groupId });
      return;
    }
    queuedPromptRef.current = null;
    setPendingPostAuthAction(null);
    onLoginRequired();
  }, [
    auth.isAuthenticated,
    auth.project?.groupId,
    hasShareToken,
    onLoginRequired,
    openCreateProjectModal,
    queuedPromptRef,
    setPendingPostAuthAction,
  ]);

  const handleCreateProjectGroup = useCallback(async (name: string): Promise<void> => {
    if (isProjectGroupsLockedOnCurrentPlan) {
      await openLimitModal(projectGroupsLockedDenial);
      return;
    }
    await auth.createProjectGroup(name);
  }, [auth, isProjectGroupsLockedOnCurrentPlan, openLimitModal, projectGroupsLockedDenial]);

  const handleCreateProjectModalGroup = useCallback(async (name: string): Promise<ProjectGroup | null> => {
    if (isProjectGroupsLockedOnCurrentPlan) {
      await openLimitModal(projectGroupsLockedDenial);
      return null;
    }
    return auth.createProjectGroup(name);
  }, [auth, isProjectGroupsLockedOnCurrentPlan, openLimitModal, projectGroupsLockedDenial]);

  const handleRenameProjectGroup = useCallback(async (groupId: string, name: string) => {
    await auth.updateProjectGroup(groupId, { name });
  }, [auth]);

  const handleDeleteProjectGroup = useCallback(async (groupId: string) => {
    const currentProjectId = auth.project?.id ?? null;
    const currentProjectGroupId = auth.project?.groupId ?? null;
    await auth.deleteProjectGroup(groupId);
    await auth.refreshProjects();
    await fetchUsage();

    if (currentProjectId && currentProjectGroupId === groupId) {
      const nextProject = useAuthStore.getState().project;
      if (nextProject && nextProject.id !== currentProjectId) {
        await auth.switchProject(nextProject.id);
      }
    }
  }, [auth, fetchUsage]);

  const handleCreateProjectModalSave = useCallback(async (name: string, groupId?: string) => {
    const nextOptions = { ...(state.pendingProjectCreation ?? {}), groupId };
    if (state.pendingProjectCreation?.archiveProjectId) {
      return handleArchiveAndCreateProject(name, groupId, nextOptions);
    }
    return createProjectAndActivate(name, nextOptions);
  }, [createProjectAndActivate, handleArchiveAndCreateProject, state.pendingProjectCreation]);

  const handleStartScreenSend = useCallback(async (text: string): Promise<StartScreenSendResult> => {
    if (hasShareToken) {
      return { accepted: false };
    }
    if (!auth.isAuthenticated) {
      setPendingPostAuthAction({
        kind: 'send_prompt',
        prompt: text,
        sourceProjectState: localTaskCount === 0 ? 'empty' : 'non_empty',
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
    if (workspace.kind === 'project') {
      const result = handleSend(text);
      if (result.accepted) {
        dispatch({ type: 'set_start_screen_prefill_prompt', prompt: null });
      }
      return result;
    }
    if (!auth.project) {
      openCreateProjectModal({ firstPrompt: text });
      return { accepted: true };
    }
    const result = handleSend(text);
    if (result.accepted) {
      dispatch({ type: 'set_start_screen_prefill_prompt', prompt: null });
    }
    return result;
  }, [
    auth.isAuthenticated,
    auth.project,
    handleSend,
    hasShareToken,
    isScheduleReadOnlyProject,
    localTaskCount,
    onLoginRequired,
    openCreateProjectModal,
    setPendingPostAuthAction,
    workspace.kind,
  ]);

  const handleEmptyChart = useCallback(async () => {
    if (hasShareToken) {
      return;
    }
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (!auth.project) {
      openCreateProjectModal({ createEmptyChart: true });
      return;
    }
    if (workspace.kind === 'project') {
      setActiveEmptyProjectModeProjectId(workspace.projectId);
    }
  }, [auth.isAuthenticated, auth.project, hasShareToken, onLoginRequired, openCreateProjectModal, setActiveEmptyProjectModeProjectId, workspace]);

  useEffect(() => {
    if (!constraintDenial) {
      return;
    }

    if (constraintDenial.code === 'PROJECT_LIMIT_REACHED' && activeProjectToReplace) {
      if (canSilentlyReplaceOnFree) {
        dispatch({
          type: 'resolve_project_limit_recovery',
          pending: {
            ...(state.pendingProjectCreation ?? {}),
            groupId: state.pendingProjectCreation?.groupId ?? activeProjectToReplace.groupId ?? auth.projectGroups[0]?.id,
            initialProjectName: state.pendingProjectCreation?.initialProjectName ?? 'Новый проект',
          },
        });
        useAuthStore.setState({ constraintDenial: null });
        return;
      }
    }

    void openLimitModal(constraintDenial).finally(() => {
      useAuthStore.setState({ constraintDenial: null });
    });
  }, [
    activeProjectToReplace,
    auth.projectGroups,
    canSilentlyReplaceOnFree,
    constraintDenial,
    openLimitModal,
    state.pendingProjectCreation,
  ]);

  useEffect(() => {
    if (hasShareToken) {
      setWorkspace({ kind: 'shared' });
      return;
    }

    const projectId = sessionProjectId ?? auth.project?.id;
    if (!auth.isAuthenticated || !projectId) {
      setWorkspace({ kind: 'guest' });
      return;
    }

    setWorkspace((current) => {
      if (current.kind === 'template') {
        return current;
      }
      if (forceProjectWorkspaceOnNextSessionRef.current === projectId) {
        forceProjectWorkspaceOnNextSessionRef.current = null;
        return { kind: 'project', projectId, chatOpen: false };
      }
      if (current.kind === 'project' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'planfact' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'finance' && current.projectId === projectId) {
        return current;
      }
      if (current.kind === 'planner' && current.projectId === projectId) {
        return current;
      }
      return getProjectWorkspaceMode(projectId, getProjectState);
    });
  }, [auth.isAuthenticated, auth.project?.id, forceProjectWorkspaceOnNextSessionRef, getProjectState, hasShareToken, sessionProjectId, setWorkspace]);

  useEffect(() => {
    setActiveEmptyProjectModeProjectId(null);
    if (preserveStartScreenPrefillOnNextSessionRef.current) {
      preserveStartScreenPrefillOnNextSessionRef.current = false;
      return;
    }
    dispatch({ type: 'set_start_screen_prefill_prompt', prompt: null });
  }, [preserveStartScreenPrefillOnNextSessionRef, sessionProjectId, setActiveEmptyProjectModeProjectId]);

  useEffect(() => {
    if (!templateCreateIntentId || !auth.isAuthenticated || hasShareToken) {
      return;
    }

    let cancelled = false;

    const openTemplateCreateModal = async () => {
      const publication = auth.isAuthenticated
        ? await fetchTemplatePublicationDetail(auth, templateCreateIntentId)
        : null;

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
    auth.refreshAccessToken,
    hasShareToken,
    onConsumeTemplateCreateIntent,
    openCreateProjectModal,
    templateCreateIntentId,
  ]);

  useEffect(() => {
    if (!projectCreationIntentId || !auth.isAuthenticated || hasShareToken) {
      return;
    }
    if (resolvingProjectIntentRef.current === projectCreationIntentId) {
      return;
    }

    let cancelled = false;
    resolvingProjectIntentRef.current = projectCreationIntentId;

    const startProjectIntentFlow = async () => {
      try {
        if (!auth.user) {
          onConsumeProjectCreationIntent();
          return;
        }

        const response = await fetchProjectIntent(auth, projectCreationIntentId);

        if (cancelled) {
          return;
        }

        if (response.status === 403) {
          try {
            const body = await response.json() as Partial<ConstraintDenialPayload>;
            if (isConstraintCode(body.code)) {
              await openLimitModal(body);
              onConsumeProjectCreationIntent();
              return;
            }
          } catch {
            // fall through
          }
        }

        if (response.status === 410) {
          window.alert('Черновик запроса устарел. Опишите проект ещё раз.');
          onConsumeProjectCreationIntent();
          return;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: null })) as { error?: string | null };
          window.alert(payload.error || 'Не удалось подготовить запрос. Попробуйте ещё раз.');
          onConsumeProjectCreationIntent();
          return;
        }

        const payload = await response.json() as ProjectIntentReadResponse;
        const prompt = payload.text.trim();
        if (!prompt) {
          onConsumeProjectCreationIntent();
          return;
        }

        await auth.refreshProjects();
        const latestAuthState = useAuthStore.getState();
        const latestProjects = latestAuthState.projects;
        const latestCurrentProject = latestAuthState.project;
        const reusableEmptyProject = latestProjects.find((project) => project.status === 'active' && project.taskCount === 0) ?? null;
        if (reusableEmptyProject && !isScheduleReadOnlyProject) {
          setActiveEmptyProjectModeProjectId(null);
          if (latestCurrentProject?.id !== reusableEmptyProject.id) {
            preserveStartScreenPrefillOnNextSessionRef.current = true;
            forceProjectWorkspaceOnNextSessionRef.current = reusableEmptyProject.id;
            await auth.switchProject(reusableEmptyProject.id);
          }
          dispatch({ type: 'project_intent_prefilled', prompt });
          setWorkspace({ kind: 'project', projectId: reusableEmptyProject.id, chatOpen: false });
          onConsumeProjectCreationIntent();
          return;
        }

        openCreateProjectModal({
          firstPrompt: prompt,
          groupId: latestCurrentProject?.groupId ?? latestAuthState.projectGroups[0]?.id,
          initialProjectName: 'Новый проект',
        });
        onConsumeProjectCreationIntent();
      } finally {
        resolvingProjectIntentRef.current = null;
      }
    };

    void startProjectIntentFlow();

    return () => {
      cancelled = true;
      if (resolvingProjectIntentRef.current === projectCreationIntentId) {
        resolvingProjectIntentRef.current = null;
      }
    };
  }, [
    auth.accessToken,
    auth.isAuthenticated,
    auth.projectGroups,
    auth.refreshAccessToken,
    auth.refreshProjects,
    auth.switchProject,
    auth.user,
    forceProjectWorkspaceOnNextSessionRef,
    hasShareToken,
    isScheduleReadOnlyProject,
    onConsumeProjectCreationIntent,
    openCreateProjectModal,
    openLimitModal,
    preserveStartScreenPrefillOnNextSessionRef,
    projectCreationIntentId,
    setActiveEmptyProjectModeProjectId,
    setWorkspace,
  ]);

  useEffect(() => {
    if (!projectOpenIntentId || !auth.isAuthenticated) {
      return;
    }

    if (auth.project?.id === projectOpenIntentId) {
      setWorkspace(getProjectWorkspaceMode(projectOpenIntentId, getProjectState));
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
  }, [auth.isAuthenticated, queuedPromptRef, submitChatMessage, workspace.kind]);

  useEffect(() => {
    if (!auth.isAuthenticated || hasShareToken || pendingPostAuthAction?.kind !== 'send_prompt') {
      return;
    }

    if (pendingPostAuthAction.sourceProjectState === 'non_empty') {
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
    queuedPromptRef,
    resetWorkspacePresentation,
    setPendingPostAuthAction,
    setWorkspace,
    workspace.kind,
  ]);

  return {
    deleteProjectDraft: state.deleteProjectDraft,
    showCreateProjectModal: state.showCreateProjectModal,
    pendingProjectCreation: state.pendingProjectCreation,
    startScreenPrefillPrompt: state.startScreenPrefillPrompt,
    createProjectAndActivate,
    openCreateProjectModal,
    closeCreateProjectModal,
    hideDeleteProjectModal: () => dispatch({ type: 'hide_delete_project_modal' }),
    handleConfirmDeleteProject,
    handleStartScreenSend,
    handleEmptyChart,
    handleCreateProject,
    handleSwitchProject,
    handleSwitchTemplate,
    handleArchiveProject,
    handleArchiveAndCreateProject,
    handleRestoreProject,
    handleDeleteProject,
    handleCreateProjectGroup,
    handleCreateProjectModalGroup,
    handleRenameProjectGroup,
    handleDeleteProjectGroup,
    handleCreateProjectModalSave,
  };
}
