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

type TemplateAdminFilter = 'all' | 'draft' | 'in_work' | 'published' | 'failed';

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

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'в очереди';
    case 'in_progress': return 'в работе';
    case 'review_required': return 'нужна проверка';
    case 'ready_to_publish': return 'готово';
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
    case 'queued': return 'bg-slate-100 text-slate-700';
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

function getPipelineStatus(item: TemplateAdminEntity): string | null {
  return item.job?.status ?? null;
}

function getEntityKind(item: TemplateAdminEntity): TemplatePublicationKind {
  return item.publication?.kind ?? item.job?.kind ?? 'template';
}

function getEntityCategory(item: TemplateAdminEntity): string {
  return item.publication?.category ?? item.job?.category ?? 'Без раздела';
}

function getEntityIndustry(item: TemplateAdminEntity): string {
  return item.publication?.industry ?? item.job?.industry ?? '—';
}

function getEntitySlug(item: TemplateAdminEntity): string {
  return item.publication?.slug ?? item.job?.slug ?? '—';
}

function getWorkflowLabel(item: TemplateAdminEntity): string {
  const primaryStatus = getPrimaryStatus(item);
  if (primaryStatus === 'published') {
    return 'Опубликовано';
  }
  if (primaryStatus === 'draft' || primaryStatus === 'review_required' || primaryStatus === 'ready_to_publish') {
    return 'В работе';
  }
  if (primaryStatus === 'failed' || primaryStatus === 'rejected') {
    return 'Проблема';
  }
  return 'Черновик';
}

function matchesFilter(item: TemplateAdminEntity, filter: TemplateAdminFilter): boolean {
  const primaryStatus = getPrimaryStatus(item);
  const pipelineStatus = getPipelineStatus(item);

  switch (filter) {
    case 'draft':
      return primaryStatus === 'draft';
    case 'in_work':
      return primaryStatus === 'draft'
        || primaryStatus === 'archived'
        || pipelineStatus === 'queued'
        || pipelineStatus === 'in_progress'
        || pipelineStatus === 'review_required'
        || pipelineStatus === 'ready_to_publish'
        || item.type === 'job';
    case 'published':
      return primaryStatus === 'published';
    case 'failed':
      return primaryStatus === 'failed' || primaryStatus === 'rejected' || pipelineStatus === 'failed';
    case 'all':
    default:
      return true;
  }
}

function buildCategoryOptions(entities: TemplateAdminEntity[]): string[] {
  return Array.from(new Set(entities.map((item) => getEntityCategory(item)))).sort((left, right) => left.localeCompare(right, 'ru'));
}

