import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ChevronDown, Folder, Lock, MoreHorizontal, PanelRightOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import type { AuthProject } from '../stores/useAuthStore.ts';

interface ProjectSwitcherProps {
  currentProject: Pick<AuthProject, 'id' | 'name' | 'status' | 'taskCount'> & { kind?: 'project' | 'draft' };
  projects: AuthProject[];
  onSwitch: (projectId: string) => void | Promise<void>;
  onCreateNew: () => void;
  createDisabled?: boolean;
  createTitle?: string;
  projectsUsageLabel?: string | null;
  onArchive: (projectId: string) => void | Promise<void>;
  onRestore: (projectId: string) => void | Promise<void>;
  onDelete: (projectId: string) => void | Promise<void>;
  onOpenResourcePool?: () => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  footer?: ReactNode;
}

interface ProjectRowProps {
  project: AuthProject;
  isCurrent: boolean;
  menuActive: boolean;
  onSwitch: (projectId: string) => void | Promise<void>;
  onArchive: (projectId: string) => void | Promise<void>;
  onRestore: (projectId: string) => void | Promise<void>;
  onDelete: (projectId: string) => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
  setOpenMenuProjectId: (projectId: string | null) => void;
}

function ProjectRow({
  project,
  isCurrent,
  menuActive,
  onSwitch,
  onArchive,
  onRestore,
  onDelete,
  onMenuOpenChange,
  setOpenMenuProjectId,
}: ProjectRowProps) {
  const isArchived = project.status === 'archived';
  const taskCountLabel = project.taskCount === undefined
    ? '—'
    : project.taskCount > 0
      ? String(project.taskCount)
      : '';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md transition-colors',
        isCurrent ? 'bg-slate-100' : 'hover:bg-slate-100',
      )}
    >
      <button
        type="button"
        onClick={() => onSwitch(project.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isCurrent ? 'font-medium text-slate-900' : 'text-slate-700',
        )}
      >
        <span className={cn('flex items-center gap-1 truncate text-xs', isArchived && 'opacity-60')}>
          <span className="truncate">{project.name}</span>
          {isArchived && (
            <span title="Только для чтения">
              <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label="Только для чтения" />
            </span>
          )}
        </span>
        <span className="relative flex h-5 w-11 shrink-0 items-center justify-end">
          {taskCountLabel ? (
            <span className="pr-1 text-xs text-slate-400 transition-opacity group-hover:opacity-0">
              {taskCountLabel}
            </span>
          ) : null}

          <DropdownMenu
            onOpenChange={(open) => {
              setOpenMenuProjectId(open ? project.id : null);
              onMenuOpenChange?.(open);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  menuActive ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:bg-white hover:text-slate-700',
                  'opacity-0 group-hover:opacity-100',
                )}
                aria-label="Действия проекта"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-44">
              {!isArchived ? (
                <>
                  <DropdownMenuItem onClick={() => void onArchive(project.id)}>
                    <Archive className="h-4 w-4" />
                    <span>В архив</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void onDelete(project.id)} className="text-red-600 focus:text-red-700">
                    <Trash2 className="h-4 w-4" />
                    <span>Удалить</span>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => void onRestore(project.id)}>
                    <RotateCcw className="h-4 w-4" />
                    <span>Вернуть</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void onDelete(project.id)} className="text-red-600 focus:text-red-700">
                    <Trash2 className="h-4 w-4" />
                    <span>Удалить</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </button>
    </div>
  );
}

interface ProjectSectionProps {
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  onCreateNew?: () => void;
  createDisabled?: boolean;
  createTitle?: string;
  usageLabel?: string | null;
  children: ReactNode;
}

