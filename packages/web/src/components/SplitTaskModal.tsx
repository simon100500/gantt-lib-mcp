import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ListTree } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Task } from '../types.ts';

export interface SplitTaskSubmitPayload {
  details: string;
  explicitListMode: boolean;
}

interface SplitTaskModalProps {
  task: Task;
  onClose: () => void;
  onSubmit: (payload: SplitTaskSubmitPayload) => Promise<{ accepted: boolean; message?: string }>;
}

function normalizeDate(value: Task['startDate'] | Task['endDate']): string {
  const date = typeof value === 'string'
    ? new Date(`${value.slice(0, 10)}T00:00:00`)
    : value;

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function buildSplitTaskTrace(task: Task, payload: SplitTaskSubmitPayload): string {
  const trimmedDetails = payload.details.trim();
  const parts = [`Разбить задачу «${task.name}» на подзадачи.`];

  if (payload.explicitListMode && trimmedDetails) {
    parts.push(`Используй только этот явный список подзадач:\n${trimmedDetails}`);
  } else if (trimmedDetails) {
    parts.push(`Уточнения: ${trimmedDetails}`);
  }

  return parts.join(' ');
}

export function SplitTaskModal({ task, onClose, onSubmit }: SplitTaskModalProps) {
  const [details, setDetails] = useState('');
  const [explicitListMode, setExplicitListMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const dateRange = useMemo(
    () => `${normalizeDate(task.startDate)} - ${normalizeDate(task.endDate)}`,
    [task.endDate, task.startDate],
  );

  useEffect(() => {
    if (!explicitListMode) {
      return;
    }

    setDetailsOpen(true);
  }, [explicitListMode]);

  useEffect(() => {
    if (!explicitListMode || !detailsOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      detailsTextareaRef.current?.focus();
      detailsTextareaRef.current?.setSelectionRange(
        detailsTextareaRef.current.value.length,
        detailsTextareaRef.current.value.length,
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [detailsOpen, explicitListMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (explicitListMode && !details.trim()) {
      setError('Заполните список подзадач в поле комментария.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await onSubmit({
        details,
        explicitListMode,
      });
      if (result.accepted) {
        onClose();
        return;
      }

      setError(result.message ?? 'Не удалось отправить запрос на разбиение задачи.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить запрос.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) {
        onClose();
      }
    }}>
      <Card className="w-full max-w-xl rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.18)]" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                  <ListTree className="h-5 w-5 text-slate-700" />
                  Разбить задачу
                </CardTitle>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Закрыть"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Исходная задача станет родительской. Под ней появятся более детальные подзадачи.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-base font-semibold text-slate-900">{task.name}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{dateRange}</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={explicitListMode}
                  onChange={(event) => {
                    setExplicitListMode(event.target.checked);
                    if (error) {
                      setError(null);
                    }
                  }}
                  disabled={loading}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
                <span>Указать свой список задач</span>
              </label>
            </div>

            <details
              open={detailsOpen}
              onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800">
                <span>Уточнить</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')} />
              </summary>
              <div className="pt-3">
                <textarea
                  ref={detailsTextareaRef}
                  id="split-task-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  disabled={loading}
                  rows={5}
                  placeholder={explicitListMode
                    ? 'Каждый пункт с новой строки.\nНапример:\nПодготовка\nМонтаж\nПусконаладка'
                    : 'Необязательно. Например: учти проектную документацию, выдели согласование, монтаж и проверку.'}
                  className={cn(
                    'flex min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
                    error && 'border-red-300 focus:border-red-300 focus:ring-red-100',
                  )}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {explicitListMode ? 'В этом режиме поле обязательно.' : 'Можно оставить пустым.'}
                </p>
              </div>
            </details>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-lg">
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 rounded-lg">
              {loading ? 'Отправка...' : 'Разбить задачу'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
