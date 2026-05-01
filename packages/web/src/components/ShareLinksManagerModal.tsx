import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, LoaderCircle, ScissorsLineDashed, Trash2, X } from 'lucide-react';

import { Button } from './ui/button.tsx';
import type { ShareLinkListItem } from '../lib/apiTypes.ts';

interface ShareLinksManagerModalProps {
  accessToken: string;
  projectId: string;
  projectName: string;
  selectionActive?: boolean;
  selectedTaskCount?: number;
  onStartPartialSelection: () => void;
  onClose: () => void;
  onStatusChange?: (status: 'idle' | 'creating' | 'copied' | 'error') => void;
}

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleString('ru-RU');
}

function resolveShareUrl(token: string): string {
  if (typeof window === 'undefined') {
    return `/?share=${encodeURIComponent(token)}`;
  }

  return `${window.location.origin}/?share=${encodeURIComponent(token)}`;
}

export function ShareLinksManagerModal({
  accessToken,
  projectId,
  projectName,
  selectionActive = false,
  selectedTaskCount = 0,
  onStartPartialSelection,
  onClose,
  onStatusChange,
}: ShareLinksManagerModalProps) {
  const [links, setLinks] = useState<ShareLinkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/share-links`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as { links: ShareLinkListItem[] };
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleCopy = useCallback(async (link: ShareLinkListItem) => {
    try {
      await navigator.clipboard.writeText(resolveShareUrl(link.id));
      setCopiedLinkId(link.id);
      onStatusChange?.('copied');
      window.setTimeout(() => {
        setCopiedLinkId((current) => current === link.id ? null : current);
        onStatusChange?.('idle');
      }, 1500);
    } catch {
      onStatusChange?.('error');
    }
  }, [onStatusChange]);

  const handleCreateWholeProjectLink = useCallback(async () => {
    setSubmitting(true);
    onStatusChange?.('creating');
    try {
      const response = await fetch(`/api/projects/${projectId}/share-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'project',
          label: `${projectName} · весь график`,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      onStatusChange?.('idle');
      await loadLinks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
      onStatusChange?.('error');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, loadLinks, onStatusChange, projectId, projectName]);

  const handleRevoke = useCallback(async (link: ShareLinkListItem) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/share-links/${link.id}/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await loadLinks();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : String(revokeError));
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, loadLinks, projectId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex h-[min(92vh,920px)] w-[min(1200px,100%)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-slate-400 transition-colors hover:text-slate-600"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Мастер ссылок</h2>
            <p className="text-sm text-slate-500">
              Создавайте, копируйте и отзывайте ссылки на проект и его часть.
            </p>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
          <div className="mb-4 flex flex-wrap gap-3">
            <Button type="button" onClick={() => { void handleCreateWholeProjectLink(); }} disabled={submitting}>
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Весь график
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onStartPartialSelection();
                onClose();
              }}
            >
              <ScissorsLineDashed className="h-4 w-4" />
              {selectionActive ? 'Вернуться к выбору' : 'Часть графика'}
            </Button>
            {selectionActive && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                В режиме выбора: {selectedTaskCount}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Загружаем ссылки...
              </div>
            ) : links.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Ссылок пока нет.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {links.map((link) => (
                  <div key={link.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                            {link.scope === 'project' ? 'Весь график' : 'Часть графика'}
                          </span>
                          {link.revokedAt && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-red-700">
                              Отозвана
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-slate-900">{link.label}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <span>Создана {formatCreatedAt(link.createdAt)}</span>
                          <span className="truncate font-mono text-slate-400">{resolveShareUrl(link.id)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2.5"
                          onClick={() => void handleCopy(link)}
                          disabled={Boolean(link.revokedAt)}
                        >
                          {copiedLinkId === link.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          <span className="hidden sm:inline">{copiedLinkId === link.id ? 'Скопировано' : 'Копировать'}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2.5"
                          onClick={() => void handleRevoke(link)}
                          disabled={Boolean(link.revokedAt) || submitting}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">Отозвать</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
