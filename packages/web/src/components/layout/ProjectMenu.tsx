import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartNoAxesGantt, ChevronDown, Eye, Landmark, MessageSquareText, Package, Gem, Lock, LogOut, PanelRightClose, PanelRightOpen, ShieldCheck, User } from 'lucide-react';

import type { GanttChartRef } from '../GanttChart';
import { LoginButton } from '../LoginButton.tsx';
import { ProjectSwitcher } from '../ProjectSwitcher.tsx';
import { TaskSearch } from '../TaskSearch';
import { FeedbackModal } from '../FeedbackModal.tsx';
import { Button } from '../ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { PLAN_LABELS } from '../../lib/billing';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useBillingStore } from '../../stores/useBillingStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import { useTemplateStore } from '../../stores/useTemplateStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';
import type { SidebarMode } from '../../stores/useUIStore.ts';

interface ProjectMenuProps {
  children: ReactNode;
  error: string | null;
  hasShareToken: boolean;
  isArchivedProject?: boolean;
  isReadOnlyProject?: boolean;
  currentProjectLabel: string | undefined;
  onCreateProject: (groupId?: string) => void | Promise<void>;
  createProjectDisabled?: boolean;
  createProjectTitle?: string;
  projectUsageLabel?: string | null;
  onSwitchProject: (projectId: string) => void | Promise<void>;
  onRenameProject?: (projectId: string, name: string) => void | Promise<void>;
  onMoveProject?: (projectId: string, groupId: string) => void | Promise<void>;
  onArchiveProject: (projectId: string) => void | Promise<void>;
  onRestoreProject: (projectId: string) => void | Promise<void>;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onSwitchTemplate?: (templateId: string) => void | Promise<void>;
  onRenameTemplate?: (templateId: string, name: string) => void | Promise<void>;
  onDeleteTemplate?: (templateId: string) => void | Promise<void>;
  onInsertTemplateToProject?: (templateId: string) => void | Promise<void>;
  onOpenInsertTemplateToProject?: () => void | Promise<void>;
  canInsertTemplateToProject?: boolean;
  onCreateProjectGroup?: (name: string) => void | Promise<void>;
  onRenameProjectGroup?: (groupId: string, name: string) => void | Promise<void>;
  onDeleteProjectGroup?: (groupId: string) => void | Promise<void>;
  canViewChartMode?: boolean;
  canViewResourcePool?: boolean;
  canViewFinance?: boolean;
  onOpenResourcePool?: () => void | Promise<void>;
  onOpenFinance?: () => void | Promise<void>;
  onOpenChartMode?: () => void | Promise<void>;
  onCreateProjectTemplate?: () => void | Promise<void>;
  onSaveProjectName: (name: string) => Promise<void>;
  onCreateShareLink: () => Promise<void>;
  onLoginRequired: () => void;
  ganttRef: React.RefObject<GanttChartRef>;
}

