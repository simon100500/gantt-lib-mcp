import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface EditProjectModalProps {
  projectName: string;
  onSave: (newName: string) => Promise<void>;
  onClose: () => void;
}

export function EditProjectModal({ projectName, onSave, onClose }: EditProjectModalProps) {
  const [name, setName] = useState(projectName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Название проекта не может быть пустым');
      return;
    }

    if (trimmedName === projectName) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
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
            <Pencil className="w-5 h-5" />
            Переименовать проект
          </CardTitle>
          <CardDescription>Введите новое название проекта</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Название проекта</Label>
              <Input
                id="project-name"
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
              disabled={loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
