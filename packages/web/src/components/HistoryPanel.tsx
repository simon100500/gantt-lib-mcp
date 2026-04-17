import { AlertCircle, Clock3, RotateCcw, RotateCw } from 'lucide-react';

import type { HistoryItem } from '../lib/apiTypes.ts';
import { Button } from './ui/button.tsx';
import { cn } from '@/lib/utils';

interface HistoryPanelProps {
  items: HistoryItem[];
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onRefresh: () => unknown;
  onUndoGroup: (groupId: string) => unknown;
  onRedoGroup: (groupId: string) => unknown;
}

const ACTOR_LABELS: Record<HistoryItem['actorType'], string> = {
  user: 'Пользователь',
  agent: 'AI',
  system: 'Система',
};

const STATUS_LABELS: Record<HistoryItem['status'], string> = {
  applied: 'Применено',
  undone: 'Отменено',
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryPanel({
  items,
  loading,
  error,
  disabled = false,
  onRefresh,
  onUndoGroup,
  onRedoGroup,
}: HistoryPanelProps) {
  return (
    <aside className="flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] xl:w-[320px] xl:max-w-[320px] xl:min-w-[320px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">История</p>
          <p className="text-xs text-slate-500">Группы изменений и replay</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => { void onRefresh(); }}
          disabled={loading}
          className="h-8 px-2 text-xs text-slate-600"
        >
          Обновить
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
            <Clock3 className="h-5 w-5 text-slate-400" />
            <p>История пока пуста.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item) => (
              <article key={item.id} className="space-y-3 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400">
                    {formatTimestamp(item.createdAt)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      item.status === 'undone'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    {item.status} {STATUS_LABELS[item.status]}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">{item.actorType} {ACTOR_LABELS[item.actorType]}</p>
                  <p className="text-sm font-medium leading-5 text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">
                    Версии {item.baseVersion} → {item.newVersion ?? '—'} • {item.commandCount} команд
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { void onUndoGroup(item.id); }}
                    disabled={disabled || loading || !item.undoable}
                    className="h-8 px-2 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Undo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { void onRedoGroup(item.id); }}
                    disabled={disabled || loading || !item.redoable}
                    className="h-8 px-2 text-xs"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Redo
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
