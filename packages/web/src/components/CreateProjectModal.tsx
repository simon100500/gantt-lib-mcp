import { useEffect, useState } from 'react';
import { FolderPlus, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ProjectGroupModal } from './ProjectGroupModal.tsx';
import type { ProjectGroup } from '../types.ts';

interface CreateProjectModalProps {
  projectGroups: ProjectGroup[];
  initialGroupId?: string;
  onSave: (name: string, groupId: string) => Promise<{ id: string; name: string } | null>;
  onCreateGroup: (name: string) => Promise<ProjectGroup | null>;
  onClose: () => void;
}

export function CreateProjectModal({ projectGroups, initialGroupId, onSave, onCreateGroup, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId ?? projectGroups[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  useEffect(() => {
    if (!projectGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(initialGroupId ?? projectGroups[0]?.id ?? '');
    }
  }, [initialGroupId, projectGroups, selectedGroupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Название проекта не может быть пустым');
      return;
    }

    if (!selectedGroupId) {
      setError('Выберите группу проектов');
      return;
    }

    setLoading(true);
    try {
      const result = await onSave(trimmedName, selectedGroupId);
      if (result) {
        onClose();
      } else {
        setError('Не удалось создать проект. Попробуйте снова.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Card className="w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl border-0 rounded-2xl relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Новый проект
          </CardTitle>
          <CardDescription>Выберите группу, в которой будут жить проект и его общие ресурсы.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Название проекта</Label>
              <Input
                id="new-project-name"
                type="text"
                placeholder="Мой проект"
                className={cn(
                  "h-11",
                  error && "border-destructive focus-visible:ring-destructive"
                )}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="new-project-group">Группа проектов</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGroupModalOpen(true)}
                  disabled={loading}
                  className="h-8 px-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span>Новая группа</span>
                </Button>
              </div>
              <select
                id="new-project-group"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                disabled={loading || projectGroups.length === 0}
                className={cn(
                  'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  error && !selectedGroupId && 'border-destructive focus-visible:ring-destructive',
                )}
              >
                {projectGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              {projectGroups.length === 0 ? (
                <p className="text-sm text-slate-500">Сначала создайте группу проектов.</p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || projectGroups.length === 0}
            >
              {loading ? 'Создание...' : 'Создать'}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {groupModalOpen && (
        <ProjectGroupModal
          mode="create"
          initialName="Новая группа"
          onSave={async (groupName) => {
            const createdGroup = await onCreateGroup(groupName);
            if (createdGroup) {
              setSelectedGroupId(createdGroup.id);
            }
          }}
          onClose={() => setGroupModalOpen(false)}
        />
      )}
    </div>
  );
}
