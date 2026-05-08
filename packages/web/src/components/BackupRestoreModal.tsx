import { CheckCircle2, PackageOpen, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type BackupRestoreSummary = {
  taskCount: number;
  resourceCount: number;
  assignmentCount: number;
  progressEntryCount: number;
  financeSettingCount: number;
  fundingEventCount: number;
  baselineCount: number;
};

interface BackupRestoreModalProps {
  fileName: string;
  loading?: boolean;
  error?: string | null;
  summary?: BackupRestoreSummary | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function BackupRestoreModal({
  fileName,
  loading = false,
  error = null,
  summary = null,
  onConfirm,
  onClose,
}: BackupRestoreModalProps) {
  const completed = Boolean(summary);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <Card className="relative w-[540px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            {completed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <PackageOpen className="h-5 w-5 text-slate-800" />}
            {completed ? 'Backup восстановлен' : 'Восстановление из резервной копии'}
          </CardTitle>
          <CardDescription>
            {completed
              ? 'Данные из backup уже применены к текущему проекту.'
              : 'Текущий проект будет полностью заменён данными из выбранного backup-файла.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">Файл</div>
            <div className="mt-1 break-all text-sm font-medium text-slate-800">{fileName}</div>
          </div>

          {!completed ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Будут заменены задачи, сроки, связи, ресурсы, назначения, календарь, маркеры, прогресс, финансы и базовые планы.
                </div>
              </div>
            </div>
          ) : null}

          {completed && summary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Восстановлено: {summary.taskCount} задач, {summary.resourceCount} ресурсов, {summary.assignmentCount} назначений, {summary.baselineCount} базовых планов.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            {completed ? 'Закрыть' : 'Отмена'}
          </Button>
          {!completed ? (
            <Button type="button" onClick={() => void onConfirm()} disabled={loading} className="flex-1">
              {loading ? 'Восстанавливаем...' : 'Заменить проект'}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
