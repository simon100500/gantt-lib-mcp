import { Plus, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number; kind?: 'project' | 'draft' };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
  onClose?: () => void;
  isInline?: boolean;
}

export function ProjectSwitcher({ currentProject, projects, onSwitch, onCreateNew, onClose, isInline = false }: ProjectSwitcherProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo and close/collapse button - on all screens */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="GetGantt" width="20" height="20" className="h-5 w-5" />
          <span className="text-sm font-semibold text-slate-900">ГетГант</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label={isInline ? "Свернуть" : "Закрыть"}
            title={isInline ? "Свернуть" : "Закрыть"}
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Create new button - fixed at top */}
      <Button
        onClick={onCreateNew}
        className="w-full shrink-0 mb-3"
        size="sm"
      >
        <Plus className="mr-2 h-4 w-4" /> Новый проект
      </Button>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Projects list */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pt-3">
        {/* All projects as simple list */}
        {projects.length > 0 ? (
          <div className="flex flex-col gap-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => onSwitch(p.id)}
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-2 rounded-md text-left transition-colors",
                  "hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  p.id === currentProject.id
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-700"
                )}
              >
                <span className="truncate text-sm">{p.name}</span>
                {p.taskCount === undefined ? (
                  <span className="text-xs text-slate-200 shrink-0 w-4 text-center">—</span>
                ) : p.taskCount > 0 ? (
                  <span className={cn(
                    "text-xs shrink-0",
                    p.id === currentProject.id ? "text-slate-600" : "text-slate-400"
                  )}>{p.taskCount}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-2">Нет других проектов</p>
        )}
      </div>
    </div>
  );
}