function ProjectSection({
  title,
  icon,
  open,
  onToggle,
  onCreateNew,
  createDisabled = false,
  createTitle,
  usageLabel,
  children,
}: ProjectSectionProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-slate-700">
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
            <span className="transition-opacity group-hover:opacity-0">
              {icon}
            </span>
            <ChevronDown className={cn('absolute inset-0 h-4 w-4 transition-all opacity-0 group-hover:opacity-100', open && 'rotate-180')} />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium">{title}</span>
            {usageLabel && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {usageLabel}
              </span>
            )}
          </span>
        </span>
        {onCreateNew ? (
          <button
            type="button"
            disabled={createDisabled}
            onClick={(event) => {
              event.stopPropagation();
              if (!createDisabled) {
                onCreateNew();
              }
            }}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors',
              createDisabled
                ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                : 'hover:bg-white hover:text-slate-700',
            )}
            aria-label="Новый проект"
            title={createTitle ?? 'Новый проект'}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}
      </button>
      {open && children}
    </div>
  );
}

export function ProjectSwitcher({
  currentProject,
  projects,
  onSwitch,
  onCreateNew,
  createDisabled = false,
  createTitle,
  projectsUsageLabel,
  onArchive,
  onRestore,
  onDelete,
  onOpenResourcePool,
  onMenuOpenChange,
  onClose,
  footer,
}: ProjectSwitcherProps) {
  const activeProjects = useMemo(() => projects.filter((project) => project.status !== 'archived'), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.status === 'archived'), [projects]);
  const [activeOpen, setActiveOpen] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(currentProject.status === 'archived');
  const prevArchivedCountRef = useRef(archivedProjects.length);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const selectedProjectId = pendingProjectId ?? currentProject.id;

  // Auto-open archive when new projects are archived (e.g. after trial rollback)
  useEffect(() => {
    if (archivedProjects.length > prevArchivedCountRef.current) {
      setArchiveOpen(true);
    }
    prevArchivedCountRef.current = archivedProjects.length;
  }, [archivedProjects.length]);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingProjectId && currentProject.id === pendingProjectId) {
      setPendingProjectId(null);
    }
  }, [currentProject.id, pendingProjectId]);

  useEffect(() => {
    if (pendingProjectId && !projects.some((project) => project.id === pendingProjectId)) {
      setPendingProjectId(null);
    }
  }, [pendingProjectId, projects]);

  const handleSwitch = async (projectId: string) => {
    if (projectId === selectedProjectId) {
      return;
    }

    setOpenMenuProjectId(null);
    onMenuOpenChange?.(false);
    setPendingProjectId(projectId);

    try {
      await onSwitch(projectId);
    } catch (error) {
      setPendingProjectId(null);
      throw error;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {onClose && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <button type="button" onClick={onCreateNew} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="GetGantt" width="20" height="20" className="h-5 w-5" />
            <span className="text-base font-cascadia font-semibold tracking-tight text-slate-900">ГетГант</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Свернуть"
            title="Свернуть"
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-1">
        <div className="flex flex-col gap-2">
          <ProjectSection
            title="Проекты"
            icon={<Folder className="h-4 w-4" />}
            open={activeOpen}
            onToggle={() => setActiveOpen((value) => !value)}
            onCreateNew={onCreateNew}
            createDisabled={createDisabled}
            createTitle={createTitle}
            usageLabel={projectsUsageLabel}
          >
            {activeProjects.length > 0 ? (
              activeProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isCurrent={project.id === selectedProjectId}
                  menuActive={openMenuProjectId === project.id}
                  onSwitch={handleSwitch}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  onMenuOpenChange={onMenuOpenChange}
                  setOpenMenuProjectId={setOpenMenuProjectId}
                />
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-slate-400">Нет активных проектов</p>
            )}
          </ProjectSection>

          <ProjectSection
            title="Архив"
            icon={<Archive className="h-4 w-4" />}
            open={archiveOpen}
            onToggle={() => setArchiveOpen((value) => !value)}
          >
            {archivedProjects.length > 0 ? (
              archivedProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isCurrent={project.id === selectedProjectId}
                  menuActive={openMenuProjectId === project.id}
                  onSwitch={handleSwitch}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  onMenuOpenChange={onMenuOpenChange}
                  setOpenMenuProjectId={setOpenMenuProjectId}
                />
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-slate-400">Архив пуст</p>
            )}
          </ProjectSection>

        </div>
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
