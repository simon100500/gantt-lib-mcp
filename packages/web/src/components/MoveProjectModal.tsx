import { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ProjectGroup } from '../types.ts';

interface MoveProjectModalProps {
  projectName: string;
  currentGroupId?: string;
  projectGroups: ProjectGroup[];
  onSave: (groupId: string) => Promise<void>;
  onClose: () => void;
}

export function MoveProjectModal({ projectName, currentGroupId, projectGroups, onSave, onClose }: MoveProjectModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroupId ?? projectGroups[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(currentGroupId ?? projectGroups[0]?.id ?? '');
    }
  }, [currentGroupId, projectGroups, selectedGroupId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedGroupId) {
      setError('Выберите портфель проектов');
      return;
    }

    if (selectedGroupId === currentGroupId) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await onSave(selectedGroupId);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось переместить проект');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="relative w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
          aria-label="Закрыть"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <ArrowRightLeft className="h-5 w-5" />
            Переместить проект
          </CardTitle>
          <CardDescription>{projectName}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move-project-group">Портфель проектов</Label>
              <select
                id="move-project-group"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                disabled={loading || projectGroups.length === 0}
                className={cn(
                  'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  error && 'border-destructive focus-visible:ring-destructive',
                )}
              >
                {projectGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={loading || projectGroups.length === 0} className="flex-1">
              {loading ? 'Перемещение...' : 'Переместить'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
