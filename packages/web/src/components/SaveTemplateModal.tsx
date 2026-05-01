import { useEffect, useState } from 'react';
import { ToyBrick } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SaveTemplateModalProps {
  initialName: string;
  taskCount: number;
  mode: 'project' | 'selection';
  loading?: boolean;
  onSave: (name: string) => Promise<void> | void;
  onClose: () => void;
}

export function SaveTemplateModal({
  initialName,
  taskCount,
  mode,
  loading = false,
  onSave,
  onClose,
}: SaveTemplateModalProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
    setError(null);
  }, [initialName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <Card className="relative w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={onClose}
          disabled={loading}
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
            <ToyBrick className="h-5 w-5" />
            Сохранить шаблон
          </CardTitle>
          <CardDescription>
            {mode === 'project'
              ? `Будет сохранён весь график: ${taskCount} задач.`
              : `Будет сохранён выбранный блок: ${taskCount} задач.`}
          </CardDescription>
        </CardHeader>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError('Название шаблона не может быть пустым');
              return;
            }
            setError(null);
            await onSave(trimmed);
          }}
        >
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="template-name" className="text-sm font-medium text-slate-700">
                Название шаблона
              </label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
                autoFocus
                placeholder="Например: Монолитный каркас"
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