function buildKindLabel(kind: TemplatePublicationKind): string {
  return kind === 'block' ? 'Блок' : 'Шаблон';
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
      {children}
    </label>
  );
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
  const [sectionFilter, setSectionFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | TemplatePublicationKind>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    const publicationEntities: TemplateAdminEntity[] = publications.map((publication) => ({
      id: `publication:${publication.id}`,
      type: 'publication',
      publication,
      job: jobByPublicationId.get(publication.id) ?? null,
      source: sourceByProjectId.get(publication.sourceProjectId) ?? null,
      sortDate: publication.updatedAt,
    }));

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
    inWork: entities.filter((item) => matchesFilter(item, 'in_work')).length,
    published: entities.filter((item) => getPrimaryStatus(item) === 'published').length,
    failed: entities.filter((item) => matchesFilter(item, 'failed')).length,
  }), [entities]);

  const sectionOptions = useMemo(() => buildCategoryOptions(entities), [entities]);

  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entities.filter((item) => {
      if (!matchesFilter(item, filter)) {
        return false;
      }

      if (sectionFilter !== 'all' && getEntityCategory(item) !== sectionFilter) {
        return false;
      }

      if (kindFilter !== 'all' && getEntityKind(item) !== kindFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        buildEntityTitle(item),
        buildEntityDescription(item),
        getEntitySlug(item),
        getEntityCategory(item),
        getEntityIndustry(item),
        item.source?.projectName ?? '',
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [entities, filter, kindFilter, search, sectionFilter]);

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

  useEffect(() => {
    if (!selectedEntity) {
      setDrawerOpen(false);
    }
  }, [selectedEntity]);

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
      setCreatePanelOpen(false);
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
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Каталог шаблонов</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Список материалов, разделы, статус публикации и pipeline отдельно. Редактирование вынесено в правую колонку как обычная CMS-форма.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Всего: {counts.all}</span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">В работе: {counts.inWork}</span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Опубликовано: {counts.published}</span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Ошибки: {counts.failed}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию, slug, source"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as TemplateAdminFilter)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            >
              <option value="all">Все статусы</option>
              <option value="in_work">В работе</option>
              <option value="draft">Черновики</option>
              <option value="published">Опубликовано</option>
              <option value="failed">Ошибки</option>
            </select>
            <select
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            >
              <option value="all">Все разделы</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as 'all' | TemplatePublicationKind)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            >
              <option value="all">Все типы</option>
              <option value="template">Шаблоны</option>
              <option value="block">Блоки</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreatePanelOpen((current) => !current)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              {createPanelOpen ? 'Скрыть создание' : 'Новая генерация'}
            </button>
            <button
              type="button"
              onClick={() => { void load(); }}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              Обновить
            </button>
          </div>
        </div>

        {createPanelOpen && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-sm font-medium text-slate-900">Новая запись в pipeline</div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_180px_180px]">
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Что за график, для какого сценария, что должно попасть в публикацию"
                className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
              <div className="space-y-3">
                <select
                  value={createKind}
                  onChange={(event) => setCreateKind(event.target.value as TemplatePublicationKind)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                >
                  <option value="template">Шаблон</option>
                  <option value="block">Блок</option>
                </select>
                <input
                  value={createCategory}
                  onChange={(event) => setCreateCategory(event.target.value)}
                  placeholder="Раздел"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
                <input
                  value={createIndustry}
                  onChange={(event) => setCreateIndustry(event.target.value)}
                  placeholder="Отрасль"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>
              <div className="flex flex-col justify-between gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
                  <span>Автопубликация</span>
                </label>
                <button
                  type="button"
                  disabled={submitting || !createDescription.trim()}
                  onClick={() => { void submitCreateJob(); }}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Создание…' : 'Запустить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="min-h-[720px]">
        <div className="min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-xs uppercase tracking-[0.12em] text-slate-400">
            <span>Каталог</span>
            <span>{filteredEntities.length} записей</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-slate-500">Загрузка каталога…</div>
          ) : filteredEntities.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">Ничего не найдено по текущим фильтрам.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Материал</th>
                    <th className="px-3 py-3 font-medium">Раздел</th>
                    <th className="px-3 py-3 font-medium">Статус</th>
                    <th className="px-3 py-3 font-medium">Pipeline</th>
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 text-right font-medium">Обновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((item) => {
                    const primaryStatus = getPrimaryStatus(item);
                    const pipelineStatus = getPipelineStatus(item);
                    const isSelected = item.id === selectedEntityId;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          setSelectedEntityId(item.id);
                          setDrawerOpen(true);
                        }}
                        className={`cursor-pointer border-t border-slate-100 transition-colors ${isSelected ? 'bg-slate-100/80' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-900">{buildEntityTitle(item)}</span>
                              <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">
                                {buildKindLabel(getEntityKind(item))}
                              </span>
                              <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">
                                {getWorkflowLabel(item)}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">{getEntitySlug(item)}</div>
                            <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                              {buildEntityDescription(item)}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top text-xs text-slate-600">
                          <div>{getEntityCategory(item)}</div>
                          <div className="mt-1 text-slate-400">{getEntityIndustry(item)}</div>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusTone(primaryStatus)}`}>
                            {statusLabel(primaryStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-top">
                          {pipelineStatus ? (
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusTone(pipelineStatus)}`}>
                              {statusLabel(pipelineStatus)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-4 align-top text-xs text-slate-600">
                          <div className="line-clamp-2">{item.source?.projectName ?? 'Не привязан'}</div>
                        </td>
                        <td className="px-5 py-4 text-right align-top text-xs text-slate-500">
                          {formatDateTime(item.sortDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {drawerOpen && selectedEntity && (
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[560px] max-w-[calc(100vw-24px)] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Редактирование</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{buildEntityTitle(selectedEntity)}</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(getPrimaryStatus(selectedEntity))}`}>
                        {statusLabel(getPrimaryStatus(selectedEntity))}
                      </span>
                      {selectedEntity.job && (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(selectedEntity.job.status)}`}>
                          pipeline: {statusLabel(selectedEntity.job.status)}
                        </span>
                      )}
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        {buildKindLabel(getEntityKind(selectedEntity))}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        {getEntityCategory(selectedEntity)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-xl font-semibold text-slate-900">{buildEntityTitle(selectedEntity)}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{buildEntityDescription(selectedEntity)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEntity.source?.projectId && (
                      <button
                        type="button"
                        onClick={() => { void onAssumeProject(selectedEntity.source!.projectId); }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        Открыть source
                      </button>
                    )}
                    {selectedEntity.publication && (
                      <button
                        type="button"
                        onClick={() => { void regenerateSeo(selectedEntity.publication!.id); }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        {savingPublicationId === selectedEntity.publication.id ? 'SEO…' : 'Обновить SEO'}
                      </button>
                    )}
                    {selectedEntity.publication && selectedEntity.publication.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => { void publishPublication(selectedEntity.publication!.id); }}
                        className="rounded-xl bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90"
                      >
                        Опубликовать
                      </button>
                    )}
                    {!selectedEntity.publication && selectedEntity.job.publicationId && (
                      <button
                        type="button"
                        onClick={() => { void publishJob(selectedEntity.job.id); }}
                        className="rounded-xl bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90"
                      >
                        Довести до публикации
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 text-sm font-medium text-slate-900">Сводка</div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div><span className="text-slate-400">Slug:</span> {getEntitySlug(selectedEntity)}</div>
                    <div><span className="text-slate-400">Раздел:</span> {getEntityCategory(selectedEntity)}</div>
                    <div><span className="text-slate-400">Отрасль:</span> {getEntityIndustry(selectedEntity)}</div>
                    <div><span className="text-slate-400">Source:</span> {selectedEntity.source?.projectName ?? 'Не создан'}</div>
                    <div><span className="text-slate-400">Обновлено:</span> {formatDateTime(selectedEntity.sortDate)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 text-sm font-medium text-slate-900">Публикация и pipeline</div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div><span className="text-slate-400">Статус:</span> {statusLabel(getPrimaryStatus(selectedEntity))}</div>
                    <div><span className="text-slate-400">Pipeline:</span> {selectedEntity.job ? statusLabel(selectedEntity.job.status) : '—'}</div>
                    <div><span className="text-slate-400">Видимость:</span> {selectedEntity.publication ? visibilityLabel(selectedEntity.publication.visibility) : '—'}</div>
                    <div><span className="text-slate-400">Проверка:</span> {selectedEntity.publication ? verificationLabel(selectedEntity.publication.verificationStatus) : '—'}</div>
                    <div><span className="text-slate-400">Задач:</span> {selectedEntity.publication?.taskCount ?? '—'}</div>
                  </div>
                </div>
              </div>

              {selectedEntity.job?.errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {selectedEntity.job.errorMessage}
                </div>
              )}

              {selectedEntity.publication && draft ? (
                <>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Контент</div>
                        <div className="text-sm text-slate-500">Каталогизация и карточка материала.</div>
                      </div>
                      <button
                        type="button"
                        disabled={savingPublicationId === selectedEntity.publication.id || !draft.title.trim() || !draft.slug.trim()}
                        onClick={() => { void savePublication(selectedEntity.publication!.id); }}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingPublicationId === selectedEntity.publication.id ? 'Сохранение…' : 'Сохранить'}
                      </button>
                    </div>

                    <div className="grid gap-3">
                      <div>
                        <FieldLabel>Title</FieldLabel>
                        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Slug</FieldLabel>
                        <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Раздел</FieldLabel>
                        <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Отрасль</FieldLabel>
                        <input value={draft.industry} onChange={(event) => setDraft({ ...draft, industry: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Статус публикации</FieldLabel>
                        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TemplatePublicationStatus })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary">
                          <option value="draft">draft</option>
                          <option value="published">published</option>
                          <option value="archived">archived</option>
                          <option value="rejected">rejected</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Видимость</FieldLabel>
                        <select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as TemplatePublicationVisibility })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary">
                          <option value="private">private</option>
                          <option value="marketplace">marketplace</option>
                          <option value="site">site</option>
                          <option value="both">both</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Статус проверки</FieldLabel>
                        <select value={draft.verificationStatus} onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value as TemplatePublicationVerificationStatus })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary">
                          <option value="unverified">unverified</option>
                          <option value="reviewed">reviewed</option>
                          <option value="verified">verified</option>
                          <option value="editorial">editorial</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <FieldLabel>Subtitle</FieldLabel>
                        <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Summary</FieldLabel>
                        <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Tags</FieldLabel>
                        <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-4 text-sm font-medium text-slate-900">SEO</div>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel>SEO title</FieldLabel>
                        <input value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>SEO description</FieldLabel>
                        <textarea value={draft.seoDescription} onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>SEO body</FieldLabel>
                        <textarea value={draft.seoBody} onChange={(event) => setDraft({ ...draft, seoBody: event.target.value })} className="min-h-36 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-4 text-sm font-medium text-slate-900">Медиа и ссылки</div>
                    <div className="grid gap-3">
                      <div>
                        <FieldLabel>Cover image URL</FieldLabel>
                        <input value={draft.coverImageUrl} onChange={(event) => setDraft({ ...draft, coverImageUrl: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                      <div>
                        <FieldLabel>Preview image URL</FieldLabel>
                        <input value={draft.previewImageUrl} onChange={(event) => setDraft({ ...draft, previewImageUrl: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary" />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={`/${selectedEntity.publication.kind === 'block' ? 'blocks' : 'templates'}/${selectedEntity.publication.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                        Открыть detail page
                      </a>
                      <a href={`/${selectedEntity.publication.kind === 'block' ? 'blocks' : 'templates'}`} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                        Открыть каталог
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Эта запись пока существует как pipeline-job. Когда появится publication, справа откроется полная CMS-форма редактирования.
                </div>
              )}

              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-2 text-sm font-medium text-red-900">Удаление</div>
                <div className="mb-4 text-sm text-red-700">
                  Удаляет запись вместе со связанным job/source хвостом.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Удалить запись целиком?')) {
                      void deleteAllForEntity(selectedEntity);
                    }
                  }}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  {deletingAction === `all:${selectedEntity.id}` ? 'Удаление…' : 'Удалить запись'}
                </button>
              </div>
            </div>
          </aside>
      )}
    </section>
  );
}
