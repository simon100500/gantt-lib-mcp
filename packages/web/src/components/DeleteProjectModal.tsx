import { useState } from 'react';
import { TriangleAlert, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DeleteProjectModalProps {
  projectName: string;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

const CONFIRMATION_WORD = 'УДАЛИТЬ';

export function DeleteProjectModal({
  projectName,
  onDelete,
  onClose,
}: DeleteProjectModalProps) {
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
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[480px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center gap-3">
          <TriangleAlert className="w-6 h-6 text-amber-500 shrink-0" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-800">Подтвердить удаление?</h2>
        </div>

        {/* Project name banner */}
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
          <Briefcase className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-red-700 truncate">{projectName}</span>
        </div>

        {/* Warning */}
        <p className="text-sm text-slate-700">
          <strong>Внимание: это действие необратимо.</strong>
        </p>

        {/* Confirmation form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-slate-600">
            Введите <span className="font-mono font-semibold select-all cursor-text">{CONFIRMATION_WORD}</span> в поле ниже для подтверждения удаления
          </p>

          <div className="space-y-1.5">
            <Input
              id="delete-project-confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={CONFIRMATION_WORD}
              className={cn(
                'h-11 font-mono placeholder:text-slate-300',
                error && 'border-destructive focus-visible:ring-destructive',
              )}
              value={confirmationValue}
              onChange={(e) => setConfirmationValue(e.target.value)}
              disabled={loading}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading || !isConfirmationValid}
            >
              {loading ? 'Удаление…' : 'OK'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
