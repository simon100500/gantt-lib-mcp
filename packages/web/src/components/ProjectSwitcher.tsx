import { Check, ChevronDown, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProjectSwitcherProps {
  currentProject: { id: string; name: string; taskCount?: number };
  projects: { id: string; name: string; taskCount?: number }[];
  onSwitch: (projectId: string) => void;
  onCreateNew: (name: string) => Promise<{ id: string; name: string } | null>;
}

export function ProjectSwitcher({ currentProject, projects, onSwitch, onCreateNew }: ProjectSwitcherProps) {
  const handleCreateNew = async () => {
    const name = window.prompt('New project name:');
    if (name?.trim()) {
      const result = await onCreateNew(name.trim());
      if (!result) {
        alert('Failed to create project. Please try again.');
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="font-medium">
          {currentProject.name} <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        {projects.map(p => (
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateNew} className="text-primary font-medium">
          <Plus className="mr-2 h-4 w-4" /> New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
