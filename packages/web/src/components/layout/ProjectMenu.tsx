import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CreditCard, Eye, LogOut, PanelRightClose, PanelRightOpen, Pencil, Plus, User } from 'lucide-react';

import type { GanttChartRef } from '../GanttChart';
import { LoginButton } from '../LoginButton.tsx';
import { ProjectSwitcher } from '../ProjectSwitcher.tsx';
import { TaskSearch } from '../TaskSearch';
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
import { useUIStore } from '../../stores/useUIStore.ts';
import type { SidebarMode } from '../../stores/useUIStore.ts';

interface ProjectMenuProps {
  children: ReactNode;
  error: string | null;
  hasShareToken: boolean;
  currentProjectLabel: string | undefined;
  onCreateProject: () => void | Promise<void>;
  onSwitchProject: (projectId: string) => void | Promise<void>;
  onSaveProjectName: (name: string) => Promise<void>;
  onCreateShareLink: () => Promise<void>;
  onLoginRequired: () => void;
  ganttRef: React.RefObject<GanttChartRef>;
}

export function ProjectMenu({
  children,
  error,
  hasShareToken,
  currentProjectLabel,
  onCreateProject,
  onSwitchProject,
  onSaveProjectName,
  onCreateShareLink,
  onLoginRequired,
  ganttRef,
}: ProjectMenuProps) {
  const auth = useAuthStore();
  const localProjectName = useTaskStore((state) => state.projectName);
  const workspace = useUIStore((state) => state.workspace);
  const sidebarState = useUIStore((state) => state.sidebarState);
  const setSidebarState = useUIStore((state) => state.setSidebarState);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const setShowBillingPage = useUIStore((state) => state.setShowBillingPage);
  const subscription = useBillingStore((state) => state.subscription);
  const fetchSubscription = useBillingStore((state) => state.fetchSubscription);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const showProjectContext = hasShareToken || (auth.isAuthenticated && workspace.kind !== 'draft');

  // Hover overlay debounce
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  const sidebarVisible = sidebarState === 'sidebar';
  const overlayVisible = sidebarState === 'overlay';

  useEffect(() => {
    if (auth.isAuthenticated) {
      void fetchSubscription();
    }
  }, [auth.isAuthenticated, fetchSubscription]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const currentProject = useMemo(() => {
    if (workspace.kind === 'draft') {
      return { id: 'draft', name: workspace.draftName, kind: 'draft' as const };
    }

    if (auth.isAuthenticated && auth.project) {
      return { ...auth.project, kind: 'project' as const };
    }

    return {
      id: 'demo',
      name: localProjectName || 'Мой проект',
      kind: 'project' as const,
    };
  }, [auth.isAuthenticated, auth.project, localProjectName, workspace]);

  const commitInlineRename = async () => {
    if (!isRenamingProject) {
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
      if (!isHoveringRef.current && useUIStore.getState().sidebarState === 'overlay') {
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

  const handleSwitchInOverlay = (id: string) => {
    void onSwitchProject(id);
    setSidebarState('closed');
  };

  const handleSwitchInSidebar = (id: string) => {
    void onSwitchProject(id);
    // Keep sidebar open in sidebar mode
  };

  // Compute whether toggle button should be hidden on desktop
  // Hidden only in sidebar mode (push), NOT in overlay mode
  const hideToggleOnDesktop = sidebarVisible;

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f4f5f7] text-slate-900">
      {error && (
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-center p-2">
          <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-center text-xs text-destructive shadow-sm">
            {hasShareToken
              ? `Не удалось открыть ссылку: ${error}`
              : `Не удалось загрузить задачи: ${error}`}
          </div>
        </div>
      )}

      {/* Mobile sidebar overlay backdrop */}
      {!hasShareToken && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          onClick={() => setSidebarState('closed')}
        />
      )}

      {/* Push sidebar (click mode) */}
      {!hasShareToken && (
        <aside
          className={cn(
            'flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-all duration-300 ease-in-out',
            'fixed inset-y-0 left-0 z-50 sm:relative sm:inset-auto',
            sidebarVisible ? 'w-full opacity-100 sm:w-60' : 'w-0 overflow-hidden opacity-0',
          )}
        >
          <div className="flex-1 min-h-0 pt-3">
            {auth.isAuthenticated && auth.project ? (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={auth.projects}
                onSwitch={handleSwitchInSidebar}
                onCreateNew={() => {
                  void onCreateProject();
                }}
                onClose={() => setSidebarState('closed')}
                isInline={true}
              />
            ) : (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={[]}
                onSwitch={() => { }}
                onCreateNew={() => {
                  void onCreateProject();
                }}
                onClose={() => setSidebarState('closed')}
                isInline={true}
              />
            )}
          </div>

          {auth.isAuthenticated && subscription && (
            <div className="shrink-0 border-t border-slate-200 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">
                  {PLAN_LABELS[(subscription.plan as keyof typeof PLAN_LABELS)] || subscription.plan}
                </span>
                <span className="text-xs text-slate-500">
                  {subscription.limits.projects === -1 ? '\u221e' : `${auth.projects.length}/${subscription.limits.projects}`} проектов
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowBillingPage(true)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <img src="/premium.svg" alt="" className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                Расширить
              </button>
            </div>
          )}
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[56px] items-center gap-2 overflow-hidden border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-2">
          {/* Toggle button: hover = overlay, click = push sidebar */}
          <button
            type="button"
            onClick={handleToggleClick}
            onMouseEnter={handleToggleMouseEnter}
            onMouseLeave={handleToggleMouseLeave}
            aria-pressed={sidebarState !== 'closed'}
            aria-label={hasShareToken ? 'Режим только чтения' : sidebarState !== 'closed' ? 'Скрыть проекты' : 'Показать проекты'}
            disabled={hasShareToken}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              hasShareToken
                ? 'cursor-default bg-slate-50 text-slate-300'
                : sidebarState !== 'closed'
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700',
              // Hide on desktop only in sidebar mode (push), not overlay
              hideToggleOnDesktop && 'sm:hidden',
            )}
            title={hasShareToken ? 'Только чтение' : sidebarState !== 'closed' ? 'Скрыть проекты' : 'Показать проекты'}
          >
            {sidebarVisible ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          </button>

          {/* Logo */}
          <a
            href="https://getgantt.ru"
            className={cn(
              'flex select-none items-center gap-2.5 text-base font-cascadia tracking-tight',
              hideToggleOnDesktop && 'sm:hidden'
            )}
          >
            <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
            <span className="hidden text-[15px] font-semibold text-slate-900 sm:inline">ГетГант</span>
            {showProjectContext && (
              <>
                <span className="text-slate-300 hidden sm:inline">/</span>
              </>
            )}
          </a>

          {showProjectContext && (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2.5">
                {isRenamingProject && !hasShareToken ? (
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
                ) : (
                  <>
                    <span
                      className={cn(
                        'truncate text-sm font-semibold font-cascadia tracking-tight text-slate-900',
                        !hasShareToken && 'cursor-pointer rounded-md px-1.5 py-1 -mx-1 hover:bg-slate-100',
                      )}
                      title={hasShareToken ? undefined : 'Нажмите, чтобы переименовать'}
                      onClick={hasShareToken ? undefined : () => {
                        setRenameValue(currentProjectLabel ?? '');
                        setIsRenamingProject(true);
                      }}
                    >
                      {currentProjectLabel}
                    </span>
                    {!hasShareToken && auth.isAuthenticated && workspace.kind !== 'draft' && (
                      <button
                        type="button"
                        onClick={() => setShowEditProjectModal(true)}
                        className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Переименовать проект"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
                {!hasShareToken && auth.isAuthenticated && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => void onCreateProject()}
                    className="hidden h-7 w-7 shrink-0 rounded-md border-slate-300 bg-white hover:bg-slate-50 sm:flex"
                    aria-label="Новый проект"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="hidden min-w-0 flex-1 px-4 lg:flex lg:px-8">
                <TaskSearch onTaskNavigate={(taskId) => ganttRef.current?.scrollToRow(taskId)} />
              </div>
            </>
          )}

          {/* User menu */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 max-w-[180px] gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0 hover:border-slate-200 hover:bg-slate-50 sm:max-w-[280px]"
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
                  <DropdownMenuItem onClick={() => window.location.href = '/purchase'} className="text-slate-700 focus:text-slate-900">
                    <img src="/premium.svg" alt="" className="mr-2 h-4 w-4 inline align-[-3px]" />
                    <span>Тарифы</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={auth.logout} className="text-red-600 focus:text-red-700">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Выйти</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Overlay panel (hover mode) — always rendered for smooth transition */}
        {!hasShareToken && (
          <div
            className={cn(
              'absolute top-[56px] left-0 z-50 w-60 flex flex-col bg-white border-r border-b border-slate-200 rounded-br-lg shadow-lg transition-transform duration-200 ease-in-out',
              overlayVisible ? 'translate-x-0' : '-translate-x-full pointer-events-none',
            )}
            onMouseEnter={handleOverlayMouseEnter}
            onMouseLeave={handleOverlayMouseLeave}
          >
            <div className="min-w-[240px]">
              {auth.isAuthenticated && auth.project ? (
                <ProjectSwitcher
                  currentProject={currentProject}
                  projects={auth.projects}
                  onSwitch={handleSwitchInOverlay}
                  onCreateNew={() => {
                    void onCreateProject();
                  }}
                  isInline={true}
                  hideHeader={true}
                />
              ) : (
                <ProjectSwitcher
                  currentProject={currentProject}
                  projects={[]}
                  onSwitch={() => { }}
                  onCreateNew={() => {
                    void onCreateProject();
                  }}
                  isInline={true}
                  hideHeader={true}
                />
              )}
            </div>

            {auth.isAuthenticated && subscription && (
              <div className="shrink-0 border-t border-slate-200 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    {PLAN_LABELS[(subscription.plan as keyof typeof PLAN_LABELS)] || subscription.plan}
                  </span>
                  <span className="text-xs text-slate-500">
                    {subscription.limits.projects === -1 ? '\u221e' : `${auth.projects.length}/${subscription.limits.projects}`} проектов
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBillingPage(true)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <img src="/premium.svg" alt="" className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                  Расширить
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden bg-[#f4f5f7]">
          {children}
        </div>
      </div>
    </div>
  );
}