export function ProjectMenu({
  children,
  error,
  hasShareToken,
  isArchivedProject = false,
  isReadOnlyProject = false,
  currentProjectLabel,
  onCreateProject,
  createProjectDisabled = false,
  createProjectTitle,
  projectUsageLabel,
  onSwitchProject,
  onRenameProject,
  onMoveProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  onSwitchTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onInsertTemplateToProject,
  onOpenInsertTemplateToProject,
  canInsertTemplateToProject = false,
  onCreateProjectGroup,
  onRenameProjectGroup,
  onDeleteProjectGroup,
  canViewChartMode = true,
  canViewResourcePool = true,
  canViewFinance = true,
  onOpenResourcePool,
  onOpenFinance,
  onOpenChartMode,
  onCreateProjectTemplate,
  onSaveProjectName,
  onCreateShareLink,
  onLoginRequired,
  ganttRef,
}: ProjectMenuProps) {
  const auth = useAuthStore();
  const localProjectName = useTaskStore((state) => state.projectName);
  const tasksLoading = useTaskStore((state) => state.loading);
  const workspace = useUIStore((state) => state.workspace);
  const templates = useTemplateStore((state) => state.templates);
  const activeTemplate = useTemplateStore((state) => state.activeTemplate);
  const sidebarState = useUIStore((state) => state.sidebarState);
  const setSidebarState = useUIStore((state) => state.setSidebarState);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const setShowBillingPage = useUIStore((state) => state.setShowBillingPage);
  const subscription = useBillingStore((state) => state.subscription);
  const billingLoading = useBillingStore((state) => state.loading);
  const fetchSubscription = useBillingStore((state) => state.fetchSubscription);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [projectActionsMenuOpen, setProjectActionsMenuOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const showProjectContext = hasShareToken || (auth.isAuthenticated && workspace.kind !== 'draft');
  const isReadOnlyContext = hasShareToken || isReadOnlyProject;
  const shouldShowUpgradeButton = subscription?.plan === 'free';
  const canUseSidebar = auth.isAuthenticated && !hasShareToken;

  const billingFooter = auth.isAuthenticated ? (
    <div className="border-t border-slate-200 px-3 py-3">
      {billingLoading && !subscription ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 rounded bg-slate-200 animate-shimmer" />
            <div className="h-3 w-16 rounded bg-slate-200 animate-shimmer" />
          </div>
          <div className="h-8 w-full rounded-lg bg-slate-200 animate-shimmer" />
        </div>
      ) : subscription ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">
              {PLAN_LABELS[(subscription.plan as keyof typeof PLAN_LABELS)] || subscription.plan}
            </span>
            <span className="text-xs text-slate-500">
              {subscription.remaining.projects?.remainingState === 'unlimited'
                ? '\u221e'
                : subscription.usage.projects?.usageState === 'tracked' && subscription.remaining.projects?.remainingState === 'tracked'
                  ? `${subscription.usage.projects.used}/${subscription.usage.projects.limit}`
                  : `${auth.projects.length}`} проектов
            </span>
          </div>
          {shouldShowUpgradeButton && (
            <button
              type="button"
              onClick={() => setShowBillingPage(true)}
              className="mt-2 flex w-full items-center justify-center rounded-lg border border-primary/35 bg-white px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            >
              <Gem className="mr-1.5 h-3.5 w-3.5" />
              Расширить
            </button>
          )}
        </>
      ) : null}
    </div>
  ) : null;

  // Hover overlay debounce
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  const sidebarVisible = sidebarState === 'sidebar';
  const overlayVisible = sidebarState === 'overlay';
  const showHeaderLogo = hasShareToken || !auth.isAuthenticated || !sidebarVisible;

  useEffect(() => {
    if (auth.isAuthenticated) {
      void fetchSubscription();
    }
  }, [auth.isAuthenticated, fetchSubscription]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.accessToken) {
      setHasAdminAccess(false);
      return;
    }

    let cancelled = false;

    const loadAdminAccess = async () => {
      const doFetch = async (token: string) => fetch('/api/admin/access', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      let response = await doFetch(auth.accessToken!);

      if (response.status === 401) {
        const refreshedToken = await useAuthStore.getState().refreshAccessToken();
        if (!refreshedToken) {
          if (!cancelled) {
            setHasAdminAccess(false);
          }
          return;
        }
        response = await doFetch(refreshedToken);
      }

      if (!response.ok) {
        if (!cancelled) {
          setHasAdminAccess(false);
        }
        return;
      }

      const data = await response.json() as { isAdmin?: boolean };
      if (!cancelled) {
        setHasAdminAccess(Boolean(data.isAdmin));
      }
    };

    void loadAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [auth.accessToken, auth.isAuthenticated]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!projectActionsMenuOpen || hoverTimeoutRef.current === null) {
      return;
    }

    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = null;
  }, [projectActionsMenuOpen]);

  const currentProject = useMemo(() => {
    if (workspace.kind === 'draft') {
      return { id: 'draft', groupId: auth.project?.groupId ?? '', name: workspace.draftName, status: 'active' as const, kind: 'draft' as const };
    }

    if (workspace.kind === 'template') {
      return {
        id: workspace.templateId,
        groupId: auth.project?.groupId ?? '',
        name: activeTemplate?.metadata.name ?? 'Шаблон',
        status: 'active' as const,
        kind: 'template' as const,
      };
    }

    if (auth.isAuthenticated && auth.project) {
      return { ...auth.project, kind: 'project' as const };
    }

    return {
      id: 'demo',
      groupId: auth.project?.groupId ?? '',
      name: localProjectName || 'Мой проект',
      status: 'active' as const,
      kind: 'project' as const,
    };
  }, [activeTemplate?.metadata.name, auth.isAuthenticated, auth.project, localProjectName, workspace]);

  const commitInlineRename = async () => {
    if (!isRenamingProject || isArchivedProject) {
      return;
    }

    setIsRenamingProject(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === currentProjectLabel) {
      return;
    }

    try {
      await onSaveProjectName(trimmed);
    } catch {
      setRenameValue('');
    }
  };

  const startCloseTimer = () => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      hoverTimeoutRef.current = null;
      if (!isHoveringRef.current && !projectActionsMenuOpen && useUIStore.getState().sidebarState === 'overlay') {
        setSidebarState('closed');
      }
    }, 300);
  };

  const handleToggleMouseEnter = () => {
    isHoveringRef.current = true;
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (sidebarState === 'closed') {
      setSidebarState('overlay');
    }
  };

  const handleToggleMouseLeave = () => {
    isHoveringRef.current = false;
    startCloseTimer();
  };

  const handleToggleClick = () => {
    // Clear any pending hover timeout
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (sidebarState === 'closed') {
      setSidebarState('sidebar');
    } else if (sidebarState === 'sidebar') {
      setSidebarState('closed');
    } else if (sidebarState === 'overlay') {
      // Promote overlay to persistent sidebar
      setSidebarState('sidebar');
    }
  };

  const handleOverlayMouseEnter = () => {
    isHoveringRef.current = true;
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleOverlayMouseLeave = () => {
    isHoveringRef.current = false;
    startCloseTimer();
  };

  const handleSwitchInOverlay = async (id: string) => {
    await onSwitchProject(id);
    setSidebarState('closed');
  };

  const handleSwitchInSidebar = async (id: string) => {
    if (window.innerWidth < 640) {
      setSidebarState('closed');
    }
    await onSwitchProject(id);
  };

  const handleReadOnlyNewProject = async () => {
    if (!auth.isAuthenticated) {
      onLoginRequired();
      return;
    }

    if (hasShareToken) {
      window.location.assign(window.location.origin);
      return;
    }

    await onCreateProject();
  };

  // Compute whether toggle button should be hidden on desktop
  // Hidden only in sidebar mode (push), NOT in overlay mode
  const hideToggleOnDesktop = sidebarVisible;

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f4f5f7] text-slate-900">
      {error && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex items-center justify-center p-2">
          <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-center text-xs text-destructive shadow-sm">
            {hasShareToken
              ? `Не удалось открыть ссылку: ${error}`
              : `Не удалось загрузить задачи: ${error}`}
          </div>
        </div>
      )}

      {/* Mobile sidebar overlay backdrop */}
      {canUseSidebar && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          onClick={() => setSidebarState('closed')}
        />
      )}

      {/* Push sidebar (click mode) */}
      {canUseSidebar && (
        <aside
          className={cn(
            'flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white',
            'fixed inset-y-0 left-0 z-50 sm:relative sm:inset-auto',
            sidebarVisible ? 'w-full opacity-100 sm:w-60' : 'w-0 overflow-hidden opacity-0 border-r-0',
          )}
        >
          <ProjectSwitcher
            currentProject={currentProject}
            projects={auth.isAuthenticated && auth.project ? auth.projects : []}
            templates={templates}
            projectGroups={auth.projectGroups}
            onSwitch={handleSwitchInSidebar}
            onSwitchTemplate={onSwitchTemplate}
            onCreateNew={(groupId) => { void onCreateProject(groupId); }}
            onCreateGroup={onCreateProjectGroup}
            onRenameGroup={onRenameProjectGroup}
            onDeleteGroup={onDeleteProjectGroup}
            onRenameProject={onRenameProject}
            onMoveProject={onMoveProject}
            createDisabled={createProjectDisabled}
            createTitle={createProjectTitle}
            projectsUsageLabel={projectUsageLabel}
            onArchive={(projectId) => { void onArchiveProject(projectId); }}
            onRestore={(projectId) => { void onRestoreProject(projectId); }}
            onDelete={(projectId) => { void onDeleteProject(projectId); }}
            onRenameTemplate={onRenameTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onInsertTemplateToProject={onInsertTemplateToProject}
            canInsertTemplateToProject={canInsertTemplateToProject}
            onOpenResourcePool={onOpenResourcePool}
            onMenuOpenChange={setProjectActionsMenuOpen}
            onClose={() => setSidebarState('closed')}
            footer={billingFooter}
          />
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[56px] items-center gap-2 overflow-hidden border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-4 lg:px-6">
          {/* Toggle button: hover = overlay, click = push sidebar */}
          {canUseSidebar && (
            <button
              type="button"
              onClick={handleToggleClick}
              onMouseEnter={handleToggleMouseEnter}
              onMouseLeave={handleToggleMouseLeave}
              aria-pressed={sidebarState !== 'closed'}
              aria-label={sidebarState !== 'closed' ? 'Скрыть проекты' : 'Показать проекты'}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                sidebarState !== 'closed'
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700',
                hideToggleOnDesktop && 'sm:hidden',
              )}
              title={sidebarState !== 'closed' ? 'Скрыть проекты' : 'Показать проекты'}
            >
              {sidebarVisible ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
            </button>
          )}

          {showHeaderLogo && (
            <button
              type="button"
              onClick={() => void onCreateProject()}
              className="flex select-none items-center gap-2.5 text-base tracking-tight"
            >
              <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
              <span className="text-[15px] font-semibold text-slate-900 hidden sm:inline">ГетГант</span>
              {showProjectContext && (
                <>
                  <span className="text-slate-300 hidden sm:inline">/</span>
                </>
              )}
            </button>
          )}

          {showProjectContext && (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2.5">
                {isRenamingProject && !hasShareToken && !isArchivedProject ? (
                  <input
                    type="text"
                    name="project-name"
                    autoComplete="off"
                    spellCheck={false}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => { void commitInlineRename(); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void commitInlineRename();
                      } else if (event.key === 'Escape') {
                        setIsRenamingProject(false);
                        setRenameValue('');
                      }
                    }}
                    className="min-w-0 max-w-[120px] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[240px]"
                    autoFocus
                    onFocus={(event) => event.target.select()}
                  />
                ) : tasksLoading ? (
                  <div className="h-5 w-32 animate-shimmer rounded bg-slate-200" />
                ) : (
                  <>
                    {isArchivedProject && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Только чтение" />
                    )}
                    <span
                      className={cn(
                        'truncate text-sm font-semibold tracking-tight text-slate-900',
                        !hasShareToken && !isArchivedProject && 'cursor-pointer rounded-md px-1.5 py-1 -mx-1 hover:bg-slate-100',
                      )}
                      title={hasShareToken ? undefined : isArchivedProject ? 'Проект в архиве доступен только для чтения' : 'Нажмите, чтобы переименовать'}
                      onClick={hasShareToken || isArchivedProject ? undefined : () => {
                        setRenameValue(currentProjectLabel ?? '');
                        setIsRenamingProject(true);
                      }}
                    >
                      {currentProjectLabel}
                    </span>
                  </>
                )}
                {!hasShareToken && auth.isAuthenticated && projectUsageLabel && (
                  <div className="hidden items-center gap-2 sm:flex">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {projectUsageLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="hidden min-w-0 flex-1 self-stretch grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 px-4 lg:grid lg:px-6">
                <div className="flex self-stretch justify-self-start">
                  {!hasShareToken && auth.isAuthenticated && workspace.kind !== 'template' && (canViewChartMode || canViewResourcePool || canViewFinance) && (
                    <div
                      className="inline-flex h-full shrink-0 items-stretch gap-4"
                      data-testid="topbar-workspace-mode-switch"
                      role="tablist"
                      aria-label="Режим проекта"
                    >
                      {canViewChartMode && (
                      <button
                        type="button"
                        onClick={() => { void onOpenChartMode?.(); }}
                        className={cn(
                          'relative -mb-px inline-flex h-full items-center gap-1.5 border-b-2 bg-transparent px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          workspace.kind === 'planner' || workspace.kind === 'finance'
                            ? 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                            : 'border-primary text-primary',
                        )}
                        data-testid="topbar-mode-chart"
                        role="tab"
                        aria-selected={workspace.kind !== 'planner' && workspace.kind !== 'finance'}
                      >
                        <span>График</span>
                      </button>
                      )}
                      {canViewResourcePool && (
                      <button
                        type="button"
                        onClick={() => { void onOpenResourcePool?.(); }}
                        className={cn(
                          'relative -mb-px inline-flex h-full items-center gap-1.5 border-b-2 bg-transparent px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          workspace.kind === 'planner'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                        )}
                        data-testid="topbar-mode-resources"
                        role="tab"
                        aria-selected={workspace.kind === 'planner'}
                      >
                        <span>Ресурсы</span>
                      </button>
                      )}
                      {canViewFinance && (
                      <button
                        type="button"
                        onClick={() => { void onOpenFinance?.(); }}
                        className={cn(
                          'relative -mb-px inline-flex h-full items-center gap-1.5 border-b-2 bg-transparent px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          workspace.kind === 'finance'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                        )}
                        data-testid="topbar-mode-finance"
                        role="tab"
                        aria-selected={workspace.kind === 'finance'}
                      >
                        <span>Финансы</span>
                      </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 justify-self-center w-full max-w-xl">
                  <TaskSearch
                    onTaskNavigate={(taskId) => ganttRef.current?.scrollToRow(taskId)}
                    readOnly={isReadOnlyContext}
                  />
                </div>
                <div className="justify-self-end">
                  {isReadOnlyContext && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => { void handleReadOnlyNewProject(); }}
                      className="h-8 shrink-0 rounded-md px-3 text-sm font-medium"
                    >
                      Новый проект
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* User menu */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {!hasShareToken && auth.isAuthenticated && workspace.kind !== 'template' && (canViewChartMode || canViewResourcePool || canViewFinance) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
                    data-testid="topbar-workspace-mode-switch-mobile"
                  >
                    {workspace.kind === 'planner' ? (
                      <Package className="h-3.5 w-3.5 text-primary" />
                    ) : workspace.kind === 'finance' ? (
                      <Landmark className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <ChartNoAxesGantt className="h-3.5 w-3.5 text-primary" />
                    )}
                    <span>{workspace.kind === 'planner' ? 'Ресурсы' : workspace.kind === 'finance' ? 'Финансы' : 'Гант'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 lg:hidden">
                  {canViewChartMode && (
                  <DropdownMenuItem
                    onClick={() => { void onOpenChartMode?.(); }}
                    className={cn(
                      'gap-2 text-slate-700 focus:text-slate-900',
                      workspace.kind !== 'planner' && workspace.kind !== 'finance' && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary',
                    )}
                    data-testid="topbar-mode-chart-mobile"
                  >
                    <ChartNoAxesGantt className="h-4 w-4" />
                    <span>Гант</span>
                  </DropdownMenuItem>
                  )}
                  {canViewResourcePool && (
                  <DropdownMenuItem
                    onClick={() => { void onOpenResourcePool?.(); }}
                    className={cn(
                      'gap-2 text-slate-700 focus:text-slate-900',
                      workspace.kind === 'planner' && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary',
                    )}
                    data-testid="topbar-mode-resources-mobile"
                  >
                    <Package className="h-4 w-4" />
                    <span>Ресурсы</span>
                  </DropdownMenuItem>
                  )}
                  {canViewFinance && (
                  <DropdownMenuItem
                    onClick={() => { void onOpenFinance?.(); }}
                    className={cn(
                      'gap-2 text-slate-700 focus:text-slate-900',
                      workspace.kind === 'finance' && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary',
                    )}
                    data-testid="topbar-mode-finance-mobile"
                  >
                    <Landmark className="h-4 w-4" />
                    <span>Финансы</span>
                  </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {hasShareToken ? (
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <Eye className="h-3.5 w-3.5" />
                Только чтение
              </div>
            ) : !auth.isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-sm font-medium text-slate-600 lg:inline">
                  Войдите, чтобы сохранить график
                </span>
                <LoginButton onClick={onLoginRequired} />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-primary hover:underline"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className="hidden sm:inline">Обратная связь</span>
                </button>
                {shouldShowUpgradeButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBillingPage(true)}
                    className="h-8 shrink-0 rounded-md border-primary/35 bg-white px-3 text-sm font-medium text-primary hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  >
                    <Gem className="h-4 w-4" />
                    <span>Расширить</span>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 max-w-[180px] gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0 hover:border-slate-200 hover:bg-slate-50 sm:max-w-[280px]"
                    >
                      <User className="h-4 w-4 shrink-0 text-slate-600 lg:hidden" />
                      <span className="hidden truncate text-slate-600 lg:inline">{auth.user?.email ?? 'Account'}</span>
                      <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-600 lg:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="truncate text-slate-700">
                      {auth.user?.email ?? 'Account'}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowBillingPage(true)} className="text-slate-700 focus:text-slate-900">
                      <User className="mr-2 h-4 w-4" />
                      <span>Аккаунт</span>
                    </DropdownMenuItem>
                    {hasAdminAccess && (
                      <DropdownMenuItem onClick={() => { window.open('/admin', '_blank', 'noopener,noreferrer'); }} className="text-slate-700 focus:text-slate-900">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Админка</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => window.location.href = '/purchase'} className="text-slate-700 focus:text-slate-900">
                      <Gem className="mr-2 h-4 w-4" />
                      <span>Тарифы</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={auth.logout} className="text-red-600 focus:text-red-700">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Выйти</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </header>

        {/* Overlay panel (hover mode) — only rendered when overlay or closed, hidden by transform */}
        {canUseSidebar && !sidebarVisible && (
          <div
            className={cn(
              'absolute top-[56px] bottom-0 left-0 z-50 w-60 flex flex-col bg-white border-r border-slate-200 shadow-lg transition-transform duration-200 ease-in-out',
              overlayVisible ? 'translate-x-0' : '-translate-x-full pointer-events-none',
            )}
            onMouseEnter={handleOverlayMouseEnter}
            onMouseLeave={handleOverlayMouseLeave}
          >
            <ProjectSwitcher
              currentProject={currentProject}
              projects={auth.isAuthenticated && auth.project ? auth.projects : []}
              templates={templates}
              projectGroups={auth.projectGroups}
              onSwitch={handleSwitchInOverlay}
              onSwitchTemplate={onSwitchTemplate}
              onCreateNew={(groupId) => { void onCreateProject(groupId); }}
              onCreateGroup={onCreateProjectGroup}
              onRenameGroup={onRenameProjectGroup}
              onDeleteGroup={onDeleteProjectGroup}
              onRenameProject={onRenameProject}
              onMoveProject={onMoveProject}
              createDisabled={createProjectDisabled}
              createTitle={createProjectTitle}
              projectsUsageLabel={projectUsageLabel}
              onArchive={(projectId) => { void onArchiveProject(projectId); }}
              onRestore={(projectId) => { void onRestoreProject(projectId); }}
              onDelete={(projectId) => { void onDeleteProject(projectId); }}
              onRenameTemplate={onRenameTemplate}
              onDeleteTemplate={onDeleteTemplate}
              onInsertTemplateToProject={onInsertTemplateToProject}
              canInsertTemplateToProject={canInsertTemplateToProject}
              onOpenResourcePool={onOpenResourcePool}
              onMenuOpenChange={setProjectActionsMenuOpen}
              footer={billingFooter}
            />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden bg-[#f4f5f7]">
          {children}
        </div>
      </div>
      <FeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        projectName={currentProjectLabel ?? currentProject?.name ?? null}
      />
    </div>
  );
}
