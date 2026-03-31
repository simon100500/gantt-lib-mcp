import { type ReactNode } from 'react';
import { Folder, PanelRightOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number; kind?: 'project' | 'draft' };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
  onClose?: () => void;
  footer?: ReactNode;
}

export function ProjectSwitcher({
  currentProject,
  projects,
  onSwitch,
  onCreateNew,
  onClose,
  footer,
}: ProjectSwitcherProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo + close — only in pinned sidebar mode */}
      {onClose && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <button
            type="button"
            onClick={onCreateNew}
            className="flex items-center gap-2"
          >
            <img src="/favicon.svg" alt="GetGantt" width="20" height="20" className="h-5 w-5" />
            <span className="text-base font-semibold text-slate-900">ГетГант</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Свернуть"
            title="Свернуть"
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Projects section header */}
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 text-slate-500">
          <Folder className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide">Проекты</span>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Новый проект"
          title="Новый проект"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Projects list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-1">
        {projects.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSwitch(p.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left transition-colors',
                  'hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  p.id === currentProject.id
                    ? 'bg-slate-100 font-medium text-slate-900'
                    : 'text-slate-700',
                )}
              >
                <span className="truncate text-xs">{p.name}</span>
                {p.taskCount === undefined ? (
                  <span className="w-4 shrink-0 text-center text-xs text-slate-200">—</span>
                ) : p.taskCount > 0 ? (
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      p.id === currentProject.id ? 'text-slate-600' : 'text-slate-400',
                    )}
                  >
                    {p.taskCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-slate-400">Нет проектов</p>
        )}
      </div>

      {/* Footer (billing etc.) */}
      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
