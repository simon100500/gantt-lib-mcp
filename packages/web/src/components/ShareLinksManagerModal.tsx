import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, LoaderCircle, ScissorsLineDashed, Trash2, X } from 'lucide-react';

import { GanttChart } from './GanttChart.tsx';
import { Button } from './ui/button.tsx';
import type { ShareLinkListItem } from '../lib/apiTypes.ts';
import type { Task } from '../types.ts';
import { collectTaskSubtreeIds } from '../lib/shareLinkSelection.ts';

interface ShareLinksManagerModalProps {
  accessToken: string;
  projectId: string;
  projectName: string;
  tasks: Task[];
  ganttDayMode: 'business' | 'calendar';
  onClose: () => void;
  onStatusChange?: (status: 'idle' | 'creating' | 'copied' | 'error') => void;
}

type Mode = 'list' | 'select';

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleString('ru-RU');
}

function inferSelectionDelta(previous: Set<string>, next: Set<string>): { added: string[]; removed: string[] } {
  const added = Array.from(next).filter((id) => !previous.has(id));
  const removed = Array.from(previous).filter((id) => !next.has(id));
  return { added, removed };
}

export function ShareLinksManagerModal({
  accessToken,
  projectId,
  projectName,
  tasks,
  ganttDayMode,
  onClose,
  onStatusChange,
}: ShareLinksManagerModalProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [links, setLinks] = useState<ShareLinkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

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
      await navigator.clipboard.writeText(link.url);
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

  const handleSelectedTaskIdsChange = useCallback((nextSelectedTaskIds: Set<string>) => {
    setSelectedTaskIds((previousSelectedTaskIds) => {
      const { added, removed } = inferSelectionDelta(previousSelectedTaskIds, nextSelectedTaskIds);
      if (added.length !== 1 && removed.length !== 1) {
        return nextSelectedTaskIds;
      }

      const changedTaskId = added[0] ?? removed[0];
      if (!changedTaskId) {
        return nextSelectedTaskIds;
      }

      const changedTask = taskMap.get(changedTaskId);
      if (!changedTask) {
        return nextSelectedTaskIds;
      }

      const subtreeIds = collectTaskSubtreeIds(tasks, changedTaskId);
      if (subtreeIds.length <= 1) {
        return nextSelectedTaskIds;
      }

      const normalized = new Set(nextSelectedTaskIds);
      const shouldSelect = added.length === 1;
      for (const taskId of subtreeIds) {
        if (shouldSelect) {
          normalized.add(taskId);
        } else {
          normalized.delete(taskId);
        }
      }
      return normalized;
    });
  }, [taskMap, tasks]);

  const handleCreatePartialLink = useCallback(async () => {
    if (selectedTaskIds.size === 0) {
      setError('Выберите хотя бы одну задачу.');
      return;
    }

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
          scope: 'task_selection',
          includedTaskIds: Array.from(selectedTaskIds),
          label: `${projectName} · часть графика`,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setMode('list');
      setSelectedTaskIds(new Set());
      onStatusChange?.('idle');
      await loadLinks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
      onStatusChange?.('error');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, loadLinks, onStatusChange, projectId, projectName, selectedTaskIds]);

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
          <div className="flex items-center gap-3">
            {mode === 'select' && (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
                onClick={() => {
                  setMode('list');
                  setSelectedTaskIds(new Set());
                }}
                aria-label="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Мастер ссылок</h2>
              <p className="text-sm text-slate-500">
                {mode === 'list'
                  ? 'Создавайте, копируйте и отзывайте ссылки на проект и его часть.'
                  : 'Выберите задачи для ссылки. При выборе родителя его поддерево выделяется автоматически.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === 'list' ? (
          <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <div className="mb-4 flex flex-wrap gap-3">
              <Button type="button" onClick={() => { void handleCreateWholeProjectLink(); }} disabled={submitting}>
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Весь график
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode('select')} disabled={submitting || tasks.length === 0}>
                <ScissorsLineDashed className="h-4 w-4" />
                Часть графика
              </Button>
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
                    <div key={link.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
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
                          <div className="mt-2 truncate text-sm font-medium text-slate-900">{link.label}</div>
                          <div className="mt-1 text-xs text-slate-500">Создана {formatCreatedAt(link.createdAt)}</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" variant="outline" onClick={() => void handleCopy(link)} disabled={Boolean(link.revokedAt)}>
                            {copiedLinkId === link.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedLinkId === link.id ? 'Скопировано' : 'Копировать'}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => void handleRevoke(link)} disabled={Boolean(link.revokedAt) || submitting}>
                            <Trash2 className="h-4 w-4" />
                            Отозвать
                          </Button>
                        </div>
                      </div>
                      <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                        {link.url}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 px-6 py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                Выбрано задач: <span className="font-semibold text-slate-900">{selectedTaskIds.size}</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedTaskIds(new Set())} disabled={selectedTaskIds.size === 0 || submitting}>
                  Сбросить
                </Button>
                <Button type="button" onClick={() => void handleCreatePartialLink()} disabled={selectedTaskIds.size === 0 || submitting}>
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Создать ссылку
                </Button>
              </div>
            </div>

            <div className="h-[calc(100%-3rem)] overflow-hidden rounded-xl border border-slate-200">
              <GanttChart
                tasks={tasks}
                showTaskList={true}
                showChart={false}
                containerHeight="100%"
                rowHeight={36}
                headerHeight={40}
                enableTaskMultiSelect={true}
                selectedTaskIds={selectedTaskIds}
                onSelectedTaskIdsChange={handleSelectedTaskIdsChange}
                disableTaskDrag={true}
                disableTaskNameEditing={true}
                disableDependencyEditing={true}
                businessDays={ganttDayMode !== 'calendar'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
