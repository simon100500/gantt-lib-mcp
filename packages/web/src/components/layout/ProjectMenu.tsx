import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Eye, Link, LogOut, Menu } from 'lucide-react';

import { LoginButton } from '../LoginButton.tsx';
import { ProjectSwitcher } from '../ProjectSwitcher.tsx';
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
  onEditProject: (projectId: string, currentName: string) => Promise<void>;
  onEditGuestProject: (projectId: string, currentName: string) => Promise<void>;
  onSaveProjectName: (name: string) => Promise<void>;
  onCreateShareLink: () => Promise<void>;
  onLoginRequired: () => void;
}

export function ProjectMenu({
  children,
  error,
  hasShareToken,
  currentProjectLabel,
  onCreateProject,
  onSwitchProject,
  onEditProject,
  onEditGuestProject,
  onSaveProjectName,
  onCreateShareLink,
  onLoginRequired,
}: ProjectMenuProps) {
  const auth = useAuthStore();
  const localProjectName = useTaskStore((state) => state.projectName);
  const workspace = useUIStore((state) => state.workspace);
  const projectSidebarVisible = useUIStore((state) => state.projectSidebarVisible);
  const shareStatus = useUIStore((state) => state.shareStatus);
  const setProjectSidebarVisible = useUIStore((state) => state.setProjectSidebarVisible);
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
    <div className="flex h-screen overflow-hidden bg-background">
      {error && (
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-center p-2">
          <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-center text-xs text-destructive shadow-sm">
            {hasShareToken
              ? `Не удалось открыть ссылку: ${error}`
              : `Не удалось загрузить задачи: ${error}`}
          </div>
        </div>
      )}

      {!hasShareToken && (
        <aside
          className={cn(
            'flex h-full shrink-0 flex-col border-r border-slate-200 bg-background transition-all duration-300 ease-in-out',
            projectSidebarVisible ? 'w-60 opacity-100' : 'w-0 overflow-hidden opacity-0',
          )}
        >
          <div className="flex-1 overflow-y-auto p-4">
            {auth.isAuthenticated && auth.project ? (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={auth.projects}
                onSwitch={onSwitchProject}
                onCreateNew={() => void onCreateProject()}
                onEdit={workspace.kind === 'draft' ? undefined : onEditProject}
              />
            ) : (
              <ProjectSwitcher
                currentProject={currentProject}
                projects={[]}
                onSwitch={() => {}}
                onCreateNew={() => void onCreateProject()}
                onEdit={onEditGuestProject}
              />
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-12 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            type="button"
            onClick={() => setProjectSidebarVisible(!projectSidebarVisible)}
            aria-pressed={projectSidebarVisible}
            aria-label={hasShareToken ? 'Режим только чтения' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
            disabled={hasShareToken}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              hasShareToken
                ? 'cursor-default bg-slate-50 text-slate-300'
                : projectSidebarVisible
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
            title={hasShareToken ? 'Только чтение' : projectSidebarVisible ? 'Скрыть проекты' : 'Показать проекты'}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex select-none items-center gap-2 text-base font-cascadia tracking-tight">
            <img src="/favicon.svg" alt="GetGantt" className="h-5 w-5" />
            <span className="text-slate-900">ГетГант</span>
          </div>

          <span className="text-slate-400">/</span>

          <div className="flex min-w-0 items-center gap-2">
            {isRenamingProject && !hasShareToken ? (
              <input
                type="text"
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
                className="min-w-0 max-w-[220px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                onFocus={(event) => event.target.select()}
              />
            ) : (
              <span
                className={cn(
                  'truncate text-sm font-medium text-slate-700',
                  !hasShareToken && 'cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100',
                )}
                title={hasShareToken ? undefined : 'Нажмите, чтобы переименовать'}
                onClick={hasShareToken ? undefined : () => {
                  setRenameValue(currentProjectLabel ?? '');
                  setIsRenamingProject(true);
                }}
              >
                {currentProjectLabel}
              </span>
            )}

            {!hasShareToken && auth.isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onCreateShareLink()}
                disabled={shareStatus === 'creating'}
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs text-slate-600 hover:text-slate-900"
                title={
                  shareStatus === 'creating'
                    ? 'Создаём ссылку...'
                    : shareStatus === 'copied'
                      ? 'Ссылка скопирована'
                      : shareStatus === 'error'
                        ? 'Ошибка ссылки'
                        : 'Поделиться'
                }
              >
                {shareStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Link className="h-3.5 w-3.5" />}
                <span className="hidden lg:inline">{shareStatus === 'copied' ? 'Скопировано' : 'Поделиться'}</span>
              </Button>
            )}
          </div>

          <div className="flex-1" />

          {!hasShareToken && auth.isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onCreateProject()}
              className="hidden h-7 shrink-0 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary md:inline-flex"
            >
              + Новый проект
            </Button>
          )}

          {hasShareToken ? (
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
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
                  className="h-8 max-w-[180px] gap-1.5 px-2.5 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0 lg:max-w-[280px]"
                >
                  <span className="truncate text-slate-600">{auth.user?.email ?? 'Account'}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600" />
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
        </header>

        <div className="flex flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
