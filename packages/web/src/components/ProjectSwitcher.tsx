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
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="font-medium">
            {currentProject.name} <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          {projects.length > 0 && projects.map(p => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onSwitch(p.id)}
              className={cn("flex items-center justify-between", p.id === currentProject.id && "font-medium text-primary")}
            >
              <span className="flex items-center gap-2">
                {p.id === currentProject.id && <Check className="h-4 w-4 shrink-0" />}
                {p.id !== currentProject.id && <span className="w-4 shrink-0" />}
                {p.name}
              </span>
              {p.taskCount !== undefined && (
                <span className="ml-3 text-xs text-muted-foreground">{p.taskCount}</span>
              )}
            </DropdownMenuItem>
          ))}
          {projects.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={handleCreateNew} className="text-primary font-medium">
            <Plus className="mr-2 h-4 w-4" /> Новый проект
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(currentProject.id, currentProject.name)}
          className="h-7 w-7 p-0"
          aria-label="Переименовать проект"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
