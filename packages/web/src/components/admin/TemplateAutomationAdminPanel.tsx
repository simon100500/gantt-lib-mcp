import { useEffect, useMemo, useState } from 'react';
import type {
  TemplateGenerationJobListItem,
  TemplateGenerationSourceListItem,
  TemplatePublicationKind,
  TemplatePublicationListItem,
  TemplatePublicationStatus,
  TemplatePublicationVerificationStatus,
  TemplatePublicationVisibility,
} from '../../lib/apiTypes.ts';

type TemplateAdminFilter = 'all' | 'draft' | 'published' | 'queue' | 'failed';

type TemplateAdminEntity =
  | {
      id: string;
      type: 'publication';
      publication: TemplatePublicationListItem;
      job: TemplateGenerationJobListItem | null;
      source: TemplateGenerationSourceListItem | null;
      sortDate: string;
    }
  | {
      id: string;
      type: 'job';
      publication: null;
      job: TemplateGenerationJobListItem;
      source: TemplateGenerationSourceListItem | null;
      sortDate: string;
    };

type PublicationDraft = {
  title: string;
  slug: string;
  subtitle: string;
  summary: string;
  category: string;
  industry: string;
  tags: string;
  status: TemplatePublicationStatus;
  visibility: TemplatePublicationVisibility;
  verificationStatus: TemplatePublicationVerificationStatus;
  seoTitle: string;
  seoDescription: string;
  seoBody: string;
  coverImageUrl: string;
  previewImageUrl: string;
};

interface TemplateAutomationAdminPanelProps {
  fetchAdmin: (input: string, init?: RequestInit) => Promise<Response>;
  onAssumeProject: (projectId: string) => Promise<void>;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('ru-RU');
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'в очереди';
    case 'in_progress': return 'в работе';
    case 'review_required': return 'нужна проверка';
    case 'ready_to_publish': return 'готово к публикации';
    case 'published': return 'опубликовано';
    case 'failed': return 'ошибка';
    case 'draft': return 'черновик';
    case 'archived': return 'архив';
    case 'rejected': return 'отклонено';
    default: return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'published': return 'bg-green-100 text-green-700';
    case 'ready_to_publish': return 'bg-blue-100 text-blue-700';
    case 'review_required': return 'bg-amber-100 text-amber-800';
    case 'draft': return 'bg-sky-100 text-sky-700';
    case 'archived': return 'bg-slate-200 text-slate-700';
    case 'rejected':
    case 'failed': return 'bg-red-100 text-red-700';
    case 'in_progress': return 'bg-violet-100 text-violet-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function visibilityLabel(value: TemplatePublicationVisibility): string {
  switch (value) {
    case 'private': return 'Только внутри';
    case 'marketplace': return 'Marketplace';
    case 'site': return 'Сайт';
    case 'both': return 'Marketplace + сайт';
    default: return value;
  }
}

