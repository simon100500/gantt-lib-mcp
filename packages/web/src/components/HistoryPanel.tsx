import { AlertCircle, Bot, Clock3, History, MoreHorizontal, RotateCcw, User, X } from 'lucide-react';

import type { HistoryItem } from '../lib/apiTypes.ts';
import { Button } from './ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import { cn } from '@/lib/utils';

interface HistoryPanelProps {
  items: HistoryItem[];
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  previewGroupId?: string | null;
  previewingGroupId?: string | null;
  restoringGroupId?: string | null;
  onClose: () => void;
  onRefresh: () => unknown;
  onPreviewVersion: (item: HistoryItem) => unknown;
  onRestoreVersion: (groupId: string) => unknown;
  onReturnToCurrentVersion: () => unknown;
}

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
  const date = new Date(value);
  const datePart = date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  });
  const timePart = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${datePart} в ${timePart}`;
}

function humanizeHistoryTitle(title: string): string {
  if (title.startsWith('Undo — ') || title.startsWith('Redo — ')) {
    const prefixLength = title.startsWith('Undo — ') ? 'Undo — '.length : 'Redo — '.length;
    return humanizeHistoryTitle(title.slice(prefixLength));
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
  previewGroupId = null,
  previewingGroupId = null,
  restoringGroupId = null,
  onClose,
  onRefresh,
  onPreviewVersion,
  onRestoreVersion,
  onReturnToCurrentVersion,
}: HistoryPanelProps) {
  return (
    <aside className="flex h-full min-h-[260px] w-full flex-col overflow-hidden xl:w-[320px] xl:max-w-[320px] xl:min-w-[320px]">
      <div className="flex items-center justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-slate-400" />
            <p className="min-w-0 text-[13px] font-semibold text-slate-900">История версий</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { void onRefresh(); }}
            disabled={loading}
            className="h-8 rounded-md border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            Обновить
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-slate-500 hover:bg-white hover:text-slate-700"
            aria-label="Закрыть историю"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {previewGroupId && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800">Открыта сохранённая версия</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { void onReturnToCurrentVersion(); }}
            className="h-7 rounded-full border-amber-200 bg-white px-2.5 text-[11px] text-amber-900 hover:bg-amber-100"
          >
            Вернуться к текущей
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-1 pt-3">
        {items.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl px-6 py-12 text-center text-sm text-slate-500">
            <Clock3 className="h-5 w-5 text-slate-400" />
            <p>История пока пуста.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const ActorIcon = item.actorType === 'agent' ? Bot : User;
              const isPreviewing = previewGroupId === item.id;
              const isLoadingPreview = previewingGroupId === item.id;
              const isRestoring = restoringGroupId === item.id;
              const hasVersionSelection = Boolean(previewGroupId || previewingGroupId || restoringGroupId);
              const isActive = hasVersionSelection
                ? isPreviewing || isLoadingPreview || isRestoring
                : item.isCurrent;

              return (
                <article
                  key={item.id}
                  role={disabled || loading ? undefined : 'button'}
                  tabIndex={disabled || loading ? -1 : 0}
                  onClick={() => {
                    if (disabled || loading) {
                      return;
                    }
                    void onPreviewVersion(item);
                  }}
                  onKeyDown={(event) => {
                    if (disabled || loading) {
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void onPreviewVersion(item);
                    }
                  }}
                  className={cn(
                    'group space-y-0.5 rounded-2xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
                    !disabled && !loading && 'cursor-pointer hover:bg-white',
                    isActive && 'bg-white',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex h-4 w-4 shrink-0 items-center justify-center',
                            item.actorType === 'agent' ? 'text-violet-500' : 'text-slate-400',
                          )}
                          aria-hidden="true"
                        >
                          <ActorIcon className="h-4 w-4" />
                        </span>
                        <span className="truncate text-[15px] font-semibold leading-5 text-slate-900">
                          {formatTimestamp(item.createdAt)}
                        </span>
                        {item.isCurrent && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-700">
                            Текущая
                          </span>
                        )}
                        {isLoadingPreview && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            Загрузка
                          </span>
                        )}
                        {isRestoring && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Восстановление
                          </span>
                        )}
                      </div>
                    </div>
                    {!item.isCurrent && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Действия с версией"
                            onClick={(event) => event.stopPropagation()}
                            className={cn(
                              'inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
                              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                            )}
                          >
                            <MoreHorizontal className="h-4.5 w-4.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              void onRestoreVersion(item.id);
                            }}
                            disabled={disabled || loading || !item.canRestore}
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span>Восстановить эту версию</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="pl-6 pr-5">
                    <p className="text-[13px] font-normal leading-4 text-slate-700">{humanizeHistoryTitle(item.title)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
