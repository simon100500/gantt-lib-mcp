import { AlertCircle, Bot, Clock3, RotateCcw, RotateCw, Settings2, User, X } from 'lucide-react';

import type { HistoryItem } from '../lib/apiTypes.ts';
import { Button } from './ui/button.tsx';
import { cn } from '@/lib/utils';

interface HistoryPanelProps {
  items: HistoryItem[];
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onClose: () => void;
  onRefresh: () => unknown;
  onUndoGroup: (groupId: string) => unknown;
  onRedoGroup: (groupId: string) => unknown;
}

const ACTOR_ICONS: Record<HistoryItem['actorType'], typeof User> = {
  user: User,
  agent: Bot,
  system: Settings2,
};

const STATUS_LABELS: Record<HistoryItem['status'], string> = {
  applied: 'Применено',
  undone: 'Отменено',
};

const COMMAND_TITLES: Record<string, string> = {
  move_task: 'Перенос задачи',
  resize_task: 'Изменение длительности задачи',
  set_task_start: 'Изменение даты начала',
  set_task_end: 'Изменение даты окончания',
  change_duration: 'Изменение длительности',
  update_task_fields: 'Изменение задачи',
  update_tasks_fields_batch: 'Массовое изменение задач',
  create_task: 'Создание задачи',
  create_tasks_batch: 'Массовое создание задач',
  delete_task: 'Удаление задачи',
  delete_tasks: 'Массовое удаление задач',
  create_dependency: 'Создание зависимости',
  remove_dependency: 'Удаление зависимости',
  change_dependency_lag: 'Изменение лага зависимости',
  recalculate_schedule: 'Пересчёт расписания',
  reparent_task: 'Перемещение в иерархии',
  reorder_tasks: 'Изменение порядка задач',
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCommandCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} команд`;
  }

  if (mod10 === 1) {
    return `${count} команда`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} команды`;
  }

  return `${count} команд`;
}

function humanizeHistoryTitle(title: string): string {
  if (title.startsWith('Undo — ')) {
    return `Отмена — ${humanizeHistoryTitle(title.slice('Undo — '.length))}`;
  }

  if (title.startsWith('Redo — ')) {
    return `Повтор — ${humanizeHistoryTitle(title.slice('Redo — '.length))}`;
  }

  if (title.startsWith('AI — ')) {
    return `AI — ${humanizeHistoryTitle(title.slice('AI — '.length))}`;
  }

  return COMMAND_TITLES[title] ?? title.split('_').join(' ');
}

export function HistoryPanel({
  items,
  loading,
  error,
  disabled = false,
  onClose,
  onRefresh,
  onUndoGroup,
  onRedoGroup,
}: HistoryPanelProps) {
  return (
    <aside className="flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(9,30,66,0.08)] xl:w-[300px] xl:max-w-[300px] xl:min-w-[300px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
        <p className="min-w-0 text-sm font-semibold text-slate-900">История</p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { void onRefresh(); }}
            disabled={loading}
            className="h-7 px-2 text-[11px] text-slate-700"
          >
            Обновить
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 text-slate-500 hover:text-slate-700"
            aria-label="Закрыть историю"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
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
            {items.map((item) => {
              const ActorIcon = ACTOR_ICONS[item.actorType];

              return (
              <article key={item.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 shrink-0 items-center justify-center',
                        item.actorType === 'agent' ? 'text-violet-600' : 'text-slate-400',
                      )}
                      title={item.actorType === 'user' ? 'Пользователь' : item.actorType === 'agent' ? 'Агент' : 'Система'}
                    >
                      <ActorIcon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400">
                    {formatTimestamp(item.createdAt)}
                    </span>
                  </div>
                  {item.status === 'undone' && (
                    <span
                      className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium leading-4 text-slate-900">{humanizeHistoryTitle(item.title)}</p>
                  <p className="text-[11px] text-slate-500">
                    Версии {item.baseVersion} → {item.newVersion ?? '—'} • {formatCommandCount(item.commandCount)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { void onUndoGroup(item.id); }}
                    disabled={disabled || loading || !item.undoable}
                    className="h-7 px-2 text-[11px]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Отменить
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { void onRedoGroup(item.id); }}
                    disabled={disabled || loading || !item.redoable}
                    className="h-7 px-2 text-[11px]"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Повторить
                  </Button>
                </div>
              </article>
            );})}
          </div>
        )}
      </div>
    </aside>
  );
}