function verificationLabel(value: TemplatePublicationVerificationStatus): string {
  switch (value) {
    case 'unverified': return 'Не проверено';
    case 'reviewed': return 'Проверено';
    case 'verified': return 'Верифицировано';
    case 'editorial': return 'Редакционное';
    default: return value;
  }
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPublicationDraft(publication: TemplatePublicationListItem): PublicationDraft {
  return {
    title: publication.title,
    slug: publication.slug,
    subtitle: publication.subtitle ?? '',
    summary: publication.summary ?? '',
    category: publication.category ?? '',
    industry: publication.industry ?? '',
    tags: publication.tags.join(', '),
    status: publication.status,
    visibility: publication.visibility,
    verificationStatus: publication.verificationStatus,
    seoTitle: publication.seoTitle ?? '',
    seoDescription: publication.seoDescription ?? '',
    seoBody: publication.seoBody ?? '',
    coverImageUrl: publication.coverImageUrl ?? '',
    previewImageUrl: publication.previewImageUrl ?? '',
  };
}

function buildEntityTitle(item: TemplateAdminEntity): string {
  if (item.publication) {
    return item.publication.title;
  }
  return item.job.title ?? 'Новая генерация';
}

function buildEntityDescription(item: TemplateAdminEntity): string {
  if (item.publication?.summary?.trim()) {
    return item.publication.summary;
  }
  return item.job?.sourceDescription ?? 'Описание пока не добавлено.';
}

function getPrimaryStatus(item: TemplateAdminEntity): string {
  if (item.publication) {
    return item.publication.status;
  }
  return item.job.status;
}

function matchesFilter(item: TemplateAdminEntity, filter: TemplateAdminFilter): boolean {
  const primaryStatus = getPrimaryStatus(item);
  if (filter === 'all') {
    return true;
  }
  if (filter === 'draft') {
    return primaryStatus === 'draft';
  }
  if (filter === 'published') {
    return primaryStatus === 'published';
  }
  if (filter === 'failed') {
    return primaryStatus === 'failed';
  }
  return !item.publication;
}

export function TemplateAutomationAdminPanel({
  fetchAdmin,
  onAssumeProject,
}: TemplateAutomationAdminPanelProps) {
  const [jobs, setJobs] = useState<TemplateGenerationJobListItem[]>([]);
  const [sources, setSources] = useState<TemplateGenerationSourceListItem[]>([]);
  const [publications, setPublications] = useState<TemplatePublicationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingPublicationId, setSavingPublicationId] = useState<string | null>(null);
  const [deletingAction, setDeletingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDescription, setCreateDescription] = useState('');
  const [createKind, setCreateKind] = useState<TemplatePublicationKind>('template');
  const [createCategory, setCreateCategory] = useState('');
  const [createIndustry, setCreateIndustry] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [filter, setFilter] = useState<TemplateAdminFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PublicationDraft | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResponse, sourcesResponse, publicationsResponse] = await Promise.all([
        fetchAdmin('/api/admin/template-generation/jobs'),
        fetchAdmin('/api/admin/template-generation/sources'),
        fetchAdmin('/api/admin/template-generation/publications'),
      ]);
      if (!jobsResponse.ok || !sourcesResponse.ok || !publicationsResponse.ok) {
        throw new Error(`HTTP ${jobsResponse.status}/${sourcesResponse.status}/${publicationsResponse.status}`);
      }
      const jobsPayload = await jobsResponse.json() as { jobs: TemplateGenerationJobListItem[] };
      const sourcesPayload = await sourcesResponse.json() as { sources: TemplateGenerationSourceListItem[] };
      const publicationsPayload = await publicationsResponse.json() as { publications: TemplatePublicationListItem[] };
      setJobs(jobsPayload.jobs);
      setSources(sourcesPayload.sources);
      setPublications(publicationsPayload.publications);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load template admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sourceByProjectId = useMemo(
    () => new Map(sources.map((source) => [source.projectId, source])),
    [sources],
  );
  const jobByPublicationId = useMemo(
    () => new Map(
      jobs
        .filter((job): job is TemplateGenerationJobListItem & { publicationId: string } => Boolean(job.publicationId))
        .map((job) => [job.publicationId, job]),
    ),
    [jobs],
  );

  const entities = useMemo<TemplateAdminEntity[]>(() => {
    const publicationEntities: TemplateAdminEntity[] = publications.map((publication) => {
      const job = jobByPublicationId.get(publication.id) ?? null;
      const source = sourceByProjectId.get(publication.sourceProjectId) ?? null;
      return {
        id: `publication:${publication.id}`,
        type: 'publication',
        publication,
        job,
        source,
        sortDate: publication.updatedAt,
      };
    });

    const orphanJobEntities: TemplateAdminEntity[] = jobs
      .filter((job) => !job.publicationId)
      .map((job) => ({
        id: `job:${job.id}`,
        type: 'job' as const,
        publication: null,
        job,
        source: job.sourceProjectId ? sourceByProjectId.get(job.sourceProjectId) ?? null : null,
        sortDate: job.updatedAt,
      }));

    return [...publicationEntities, ...orphanJobEntities]
      .sort((left, right) => right.sortDate.localeCompare(left.sortDate));
  }, [jobByPublicationId, jobs, publications, sourceByProjectId]);

  const counts = useMemo(() => ({
    all: entities.length,
    draft: entities.filter((item) => getPrimaryStatus(item) === 'draft').length,
    published: entities.filter((item) => getPrimaryStatus(item) === 'published').length,
    queue: entities.filter((item) => !item.publication).length,
    failed: entities.filter((item) => getPrimaryStatus(item) === 'failed').length,
  }), [entities]);

  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entities.filter((item) => {
      if (!matchesFilter(item, filter)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        buildEntityTitle(item),
        buildEntityDescription(item),
        item.publication?.slug ?? '',
        item.publication?.category ?? item.job?.category ?? '',
        item.publication?.industry ?? item.job?.industry ?? '',
        item.source?.projectName ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [entities, filter, search]);

  useEffect(() => {
    if (filteredEntities.length === 0) {
      setSelectedEntityId(null);
      return;
    }
    if (!selectedEntityId || !filteredEntities.some((item) => item.id === selectedEntityId)) {
      setSelectedEntityId(filteredEntities[0].id);
    }
  }, [filteredEntities, selectedEntityId]);

  const selectedEntity = useMemo(
    () => filteredEntities.find((item) => item.id === selectedEntityId)
      ?? entities.find((item) => item.id === selectedEntityId)
      ?? null,
    [entities, filteredEntities, selectedEntityId],
  );

  useEffect(() => {
    if (!selectedEntity?.publication) {
      setDraft(null);
      return;
    }
    setDraft(toPublicationDraft(selectedEntity.publication));
  }, [selectedEntity?.id, selectedEntity?.publication]);

  const submitCreateJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchAdmin('/api/admin/template-generation/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: createDescription,
          kind: createKind,
          category: createCategory || undefined,
          industry: createIndustry || undefined,
          autoPublish,
        }),
      });
      const payload = await response.json().catch(() => null) as { job?: TemplateGenerationJobListItem; publication?: TemplatePublicationListItem; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      setCreateDescription('');
      setCreateCategory('');
      setCreateIndustry('');
      setAutoPublish(false);
      await load();
      if (payload?.publication?.id) {
        setSelectedEntityId(`publication:${payload.publication.id}`);
      } else if (payload?.job?.id) {
        setSelectedEntityId(`job:${payload.job.id}`);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const publishJob = async (jobId: string) => {
    setError(null);
    const response = await fetchAdmin(`/api/admin/template-generation/jobs/${jobId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'both', verificationStatus: 'editorial' }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    }
    await load();
  };

  const regenerateSeo = async (publicationId: string) => {
    setSavingPublicationId(publicationId);
    setError(null);
    try {
      const response = await fetchAdmin(`/api/admin/template-generation/publications/${publicationId}/regenerate-seo`, {
        method: 'POST',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await load();
    } catch (seoError) {
      setError(seoError instanceof Error ? seoError.message : 'Failed to regenerate SEO draft');
    } finally {
      setSavingPublicationId(null);
    }
  };

  const savePublication = async (publicationId: string) => {
    if (!draft) {
      return;
    }
    setSavingPublicationId(publicationId);
    setError(null);
    try {
      const response = await fetchAdmin(`/api/template-publications/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          slug: draft.slug.trim(),
          subtitle: normalizeText(draft.subtitle),
          summary: normalizeText(draft.summary),
          category: normalizeText(draft.category),
          industry: normalizeText(draft.industry),
          tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
          status: draft.status,
          visibility: draft.visibility,
          verificationStatus: draft.verificationStatus,
          seoTitle: normalizeText(draft.seoTitle),
          seoDescription: normalizeText(draft.seoDescription),
          seoBody: normalizeText(draft.seoBody),
          coverImageUrl: normalizeText(draft.coverImageUrl),
          previewImageUrl: normalizeText(draft.previewImageUrl),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save publication');
    } finally {
      setSavingPublicationId(null);
    }
  };

  const publishPublication = async (publicationId: string) => {
    setSavingPublicationId(publicationId);
    setError(null);
    try {
      const response = await fetchAdmin(`/api/template-publications/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'published',
          visibility: 'both',
          verificationStatus: 'editorial',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish publication');
    } finally {
      setSavingPublicationId(null);
    }
  };

  const deleteAllForEntity = async (entity: TemplateAdminEntity) => {
    setDeletingAction(`all:${entity.id}`);
    setError(null);
    try {
      if (entity.job) {
        const jobResponse = await fetchAdmin(`/api/admin/template-generation/jobs/${entity.job.id}`, {
          method: 'DELETE',
        });
        if (!jobResponse.ok) {
          const payload = await jobResponse.json().catch(() => ({ error: `HTTP ${jobResponse.status}` })) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${jobResponse.status}`);
        }
      }

      if (entity.source?.projectId) {
        const sourceResponse = await fetchAdmin(`/api/admin/template-generation/sources/${entity.source.projectId}`, {
          method: 'DELETE',
        });
        if (!sourceResponse.ok) {
          const payload = await sourceResponse.json().catch(() => ({ error: `HTTP ${sourceResponse.status}` })) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${sourceResponse.status}`);
        }
      } else if (entity.publication?.id) {
        const publicationResponse = await fetchAdmin(`/api/admin/template-generation/publications/${entity.publication.id}`, {
          method: 'DELETE',
        });
        if (!publicationResponse.ok) {
          const payload = await publicationResponse.json().catch(() => ({ error: `HTTP ${publicationResponse.status}` })) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${publicationResponse.status}`);
        }
      }

      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete linked entities');
    } finally {
      setDeletingAction(null);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Шаблоны как CMS</h2>
            <p className="mt-1 text-sm text-slate-500">Одна запись = одна карточка материала. Генерация и source остаются служебным контекстом внутри этой карточки.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Всего</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.all}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Черновики</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.draft}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Опубликовано</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.published}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Очередь</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.queue}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={() => setCreatePanelOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">Генерация нового материала</div>
              <div className="text-sm text-slate-500">Скрытый технический блок: создаёт source-проект и карточку публикации.</div>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
              {createPanelOpen ? 'Скрыть' : 'Показать'}
            </span>
          </button>
          {createPanelOpen && (
            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_220px]">
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Опиши материал как для CMS: что это за шаблон, для кого он, какие этапы и ограничения должны быть внутри."
                className="min-h-32 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-primary"
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <select value={createKind} onChange={(event) => setCreateKind(event.target.value as TemplatePublicationKind)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary">
                  <option value="template">template</option>
                  <option value="block">block</option>
                </select>
                <input value={createCategory} onChange={(event) => setCreateCategory(event.target.value)} placeholder="Категория" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary" />
                <input value={createIndustry} onChange={(event) => setCreateIndustry(event.target.value)} placeholder="Отрасль" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary" />
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
                  Сразу публиковать
                </label>
                <button
                  type="button"
                  disabled={submitting || !createDescription.trim()}
                  onClick={() => { void submitCreateJob(); }}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Создание…' : 'Создать материал'}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Загрузка…</div>}

        {!loading && (
          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">Материалы</div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по title, slug, category..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ['all', `Все ${counts.all}`],
                    ['draft', `Черновики ${counts.draft}`],
                    ['published', `Опубликовано ${counts.published}`],
                    ['queue', `Очередь ${counts.queue}`],
                    ['failed', `Ошибки ${counts.failed}`],
                  ] as Array<[TemplateAdminFilter, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${filter === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {filteredEntities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Ничего не найдено.</div>
                ) : filteredEntities.map((item) => {
                  const title = buildEntityTitle(item);
                  const primaryStatus = getPrimaryStatus(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedEntityId(item.id)}
                      className={`w-full rounded-3xl border p-4 text-left transition-colors ${selectedEntityId === item.id ? 'border-primary bg-primary/[0.05]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(primaryStatus)}`}>{statusLabel(primaryStatus)}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item.publication ? item.publication.kind : item.job.kind}</span>
                        </div>
                      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
                    </button>
                  );
                })}
              </div>

            </aside>

            <div>
              {!selectedEntity ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-400">Выбери материал слева.</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedEntity.publication && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(selectedEntity.publication.status)}`}>
                              {statusLabel(selectedEntity.publication.status)}
                            </span>
                          )}
                          {selectedEntity.job && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(selectedEntity.job.status)}`}>
                              pipeline: {statusLabel(selectedEntity.job.status)}
                            </span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {selectedEntity.publication ? selectedEntity.publication.kind : selectedEntity.job.kind}
                          </span>
                        </div>
                        <h3 className="mt-3 text-2xl font-semibold text-slate-900">{buildEntityTitle(selectedEntity)}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{buildEntityDescription(selectedEntity)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedEntity.source?.projectId && (
                          <button type="button" onClick={() => { void onAssumeProject(selectedEntity.source!.projectId); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            Открыть source
                          </button>
                        )}
                        {selectedEntity.publication && (
                          <button type="button" onClick={() => { void regenerateSeo(selectedEntity.publication!.id); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            {savingPublicationId === selectedEntity.publication.id ? 'Обновление SEO…' : 'Обновить SEO'}
                          </button>
                        )}
                        {selectedEntity.publication && selectedEntity.publication.status !== 'published' && (
                          <button type="button" onClick={() => { void publishPublication(selectedEntity.publication!.id); }} className="rounded-2xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90">
                            Опубликовать
                          </button>
                        )}
                        {!selectedEntity.publication && selectedEntity.job.publicationId && (
                          <button type="button" onClick={() => { void publishJob(selectedEntity.job.id); }} className="rounded-2xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90">
                            Опубликовать job
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                      {selectedEntity.publication && draft ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Редактирование полей</div>
                              <div className="text-sm text-slate-500">Обычная CMS-форма для метаданных, публикации и SEO.</div>
                            </div>
                            <button
                              type="button"
                              disabled={savingPublicationId === selectedEntity.publication.id || !draft.title.trim() || !draft.slug.trim()}
                              onClick={() => { void savePublication(selectedEntity.publication!.id); }}
                              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingPublicationId === selectedEntity.publication.id ? 'Сохранение…' : 'Сохранить'}
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Title</label>
                              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Slug</label>
                              <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Category</label>
                              <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Industry</label>
                              <input value={draft.industry} onChange={(event) => setDraft({ ...draft, industry: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Status</label>
                              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TemplatePublicationStatus })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary">
                                <option value="draft">draft</option>
                                <option value="published">published</option>
                                <option value="archived">archived</option>
                                <option value="rejected">rejected</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Visibility</label>
                              <select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as TemplatePublicationVisibility })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary">
                                <option value="private">private</option>
                                <option value="marketplace">marketplace</option>
                                <option value="site">site</option>
                                <option value="both">both</option>
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Verification</label>
                              <select value={draft.verificationStatus} onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value as TemplatePublicationVerificationStatus })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary">
                                <option value="unverified">unverified</option>
                                <option value="reviewed">reviewed</option>
                                <option value="verified">verified</option>
                                <option value="editorial">editorial</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Subtitle</label>
                            <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Summary</label>
                            <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className="min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Tags</label>
                            <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="construction, residential, fit-out" className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                          </div>

                          <div className="grid gap-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">SEO title</label>
                              <input value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">SEO description</label>
                              <textarea value={draft.seoDescription} onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })} className="min-h-24 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">SEO body</label>
                              <textarea value={draft.seoBody} onChange={(event) => setDraft({ ...draft, seoBody: event.target.value })} className="min-h-40 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Cover image URL</label>
                              <input value={draft.coverImageUrl} onChange={(event) => setDraft({ ...draft, coverImageUrl: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Preview image URL</label>
                              <input value={draft.previewImageUrl} onChange={(event) => setDraft({ ...draft, previewImageUrl: event.target.value })} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-slate-900">Публикация ещё не создана</div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            Эта карточка пока существует только как технический job. Когда генерация создаст publication, здесь появится обычная CMS-форма редактирования.
                          </div>
                          {selectedEntity.job && selectedEntity.job.publicationId && (
                            <button type="button" onClick={() => { void publishJob(selectedEntity.job!.id); }} className="rounded-2xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90">
                              Довести до публикации
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-900">Служебный контекст</div>
                        <div className="mt-4 space-y-4 text-sm text-slate-600">
                          <div>
                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Source project</div>
                            <div className="mt-1 font-medium text-slate-900">{selectedEntity.source?.projectName ?? 'Не создан'}</div>
                            <div className="mt-1">{selectedEntity.source?.sourceDescription ?? selectedEntity.job?.sourceDescription ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Pipeline</div>
                            <div className="mt-1 font-medium text-slate-900">{selectedEntity.job ? statusLabel(selectedEntity.job.status) : 'Связанный job не найден'}</div>
                            <div className="mt-1">Создано: {formatDateTime(selectedEntity.job?.createdAt ?? selectedEntity.publication?.createdAt ?? null)}</div>
                            <div className="mt-1">Обновлено: {formatDateTime(selectedEntity.job?.updatedAt ?? selectedEntity.publication?.updatedAt ?? null)}</div>
                            {selectedEntity.job?.errorMessage && (
                              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">{selectedEntity.job.errorMessage}</div>
                            )}
                          </div>
                          {selectedEntity.publication && (
                            <div>
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Публикация</div>
                              <div className="mt-1 font-medium text-slate-900">{visibilityLabel(selectedEntity.publication.visibility)}</div>
                              <div className="mt-1">{verificationLabel(selectedEntity.publication.verificationStatus)}</div>
                              <div className="mt-1">{selectedEntity.publication.taskCount} задач в шаблоне</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {selectedEntity.publication && (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <div className="mb-3 text-sm font-semibold text-slate-900">Быстрые действия</div>
                          <div className="flex flex-col gap-2">
                            <a href={`/${selectedEntity.publication.kind === 'block' ? 'blocks' : 'templates'}/${selectedEntity.publication.slug}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-100">
                              Preview material
                            </a>
                            <a href={`/${selectedEntity.publication.kind === 'block' ? 'blocks' : 'templates'}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-100">
                              Preview catalog
                            </a>
                            {selectedEntity.source?.projectId && (
                              <button type="button" onClick={() => { void onAssumeProject(selectedEntity.source!.projectId); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100">
                                Открыть source для ручной правки
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
                        <div className="mb-3 text-sm font-semibold text-red-900">Удаление</div>
                        <div className="mb-4 text-sm leading-6 text-red-700">
                          Это одна запись. Удаление сносит весь связанный хвост целиком.
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Удалить запись целиком?')) {
                                void deleteAllForEntity(selectedEntity);
                              }
                            }}
                            className="rounded-2xl bg-red-600 px-4 py-3 text-left text-sm font-medium text-white hover:bg-red-700"
                          >
                            {deletingAction === `all:${selectedEntity.id}` ? 'Удаление…' : 'Удалить запись'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
