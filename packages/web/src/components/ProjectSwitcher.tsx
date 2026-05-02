import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArrowRightLeft, ChevronDown, Folder, Lock, MoreHorizontal, PanelRightOpen, Pencil, Plus, RotateCcw, ToyBrick, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeleteProjectGroupModal } from './DeleteProjectGroupModal.tsx';
import { EditProjectModal } from './EditProjectModal.tsx';
import { MoveProjectModal } from './MoveProjectModal.tsx';
import { ProjectGroupModal } from './ProjectGroupModal.tsx';
import { Button } from './ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import type { AuthProject } from '../stores/useAuthStore.ts';
import type { ProjectGroup } from '../types.ts';
import type { TemplateItem } from '../lib/apiTypes.ts';

interface ProjectSwitcherProps {
  currentProject: Pick<AuthProject, 'id' | 'name' | 'status' | 'taskCount' | 'groupId'> & { kind?: 'project' | 'draft' | 'template' };
  projects: AuthProject[];
  templates?: TemplateItem[];
  projectGroups?: ProjectGroup[];
  onSwitch: (projectId: string) => void | Promise<void>;
  onSwitchTemplate?: (templateId: string) => void | Promise<void>;
  onCreateNew: (groupId?: string) => void;
  onCreateGroup?: (name: string) => void | Promise<void>;
  onRenameGroup?: (groupId: string, name: string) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
  createDisabled?: boolean;
  createTitle?: string;
  projectsUsageLabel?: string | null;
  onRenameProject?: (projectId: string, name: string) => void | Promise<void>;
  onMoveProject?: (projectId: string, groupId: string) => void | Promise<void>;
  onArchive: (projectId: string) => void | Promise<void>;
  onRestore: (projectId: string) => void | Promise<void>;
  onDelete: (projectId: string) => void | Promise<void>;
  onRenameTemplate?: (templateId: string, name: string) => void | Promise<void>;
  onDeleteTemplate?: (templateId: string) => void | Promise<void>;
  onInsertTemplateToProject?: (templateId: string) => void | Promise<void>;
  canInsertTemplateToProject?: boolean;
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
  onRename?: (projectId: string, name: string) => void | Promise<void>;
  onMove?: (projectId: string, groupId: string) => void | Promise<void>;
  projectGroups: ProjectGroup[];
  onArchive: (projectId: string) => void | Promise<void>;
  onRestore: (projectId: string) => void | Promise<void>;
  onDelete: (projectId: string) => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
  setOpenMenuProjectId: (projectId: string | null) => void;
}

