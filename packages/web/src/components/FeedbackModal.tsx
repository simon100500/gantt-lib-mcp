import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Paperclip, Send, X } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { useAuthStore } from '../stores/useAuthStore.ts';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  projectName?: string | null;
}

interface EncodedAttachment {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  size: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function FeedbackModal({ open, onClose, projectName }: FeedbackModalProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshAccessToken = useAuthStore((state) => state.refreshAccessToken);
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<EncodedAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMessage('');
    setAttachments([]);
    setError(null);
    setSuccess(null);
    setIsSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, attachment) => sum + attachment.size, 0),
    [attachments],
  );

  const appendFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setError(null);

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Можно приложить не более ${MAX_ATTACHMENTS} файлов.`);
      return;
    }

    const nextTotal = totalAttachmentBytes + files.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_BYTES) {
      setError(`Суммарный размер вложений не должен превышать ${formatBytes(MAX_TOTAL_BYTES)}.`);
      return;
    }

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`Файл ${file.name} превышает ${formatBytes(MAX_FILE_BYTES)}.`);
        return;
      }
    }

    try {
      const encoded = await Promise.all(files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
        size: file.size,
      } satisfies EncodedAttachment)));
      setAttachments((current) => [...current, ...encoded]);
    } catch {
      setError('Не удалось прочитать один из файлов.');
    }
  };

  if (!open) {
    return null;
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await appendFiles(files);
  };

  const handleRemoveAttachment = (fileName: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.fileName !== fileName));
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    await appendFiles(files);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    await appendFiles(files);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedMessage = message.trim();

    if (normalizedMessage.length < 10) {
      setError('Опишите вопрос или проблему чуть подробнее.');
      return;
    }

    if (!accessToken) {
      setError('Нужна авторизация.');
      return;
    }

    setIsSubmitting(true);
    try {
      const makeRequest = async (token: string) => fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: normalizedMessage,
          projectName: projectName ?? null,
          pagePath: `${window.location.pathname}${window.location.search}`,
          attachments: attachments.map(({ fileName, mimeType, contentBase64 }) => ({
            fileName,
            mimeType,
            contentBase64,
          })),
        }),
      });

      let response = await makeRequest(accessToken);
      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) {
          throw new Error('Unauthorized');
        }
        response = await makeRequest(refreshedToken);
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'send_failed');
      }

      setSuccess('Сообщение отправлено. Копия придёт на указанный email.');
      setMessage('');
      setAttachments([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить сообщение.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6"
      aria-modal="true"
      role="dialog"
      onPaste={handlePaste}
    >
      <div
        className={`w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-2xl transition ${
          isDragOver ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isDragOver) {
            setIsDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setIsDragOver(false);
        }}
        onDrop={(event) => { void handleDrop(event); }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900">
              <MessageSquareText className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Обратная связь</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Закрыть форму обратной связи"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="feedback-message">Сообщение</label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-36 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Опишите проблему, идею или пожелание."
              maxLength={5000}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">Вложения</label>
              <span className="text-xs text-slate-500">
                До {MAX_ATTACHMENTS} файлов, всего до {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </div>

            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-medium transition ${
                isDragOver
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-primary/50 hover:bg-primary/5 hover:text-primary'
              }`}
            >
              <Paperclip className="h-4 w-4" />
              <span>{isDragOver ? 'Отпустите файлы сюда' : 'Прикрепить файлы'}</span>
              <input type="file" className="hidden" multiple onChange={handleFileChange} />
            </label>

            <div className="text-xs text-slate-500">
              Можно перетащить файлы в модалку или вставить их через `Ctrl+V`.
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {attachments.map((attachment) => (
                  <div key={`${attachment.fileName}-${attachment.size}`} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{attachment.fileName}</div>
                      <div className="text-xs text-slate-500">{formatBytes(attachment.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment.fileName)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {projectName && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Контекст проекта: <span className="font-medium text-slate-800">{projectName}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Закрыть
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Send className="h-4 w-4" />
              <span>{isSubmitting ? 'Отправляем...' : 'Отправить'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
