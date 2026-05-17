import { useState } from 'react';
import { Folder, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ProjectGroupModalProps {
  mode: 'create' | 'rename';
  initialName?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function ProjectGroupModal({ mode, initialName = '', onSave, onClose }: ProjectGroupModalProps) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRename = mode === 'rename';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Название портфеля не может быть пустым');
      return;
    }

    if (isRename && trimmedName === initialName.trim()) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить портфель');
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
            {isRename ? <Pencil className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
            {isRename ? 'Переименовать портфель проектов' : 'Новый портфель проектов'}
          </CardTitle>
          <CardDescription>
            {isRename
              ? ''
              : 'Портфель задаёт общий контекст для проектов и общих ресурсов.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-group-name">Название портфеля</Label>
              <Input
                id="project-group-name"
                type="text"
                placeholder="Проекты продукта"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
                autoFocus
                className={cn('h-11', error && 'border-destructive focus-visible:ring-destructive')}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (isRename ? 'Сохранение...' : 'Создание...') : (isRename ? 'Сохранить' : 'Создать')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
