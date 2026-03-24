import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, LogOut, PanelRightClose, PanelRightOpen, Pencil, Plus, User } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import { useAuthStore } from '../../stores/useAuthStore.ts';
import { useTaskStore } from '../../stores/useTaskStore.ts';
import { useUIStore } from '../../stores/useUIStore.ts';

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
  const projectSidebarVisible = useUIStore((state) => state.projectSidebarVisible);
  const setProjectSidebarVisible = useUIStore((state) => state.setProjectSidebarVisible);
  const setShowEditProjectModal = useUIStore((state) => state.setShowEditProjectModal);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState('');

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

      {/* Mobile sidebar overlay */}
      {!hasShareToken && projectSidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          onClick={() => setProjectSidebarVisible(false)}
        />
      )}

      {!hasShareToken && (
        <aside
          className={cn(
            'flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out',
            'fixed inset-y-0 left-0 z-50 sm:relative sm:inset-auto',
            projectSidebarVisible ? 'w-full opacity-100 sm:w-60' : 'w-0 overflow-hidden opacity-0',
          )}
        >
          <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
            {auth.isAuthenticated && auth.project ? (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={auth.projects}
                onSwitch={(id) => {
                  void onSwitchProject(id);
                  setProjectSidebarVisible(false);
                }}
                onCreateNew={() => {
                  void onCreateProject();
                }}
                onClose={() => setProjectSidebarVisible(false)}
                isInline={true}
              />
            ) : (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={[]}
                onSwitch={() => {}}
                onCreateNew={() => {
                  void onCreateProject();
                }}
                onClose={() => setProjectSidebarVisible(false)}
                isInline={true}
              />
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[56px] items-center gap-2 overflow-hidden border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-5">
          {/* Кнопка меню - скрывается на десктопе когда сайдбар открыт */}
          <button
            type="button"
            onClick={() => setProjectSidebarVisible(!projectSidebarVisible)}
            aria-pressed={projectSidebarVisible}
            aria-label={hasShareToken ? 'Режим только чтения' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
            disabled={hasShareToken}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              hasShareToken
                ? 'cursor-default bg-slate-50 text-slate-300'
                : projectSidebarVisible
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700',
              // Скрываем на десктопе когда сайдбар открыт
              projectSidebarVisible && 'sm:hidden',
            )}
            title={hasShareToken ? 'Только чтение' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
          >
            {projectSidebarVisible ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          </button>

          {/* Логотип сервиса - остаётся всегда */}
          <a
            href="https://getgantt.ru"
            className={cn(
              'flex select-none items-center gap-2.5 text-base font-cascadia tracking-tight',
              projectSidebarVisible && 'sm:hidden'
            )}
          >
            <img src="/favicon.svg" alt="GetGantt" width="18" height="18" className="h-[18px] w-[18px]" />
            <span className="hidden text-[15px] font-semibold text-slate-900 sm:inline">ГетГант</span>
            {(auth.isAuthenticated || hasShareToken) && (
              <>
                <span className="text-slate-300 hidden sm:inline">/</span>
              </>
            )}
          </a>

          {(auth.isAuthenticated || hasShareToken) && (
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

          {/* Логин - всегда справа */}
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
                  <DropdownMenuItem onClick={auth.logout} className="text-red-600 focus:text-red-700">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Выйти</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden bg-[#f4f5f7]">
          {children}
        </div>
      </div>
    </div>
  );
}
