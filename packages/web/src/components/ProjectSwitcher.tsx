import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number; kind?: 'project' | 'draft' };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
}

export function ProjectSwitcher({ currentProject, projects, onSwitch, onCreateNew }: ProjectSwitcherProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Create new button - fixed at top */}
      <Button
        onClick={onCreateNew}
        className="w-full shrink-0"
        size="sm"
      >
        <Plus className="mr-2 h-4 w-4" /> Новый проект
      </Button>

      {/* Projects list */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pt-2">
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