function ProjectRow({ project, isCurrent, menuActive, onSwitch, onRename, onMove, projectGroups, onArchive, onRestore, onDelete, onMenuOpenChange, setOpenMenuProjectId }: ProjectRowProps) {
  const isArchived = project.status === 'archived';
  const taskCountLabel = project.taskCount === undefined ? '—' : project.taskCount > 0 ? String(project.taskCount) : '';
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);

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
                {onRename && (
                  <DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    <span>Переименовать</span>
                  </DropdownMenuItem>
                )}
                {onMove && projectGroups.length > 1 ? (
                  <DropdownMenuItem onClick={() => setMoveModalOpen(true)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>Переместить</span>
                  </DropdownMenuItem>
                ) : null}
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
                {onMove && projectGroups.length > 1 ? (
                  <DropdownMenuItem onClick={() => setMoveModalOpen(true)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>Переместить</span>
                  </DropdownMenuItem>
                ) : null}
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
      {renameModalOpen && onRename ? (
        <EditProjectModal
          projectName={project.name}
          onSave={async (newName) => {
            await onRename(project.id, newName);
          }}
          onClose={() => setRenameModalOpen(false)}
        />
      ) : null}
      {moveModalOpen && onMove ? (
        <MoveProjectModal
          projectName={project.name}
          currentGroupId={project.groupId}
          projectGroups={projectGroups}
          onSave={async (groupId) => {
            await onMove(project.id, groupId);
          }}
          onClose={() => setMoveModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TemplateRow({
  template,
  isCurrent,
  menuActive,
  onSwitch,
  onRename,
  onDelete,
  onInsertToProject,
  canInsertToProject = false,
  onMenuOpenChange,
  setOpenMenuTemplateId,
}: {
  template: TemplateItem;
  isCurrent: boolean;
  menuActive: boolean;
  onSwitch: (templateId: string) => void | Promise<void>;
  onRename?: (templateId: string, name: string) => void | Promise<void>;
  onDelete?: (templateId: string) => void | Promise<void>;
  onInsertToProject?: (templateId: string) => void | Promise<void>;
  canInsertToProject?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  setOpenMenuTemplateId: (templateId: string | null) => void;
}) {
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  return (
    <div className={cn('group flex items-center rounded-md transition-colors', isCurrent ? 'bg-slate-100' : 'hover:bg-slate-100')}>
      <button
        type="button"
        onClick={() => onSwitch(template.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-2',
          isCurrent ? 'font-medium text-slate-900' : 'text-slate-700',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ToyBrick className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-sm sm:text-xs">{template.name}</span>
        </span>
      </button>

      <div className="relative mr-2 flex h-5 w-11 shrink-0 items-center justify-end">
        {template.taskCount > 0 ? <span className="pr-1 text-xs text-slate-400 transition-opacity group-hover:opacity-0">{template.taskCount}</span> : null}
        <DropdownMenu
          onOpenChange={(open) => {
            setOpenMenuTemplateId(open ? template.id : null);
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
              aria-label="Действия шаблона"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={6} className="w-44">
            {onInsertToProject && (
              <DropdownMenuItem
                disabled={!canInsertToProject}
                onClick={() => void onInsertToProject(template.id)}
              >
                <ToyBrick className="h-4 w-4" />
                <span>Вставить в проект</span>
              </DropdownMenuItem>
            )}
            {onRename && (
              <DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
                <Pencil className="h-4 w-4" />
                <span>Переименовать</span>
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={() => setDeleteModalOpen(true)} className="text-red-600 focus:text-red-700">
                <Trash2 className="h-4 w-4" />
                <span>Удалить</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {renameModalOpen && onRename ? (
        <EditProjectModal
          projectName={template.name}
          onSave={async (newName) => {
            await onRename(template.id, newName);
          }}
          onClose={() => setRenameModalOpen(false)}
        />
      ) : null}
      {deleteModalOpen && onDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteModalOpen(false);
            }
          }}
        >
          <div
            className="w-[440px] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-6 w-6 shrink-0 text-amber-500" />
              <h2 className="text-lg font-semibold text-slate-800">Удалить шаблон?</h2>
            </div>

            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2 text-red-700">
                <ToyBrick className="h-4 w-4 shrink-0" />
                <span className="truncate font-semibold">{template.name}</span>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-700">
              Это действие необратимо.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteModalOpen(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  await onDelete(template.id);
                  setDeleteModalOpen(false);
                }}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
  const canDeleteGroup = Boolean(group && !group.isDefault && onDeleteGroup);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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
                <DropdownMenuItem onClick={() => setRenameModalOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  <span>Переименовать</span>
                </DropdownMenuItem>
              )}
              {canDeleteGroup && (
                <DropdownMenuItem onClick={() => setDeleteModalOpen(true)} className="text-red-600 focus:text-red-700">
                  <Trash2 className="h-4 w-4" />
                  <span>Удалить</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <span className="h-6 w-6 shrink-0" />}
      </div>
      {open && <div className="pl-1.5">{children}</div>}
      {group && renameModalOpen && onRenameGroup ? (
        <ProjectGroupModal
          mode="rename"
          initialName={group.name}
          onSave={async (name) => {
            await onRenameGroup(group.id, name);
          }}
          onClose={() => setRenameModalOpen(false)}
        />
      ) : null}
      {group && deleteModalOpen && canDeleteGroup ? (
        <DeleteProjectGroupModal
          groupName={group.name}
          projectCount={projectCount}
          onDelete={projectCount === 0 ? async () => {
            await onDeleteGroup?.(group.id);
          } : undefined}
          onClose={() => setDeleteModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function ProjectSwitcher({
  currentProject,
  projects,
  templates = [],
  projectGroups = [],
  onSwitch,
  onSwitchTemplate,
  onCreateNew,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  createDisabled = false,
  createTitle,
  projectsUsageLabel,
  onRenameProject,
  onMoveProject,
  onArchive,
  onRestore,
  onDelete,
  onRenameTemplate,
  onDeleteTemplate,
  onInsertTemplateToProject,
  canInsertTemplateToProject = false,
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
  const [openMenuTemplateId, setOpenMenuTemplateId] = useState<string | null>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(true);

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

  const handleSwitchTemplate = async (templateId: string) => {
    if (!onSwitchTemplate || templateId === selectedProjectId) return;
    setOpenMenuTemplateId(null);
    onMenuOpenChange?.(false);
    setPendingProjectId(templateId);
    try {
      await onSwitchTemplate(templateId);
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
                  <ProjectRow key={project.id} project={project} isCurrent={project.id === selectedProjectId} menuActive={openMenuProjectId === project.id} onSwitch={handleSwitch} onRename={onRenameProject} onMove={onMoveProject} projectGroups={effectiveGroups} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onMenuOpenChange={onMenuOpenChange} setOpenMenuProjectId={setOpenMenuProjectId} />
                ))}
              </ProjectSection>
            );
          })}

          {onSwitchTemplate ? (
            <ProjectSection
              title={`Шаблоны (${templates.length})`}
              icon={<ToyBrick className="h-4 w-4" />}
              open={templatesOpen}
              onToggle={() => setTemplatesOpen((value) => !value)}
            >
              {templates.length > 0 ? templates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  isCurrent={template.id === selectedProjectId}
                  menuActive={openMenuTemplateId === template.id}
                  onSwitch={handleSwitchTemplate}
                  onRename={onRenameTemplate}
                  onDelete={onDeleteTemplate}
                  onInsertToProject={onInsertTemplateToProject}
                  canInsertToProject={canInsertTemplateToProject}
                  onMenuOpenChange={onMenuOpenChange}
                  setOpenMenuTemplateId={setOpenMenuTemplateId}
                />
              )) : (
                <div className="px-3 py-2 text-xs text-slate-400">Нет шаблонов</div>
              )}
            </ProjectSection>
          ) : null}

          {onCreateGroup ? (
            <div className="px-3 pt-1">
              <button
                type="button"
                onClick={() => setCreateGroupModalOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4" />
                <span>Группа проектов</span>
              </button>
            </div>
          ) : null}

          {archivedProjects.length > 0 ? (
            <div className="pt-3">
              <div className="mx-3 mb-2 border-t border-slate-200" />
              <ProjectSection title={archiveTitle} icon={<Archive className="h-4 w-4" />} open={archiveOpen} onToggle={() => setArchiveOpen((value) => !value)}>
                {archivedProjects.map((project) => (
                  <ProjectRow key={project.id} project={project} isCurrent={project.id === selectedProjectId} menuActive={openMenuProjectId === project.id} onSwitch={handleSwitch} onRename={onRenameProject} onMove={onMoveProject} projectGroups={effectiveGroups} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onMenuOpenChange={onMenuOpenChange} setOpenMenuProjectId={setOpenMenuProjectId} />
                ))}
              </ProjectSection>
            </div>
          ) : null}
        </div>
        <div className="h-16 shrink-0" />
      </div>

      {footer && <div className="shrink-0">{footer}</div>}

      {createGroupModalOpen && onCreateGroup ? (
        <ProjectGroupModal
          mode="create"
          initialName="Новая группа"
          onSave={async (name) => {
            await onCreateGroup(name);
          }}
          onClose={() => setCreateGroupModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
