import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from './ui/button.tsx';
import type { ShareLinkListItem } from '../lib/apiTypes.ts';
import { printShareLinkSheet } from '../lib/shareLinkPrint.ts';

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

function getShareScopeLabel(scope: ShareLinkListItem['scope']): string {
  return scope === 'project' ? 'Весь график' : 'Часть графика';
}

function getShareDisplayTitle(link: ShareLinkListItem): string {
  const normalizedLabel = link.label
    .replace(/\s*[·-]\s*весь график$/i, '')
    .replace(/\s*[·-]\s*часть графика$/i, '')
    .trim();

  return normalizedLabel || link.label;
}

function getSharePreviewText(link: ShareLinkListItem): string | null {
  if (link.scope !== 'task_selection') {
    return null;
  }

  const titles = Array.isArray(link.previewTitles)
    ? link.previewTitles.map((title) => title.trim()).filter(Boolean)
    : [];

  if (titles.length === 0) {
    return null;
  }

  return titles.join(', ');
}

function getSharePrintDetails(link: ShareLinkListItem): string {
  const previewText = getSharePreviewText(link);
  if (link.scope === 'project') {
    return 'Весь график';
  }

  return previewText ? `Разделы: ${previewText}` : 'Часть графика';
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
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [renamingLinkId, setRenamingLinkId] = useState<string | null>(null);
  const [downloadingLinkId, setDownloadingLinkId] = useState<string | null>(null);
  const visibleLinks = links.filter((link) => !link.revokedAt);

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

  const handleOpen = useCallback((link: ShareLinkListItem) => {
    window.open(resolveShareUrl(link.id), '_blank', 'noopener,noreferrer');
  }, []);

  const handleDownloadPdf = useCallback(async (link: ShareLinkListItem) => {
    if (downloadingLinkId === link.id) {
      return;
    }

    setDownloadingLinkId(link.id);
    setError(null);

    try {
      await printShareLinkSheet({
        shareUrl: resolveShareUrl(link.id),
        projectName,
        logoUrl: `${window.location.origin}/favicon.svg`,
        serviceName: 'GetGantt',
        descriptor: 'Сервис для быстрого создания графиков с помощью ИИ, а так же полноценного управления проектами. Легкая и простая онлайн-замена MS Project, Primavera и GanttPRO',
        details: getSharePrintDetails(link),
      });
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setDownloadingLinkId(null);
    }
  }, [downloadingLinkId, projectName]);

  const handleStartRename = useCallback((link: ShareLinkListItem) => {
    setEditingLinkId(link.id);
    setEditingLabel(getShareDisplayTitle(link));
    setError(null);
  }, []);

  const handleRename = useCallback(async (link: ShareLinkListItem) => {
    if (renamingLinkId === link.id) {
      return;
    }

    const nextLabel = editingLabel.trim();
    const currentLabel = getShareDisplayTitle(link);

    if (!nextLabel || nextLabel === currentLabel) {
      setEditingLinkId(null);
      setEditingLabel('');
      return;
    }

    setRenamingLinkId(link.id);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/share-links/${link.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: nextLabel,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { link?: ShareLinkListItem };
      if (data.link) {
        setLinks((current) => current.map((item) => item.id === data.link!.id ? data.link! : item));
      } else {
        await loadLinks();
      }
      setEditingLinkId(null);
      setEditingLabel('');
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    } finally {
      setRenamingLinkId(null);
    }
  }, [accessToken, editingLabel, loadLinks, projectId, renamingLinkId]);

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
          label: projectName,
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
      <div className="relative flex h-[min(86vh,720px)] w-[min(620px,100%)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800">Мастер ссылок</h2>
            <p className="text-sm text-slate-500">
              Отправьте весь график или только его часть
            </p>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={() => { void handleCreateWholeProjectLink(); }}
              disabled={submitting}
              className="h-10 flex-1 justify-center rounded-lg"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Весь график
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onStartPartialSelection();
                onClose();
              }}
              className="h-10 flex-1 justify-center rounded-lg border-slate-300 bg-white"
            >
              {selectionActive ? 'Вернуться к выбору' : 'Часть графика'}
            </Button>
            {selectionActive && (
              <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                В режиме выбора: {selectedTaskCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
          {!loading && visibleLinks.length > 0 && (
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Активные ссылки ({visibleLinks.length})
              </h3>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Загружаем ссылки...
              </div>
            ) : visibleLinks.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Ссылок пока нет.
              </div>
            ) : (
              <div className="space-y-2 pr-1">
                {visibleLinks.map((link) => (
                  <div
                    key={link.id}
                    className="rounded-xl bg-slate-100 p-2.5 transition-colors"
                  >
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {editingLinkId === link.id ? (
                          <input
                            autoFocus
                            value={editingLabel}
                            disabled={renamingLinkId === link.id}
                            onChange={(event) => setEditingLabel(event.target.value)}
                            onBlur={() => { void handleRename(link); }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleRename(link);
                              }
                              if (event.key === 'Escape') {
                                setEditingLinkId(null);
                                setEditingLabel('');
                              }
                            }}
                            className="h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-700 outline-none ring-0 transition-colors focus:border-primary"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="truncate text-sm font-bold leading-none text-slate-700">
                              {getShareDisplayTitle(link)}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartRename(link)}
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                              title="Переименовать"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            {renamingLinkId === link.id && <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-slate-400" />}
                          </div>
                        )}
                        <div className="mt-1 text-[10px] font-medium text-slate-400">{formatCreatedAt(link.createdAt)}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${link.scope === 'project'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-slate-200 text-slate-700'
                          }`}
                      >
                        {getShareScopeLabel(link.scope)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          readOnly
                          onClick={() => void handleCopy(link)}
                          value={resolveShareUrl(link.id)}
                          title="Нажмите, чтобы скопировать"
                          className="w-full cursor-pointer rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-500 outline-none ring-1 ring-inset ring-slate-200 transition-colors hover:ring-slate-300"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleCopy(link)}
                        className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${copiedLinkId === link.id
                          ? 'border-green-200 bg-green-50 text-green-600'
                          : ''
                          }`}
                      >
                        {copiedLinkId === link.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedLinkId === link.id ? 'Скопировано' : 'Копировать'}</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void handleDownloadPdf(link); }}
                        disabled={submitting || renamingLinkId === link.id || downloadingLinkId === link.id}
                        className="h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-slate-600"
                        title="Скачать QR-код"
                      >
                        {downloadingLinkId === link.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        <span>QR-код</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpen(link)}
                        className="h-9 w-9 shrink-0 rounded-lg p-0 text-slate-500"
                        title="Открыть"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleRevoke(link)}
                        disabled={submitting || renamingLinkId === link.id}
                        className="h-9 w-9 shrink-0 rounded-lg p-0 text-slate-500 hover:border-red-200 hover:text-red-500"
                        title="Отозвать доступ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {getSharePreviewText(link) && (
                      <div className="mt-2 truncate text-[11px] text-slate-500">
                        <span className="font-medium text-slate-600">Разделы:</span>{' '}
                        {getSharePreviewText(link)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-800"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
