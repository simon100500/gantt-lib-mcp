import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DeleteProjectGroupModalProps {
  groupName: string;
  projectCount: number;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

const CONFIRMATION_WORD = 'УДАЛИТЬ';

export function DeleteProjectGroupModal({ groupName, projectCount, onDelete, onClose }: DeleteProjectGroupModalProps) {
  const [confirmationValue, setConfirmationValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmationValid = confirmationValue.trim() === CONFIRMATION_WORD;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isConfirmationValid) {
      setError(`Введите слово ${CONFIRMATION_WORD}`);
      return;
    }

    setLoading(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить портфель проектов');
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
          <CardTitle className="text-xl font-semibold">Удалить портфель проектов</CardTitle>
          <CardDescription>{groupName}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Будет удалён портфель <span className="font-medium text-slate-900">{groupName}</span>.
              </p>
              <p>
                Вместе с ним будут удалены все проекты в портфеле: {projectCount} проект{projectCount === 1 ? '' : projectCount < 5 ? 'а' : 'ов'}.
              </p>
              <p className="font-medium text-red-600">Это действие необратимо.</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-slate-600">
                Введите <span className="font-mono font-semibold select-all cursor-text">{CONFIRMATION_WORD}</span> в поле ниже для подтверждения удаления
              </p>
              <Input
                id="delete-project-group-confirmation"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={CONFIRMATION_WORD}
                className={cn(
                  'h-11 font-mono placeholder:text-slate-300',
                  error && 'border-destructive focus-visible:ring-destructive',
                )}
                value={confirmationValue}
                onChange={(event) => setConfirmationValue(event.target.value)}
                disabled={loading}
                autoFocus
              />
              {error ? (
                <p className="text-sm text-destructive" role="alert">{error}</p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="flex-1"
              disabled={loading || !isConfirmationValid}
            >
              {loading ? 'Удаление…' : 'OK'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
