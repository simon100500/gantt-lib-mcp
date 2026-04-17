import { useMemo, useState } from 'react';
import { Sparkles, ListTree } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Task } from '../types.ts';

interface SplitTaskModalProps {
  task: Task;
  onClose: () => void;
  onSubmit: (details: string) => Promise<{ accepted: boolean; message?: string }>;
}

function normalizeDate(value: Task['startDate'] | Task['endDate']): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString().slice(0, 10);
}

export function buildSplitTaskPrompt(task: Task, details: string): string {
  const trimmedDetails = details.trim();
  const lines = [
    `Разбей задачу "${task.name}" на более детальные подзадачи и сделай исходную задачу родительской.`,
    'Это точечная операция только для этой ветки проекта.',
    `Опорная задача: "${task.name}" (id: ${task.id}).`,
    `Текущий диапазон задачи: ${normalizeDate(task.startDate)} - ${normalizeDate(task.endDate)}.`,
    'Нужен результат в текущем проекте: добавь подзадачи под эту задачу, не создавай отдельную параллельную ветку рядом.',
    'Сохрани смысл исходной задачи и детализируй её на практические шаги.',
  ];

  if (trimmedDetails) {
    lines.push(`Дополнительные пожелания пользователя: ${trimmedDetails}`);
  }

  lines.push('Если уместно, используй 4-8 подзадач. Названия должны быть конкретными и рабочими.');

  return lines.join('\n');
}

export function SplitTaskModal({ task, onClose, onSubmit }: SplitTaskModalProps) {
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(
    () => `${normalizeDate(task.startDate)} - ${normalizeDate(task.endDate)}`,
    [task.endDate, task.startDate],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await onSubmit(details);
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
      <Card className="w-full max-w-2xl rounded-3xl border-0 shadow-[0_24px_80px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI Detail Pass
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
                  <ListTree className="h-6 w-6 text-amber-600" />
                  Разбить задачу
                </CardTitle>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Исходная задача останется в графике и станет родительской. AI добавит под ней более детальные подзадачи.
                </p>
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
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#fff7ed,white_55%,#f8fafc)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Выбранная задача</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{task.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200">ID: {task.id}</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200">{dateRange}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="split-task-details" className="text-sm font-medium text-slate-800">
                Уточнения для AI
              </label>
              <textarea
                id="split-task-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                disabled={loading}
                rows={6}
                placeholder="Необязательно. Например: учти проектную документацию, выдели согласование, монтаж и проверку."
                className={cn(
                  'flex min-h-[144px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-60',
                  error && 'border-red-300 focus:border-red-300 focus:ring-red-100',
                )}
              />
              <p className="text-xs leading-5 text-slate-500">
                Поле можно оставить пустым. Тогда задача будет детализирована только по её названию и диапазону.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="split-task-preview" className="text-sm font-medium text-slate-800">
                Что уйдёт в запрос
              </label>
              <Input
                id="split-task-preview"
                value="Прямой one-shot prompt в /api/chat, без отдельного endpoint"
                readOnly
                className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-600"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-xl">
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
              {loading ? 'Отправка...' : 'Разбить задачу'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
