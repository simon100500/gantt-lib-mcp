import { Check, ChevronDown, Plus, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  const handleCreateNew = () => {
    onCreateNew();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Current project display */}
      <div className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
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

      {/* All projects dropdown */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500 font-medium">Все проекты</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-medium">
              {currentProject.name} <ChevronDown className="ml-auto h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            {projects.length > 0 && projects.map(p => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => onSwitch(p.id)}
                className={cn("flex items-center justify-between", p.id === currentProject.id && "font-medium text-primary")}
              >
                <span className="flex items-center gap-2">
                  {p.id === currentProject.id && <Check className="h-4 w-4 shrink-0" />}
                  {p.id !== currentProject.id && <span className="w-4 shrink-0" />}
                  <span className="truncate">{p.name}</span>
                </span>
                {p.taskCount !== undefined && (
                  <span className="ml-3 text-xs text-muted-foreground shrink-0">{p.taskCount}</span>
                )}
              </DropdownMenuItem>
            ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={handleCreateNew} className="text-primary font-medium">
              <Plus className="mr-2 h-4 w-4 shrink-0" /> <span>Новый проект</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Create new button */}
        <Button
          onClick={handleCreateNew}
          className="w-full"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" /> Создать проект
        </Button>
      </div>
    </div>
  );
}
