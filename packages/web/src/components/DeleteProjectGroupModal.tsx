import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface DeleteProjectGroupModalProps {
  groupName: string;
  projectCount: number;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function DeleteProjectGroupModal({ groupName, projectCount, onDelete, onClose }: DeleteProjectGroupModalProps) {
  const canDelete = projectCount === 0 && Boolean(onDelete);

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
          <CardTitle className="text-xl font-semibold">Удалить группу проектов</CardTitle>
          <CardDescription>{groupName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {canDelete
              ? 'Группа пустая. Её можно удалить.'
              : `Группу можно удалить только когда она пустая. Сейчас в ней ${projectCount} проект${projectCount === 1 ? '' : projectCount < 5 ? 'а' : 'ов'}.`}
          </p>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            {canDelete ? 'Отмена' : 'Понятно'}
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => { void onDelete?.().finally(onClose); }}
              className="flex-1"
            >
              Удалить
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
