import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: () => void;
  onEdit?: (projectId: string, currentName: string) => Promise<void>;
}

export function ProjectSwitcher({ currentProject, projects, onSwitch, onCreateNew, onEdit }: ProjectSwitcherProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Current project display */}
      <div className="flex items-center justify-between gap-2 p-3 bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 font-medium mb-0.5">Текущий проект</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{currentProject.name}</p>
        </div>
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(currentProject.id, currentProject.name)}
            className="h-8 w-8 p-0 shrink-0"
            aria-label="Переименовать проект"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Projects list */}
      <div className="flex flex-col gap-2 mt-4 flex-1 overflow-y-auto">
        <p className="text-xs text-slate-500 font-medium sticky top-0 bg-slate-50 py-1">Все проекты</p>

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
                {p.taskCount !== undefined && (
                  <span className="text-xs text-slate-400 shrink-0">{p.taskCount}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-2">Нет других проектов</p>
        )}
      </div>

      {/* Create new button - fixed at bottom */}
      <div className="shrink-0 pt-2">
        <Button
          onClick={onCreateNew}
          className="w-full"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" /> Новый проект
        </Button>
      </div>
    </div>
  );
}
