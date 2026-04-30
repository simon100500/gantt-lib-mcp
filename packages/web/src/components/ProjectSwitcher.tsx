import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ChevronDown, Folder, Lock, MoreHorizontal, PanelRightOpen, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import type { AuthProject } from '../stores/useAuthStore.ts';
import type { ProjectGroup } from '../types.ts';

interface ProjectSwitcherProps {
  currentProject: Pick<AuthProject, 'id' | 'name' | 'status' | 'taskCount' | 'groupId'> & { kind?: 'project' | 'draft' };
  projects: AuthProject[];
  projectGroups?: ProjectGroup[];
  onSwitch: (projectId: string) => void | Promise<void>;
  onCreateNew: (groupId?: string) => void;
  onCreateGroup?: () => void | Promise<void>;
  onRenameGroup?: (groupId: string, name: string) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
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

function ProjectRow({ project, isCurrent, menuActive, onSwitch, onArchive, onRestore, onDelete, onMenuOpenChange, setOpenMenuProjectId }: ProjectRowProps) {
  const isArchived = project.status === 'archived';
  const taskCountLabel = project.taskCount === undefined ? '—' : project.taskCount > 0 ? String(project.taskCount) : '';

  return (
    <div className={cn('group flex items-center rounded-md transition-colors', isCurrent ? 'bg-slate-100' : 'hover:bg-slate-100')}>
      <button
        type="button"
        onClick={() => onSwitch(project.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2',
          isCurrent ? 'font-medium text-slate-900' : 'text-slate-700',
        )}
      >
        <span className={cn('flex items-center gap-1 truncate text-sm sm:text-xs', isArchived && 'opacity-60')}>
          <span className="truncate">{project.name}</span>
          {isArchived && (
            <span title="Только для чтения">
              <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label="Только для чтения" />
            </span>
          )}
        </span>
      </button>

      <div className="relative mr-2 flex h-5 w-11 shrink-0 items-center justify-end">
        {taskCountLabel ? <span className="pr-1 text-xs text-slate-400 transition-opacity group-hover:opacity-0">{taskCountLabel}</span> : null}
        <DropdownMenu
          onOpenChange={(open) => {
            setOpenMenuProjectId(open ? project.id : null);
            onMenuOpenChange?.(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
      </div>
    </div>
  );
}

interface ProjectSectionProps {
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  usageLabel?: string | null;
  group?: ProjectGroup;
  projectCount?: number;
  onCreateProject?: (groupId?: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
  children: ReactNode;
}

function ProjectSection({ title, icon, open, onToggle, usageLabel, group, projectCount = 0, onCreateProject, onRenameGroup, onDeleteGroup, children }: ProjectSectionProps) {
  const canDeleteGroup = Boolean(group && !group.isDefault && projectCount === 0 && onDeleteGroup);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
            <span className="transition-opacity group-hover:opacity-0">{icon}</span>
            <ChevronDown className={cn('absolute inset-0 h-4 w-4 transition-all opacity-0 group-hover:opacity-100', open && 'rotate-180')} />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium sm:text-xs">{title}</span>
            {usageLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{usageLabel}</span>}
          </span>
        </button>

        {group && (onCreateProject || onRenameGroup || canDeleteGroup) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-slate-400 opacity-0 transition-all hover:bg-white hover:text-slate-700 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Действия группы"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-48">
              {onCreateProject && (
                <DropdownMenuItem onClick={() => onCreateProject(group.id)}>
                  <Plus className="h-4 w-4" />
                  <span>Новый проект</span>
                </DropdownMenuItem>
              )}
              {onRenameGroup && (
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt('Название группы', group.name)?.trim();
                  if (name && name !== group.name) void onRenameGroup(group.id, name);
                }}>
                  <Pencil className="h-4 w-4" />
                  <span>Переименовать</span>
                </DropdownMenuItem>
              )}
              {canDeleteGroup && (
                <DropdownMenuItem onClick={() => void onDeleteGroup?.(group.id)} className="text-red-600 focus:text-red-700">
                  <Trash2 className="h-4 w-4" />
                  <span>Удалить</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <span className="h-6 w-6 shrink-0" />}
      </div>
      {open && <div className="pl-1.5">{children}</div>}
    </div>
  );
}

export function ProjectSwitcher({
  currentProject,
  projects,
  projectGroups = [],
  onSwitch,
  onCreateNew,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  createDisabled = false,
  createTitle,
  projectsUsageLabel,
  onArchive,
  onRestore,
  onDelete,
  onMenuOpenChange,
  onClose,
  footer,
}: ProjectSwitcherProps) {
  const activeProjects = useMemo(() => projects.filter((project) => project.status !== 'archived'), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.status === 'archived'), [projects]);
  const archiveTitle = archivedProjects.length > 0 ? `Архив (${archivedProjects.length})` : 'Архив';
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [archiveOpen, setArchiveOpen] = useState(currentProject.status === 'archived');
  const prevArchivedCountRef = useRef(archivedProjects.length);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const selectedProjectId = pendingProjectId ?? currentProject.id;
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  const effectiveGroups = useMemo<ProjectGroup[]>(() => {
    if (projectGroups.length > 0) return projectGroups;
    const fallbackGroupId = activeProjects[0]?.groupId ?? currentProject.groupId ?? 'default';
    return [{
      id: fallbackGroupId,
      userId: '',
      name: 'Проекты',
      isDefault: true,
      createdAt: '',
      updatedAt: '',
      projectCount: activeProjects.length,
    }];
  }, [activeProjects, currentProject.groupId, projectGroups]);

  const activeProjectsByGroup = useMemo(() => {
    const map = new Map<string, AuthProject[]>();
    for (const group of effectiveGroups) map.set(group.id, []);
    for (const project of activeProjects) {
      const groupId = project.groupId || effectiveGroups[0]?.id;
      if (!groupId) continue;
      const bucket = map.get(groupId) ?? [];
      bucket.push(project);
      map.set(groupId, bucket);
    }
    return map;
  }, [activeProjects, effectiveGroups]);

  const defaultCreateGroupId = currentProject.kind === 'project'
    ? projects.find((project) => project.id === currentProject.id)?.groupId ?? currentProject.groupId
    : effectiveGroups.find((group) => group.isDefault)?.id ?? effectiveGroups[0]?.id;

  useEffect(() => {
    setOpenGroupIds((current) => {
      const next = new Set(current);
      for (const group of effectiveGroups) {
        if (group.isDefault || group.id === defaultCreateGroupId) next.add(group.id);
      }
      return next;
    });
  }, [defaultCreateGroupId, effectiveGroups]);

  useEffect(() => {
    if (archivedProjects.length > prevArchivedCountRef.current) setArchiveOpen(true);
    prevArchivedCountRef.current = archivedProjects.length;
  }, [archivedProjects.length]);

  useEffect(() => {
    if (pendingProjectId && currentProject.id === pendingProjectId) setPendingProjectId(null);
  }, [currentProject.id, pendingProjectId]);

  useEffect(() => {
    if (pendingProjectId && !projects.some((project) => project.id === pendingProjectId)) setPendingProjectId(null);
  }, [pendingProjectId, projects]);

  const handleSwitch = async (projectId: string) => {
    if (projectId === selectedProjectId) return;
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

  const toggleGroup = (groupId: string) => {
    setOpenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {onClose && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <button type="button" onClick={() => onCreateNew(defaultCreateGroupId)} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="GetGantt" width="20" height="20" className="h-5 w-5" />
            <span className="text-base font-semibold tracking-tight text-slate-900">ГетГант</span>
          </button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Свернуть" title="Свернуть">
            <PanelRightOpen className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="shrink-0 px-3 pt-1 pb-2">
        <Button
          variant="default"
          size="sm"
          disabled={createDisabled}
          onClick={() => { if (!createDisabled) onCreateNew(defaultCreateGroupId); }}
          className="h-8 w-full rounded-md px-3 text-sm font-medium sm:h-8"
          title={createTitle ?? 'Новый проект'}
        >
          <Plus className="h-4 w-4" />
          <span>Новый проект</span>
        </Button>
      </div>

      {onCreateGroup && (
        <div className="shrink-0 px-3 pb-2">
          <Button variant="outline" size="sm" onClick={() => { void onCreateGroup(); }} className="h-8 w-full rounded-md px-3 text-sm font-medium sm:h-8">
            <Plus className="h-4 w-4" />
            <span>Новая группа</span>
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-2">
        <div className="flex flex-col gap-2">
          {effectiveGroups.map((group) => {
            const groupProjects = activeProjectsByGroup.get(group.id) ?? [];
            const open = openGroupIds.has(group.id);
            if (groupProjects.length === 0 && !group.isDefault) {
              return (
                <ProjectSection key={group.id} title={group.name} icon={<Folder className="h-4 w-4" />} open={open} onToggle={() => toggleGroup(group.id)} group={group} projectCount={0} onCreateProject={onCreateNew} onRenameGroup={onRenameGroup} onDeleteGroup={onDeleteGroup}>
                  <div className="px-3 py-2 text-xs text-slate-400">Нет проектов</div>
                </ProjectSection>
              );
            }
            if (groupProjects.length === 0) return null;
            return (
              <ProjectSection
                key={group.id}
                title={`${group.name} (${groupProjects.length})`}
                icon={<Folder className="h-4 w-4" />}
                open={open}
                onToggle={() => toggleGroup(group.id)}
                usageLabel={group.isDefault ? projectsUsageLabel : null}
                group={group}
                projectCount={groupProjects.length}
                onCreateProject={onCreateNew}
                onRenameGroup={onRenameGroup}
                onDeleteGroup={onDeleteGroup}
              >
                {groupProjects.map((project) => (
                  <ProjectRow key={project.id} project={project} isCurrent={project.id === selectedProjectId} menuActive={openMenuProjectId === project.id} onSwitch={handleSwitch} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onMenuOpenChange={onMenuOpenChange} setOpenMenuProjectId={setOpenMenuProjectId} />
                ))}
              </ProjectSection>
            );
          })}

          {archivedProjects.length > 0 ? (
            <ProjectSection title={archiveTitle} icon={<Archive className="h-4 w-4" />} open={archiveOpen} onToggle={() => setArchiveOpen((value) => !value)}>
              {archivedProjects.map((project) => (
                <ProjectRow key={project.id} project={project} isCurrent={project.id === selectedProjectId} menuActive={openMenuProjectId === project.id} onSwitch={handleSwitch} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onMenuOpenChange={onMenuOpenChange} setOpenMenuProjectId={setOpenMenuProjectId} />
              ))}
            </ProjectSection>
          ) : null}
        </div>
        <div className="h-16 shrink-0" />
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
