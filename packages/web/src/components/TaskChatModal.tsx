import { useEffect, useRef, useState } from 'react';
import { WandSparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StartScreenSendResult } from './StartScreen.tsx';
import type { Task } from '../types.ts';

interface TaskChatModalProps {
  task: Task;
  onClose: () => void;
  onAppendToChat: (task: Task) => void;
  onSendNow?: (text: string) => StartScreenSendResult | Promise<StartScreenSendResult>;
}

function buildTaskChatMessage(task: Task, details: string): string {
  const mention = `[task:${task.id}|${task.name}]`;
  const trimmedDetails = details.trim();

  if (!trimmedDetails) {
    return `${mention}\n\n`;
  }

  return `${mention}\n\n${trimmedDetails}`;
}

export function TaskChatModal({
  task,
  onClose,
  onAppendToChat,
  onSendNow,
}: TaskChatModalProps) {
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasDetails = details.trim().length > 0;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!hasDetails) {
      onAppendToChat(task);
      onClose();
      return;
    }

    if (!onSendNow) {
      setError('Не удалось отправить сообщение.');
      return;
    }

    setLoading(true);

    try {
      const result = await onSendNow(buildTaskChatMessage(task, details));
      if (result.accepted) {
        onClose();
        return;
      }

      setError(result.message ?? 'Не удалось отправить сообщение.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить сообщение.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <Card
        className="w-full max-w-md rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="space-y-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
            <WandSparkles className="h-5 w-5 text-slate-700" />
            Что сделать с задачей?
          </CardTitle>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              {task.name}
            </div>

            <textarea
              ref={textareaRef}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={loading}
              rows={4}
              placeholder="Что нужно сделать"
              className={cn(
                'min-h-[112px] w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
                error && 'border-red-300 focus:border-red-300 focus:ring-red-100',
              )}
            />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <p className="text-sm leading-6 text-slate-500">
              Оставьте поле пустым, чтобы просто добавить работу в чат.
            </p>
          </CardContent>

          <CardFooter className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="rounded-lg">
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 rounded-lg">
              {loading ? 'Отправка...' : hasDetails ? 'Выполнить' : 'Добавить в чат'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
