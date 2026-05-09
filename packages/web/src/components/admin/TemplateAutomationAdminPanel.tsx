import { useEffect, useMemo, useState } from 'react';
import type {
  TemplateGenerationJobListItem,
  TemplateGenerationSourceListItem,
  TemplatePublicationKind,
  TemplatePublicationListItem,
} from '../../lib/apiTypes.ts';

type TemplateAdminTab = 'jobs' | 'sources' | 'publications';

interface TemplateAutomationAdminPanelProps {
  fetchAdmin: (input: string, init?: RequestInit) => Promise<Response>;
  onAssumeProject: (projectId: string) => Promise<void>;
}

function readInitialTab(): TemplateAdminTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return tab === 'sources' || tab === 'publications' ? tab : 'jobs';
}

function setAdminTab(tab: TemplateAdminTab): void {
  const url = new URL(window.location.href);
  url.searchParams.set('section', 'templates');
  url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', url.toString());
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('ru-RU');
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'queued';
    case 'in_progress': return 'in progress';
    case 'review_required': return 'review required';
    case 'ready_to_publish': return 'ready to publish';
    case 'published': return 'published';
    case 'failed': return 'failed';
    default: return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'published': return 'bg-green-100 text-green-700';
    case 'ready_to_publish': return 'bg-blue-100 text-blue-700';
    case 'review_required': return 'bg-amber-100 text-amber-800';
    case 'failed': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export function TemplateAutomationAdminPanel({
  fetchAdmin,
  onAssumeProject,
}: TemplateAutomationAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<TemplateAdminTab>(() => readInitialTab());
  const [jobs, setJobs] = useState<TemplateGenerationJobListItem[]>([]);
  const [sources, setSources] = useState<TemplateGenerationSourceListItem[]>([]);
  const [publications, setPublications] = useState<TemplatePublicationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<TemplatePublicationKind>('template');
  const [category, setCategory] = useState('');
  const [industry, setIndustry] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);

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
    setAdminTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    void load();
  }, []);

  const publicationById = useMemo(() => new Map(publications.map((publication) => [publication.id, publication])), [publications]);

  const submitCreateJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchAdmin('/api/admin/template-generation/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          kind,
          category: category || undefined,
          industry: industry || undefined,
          autoPublish,
        }),
      });
      const payload = await response.json().catch(() => null) as { job?: TemplateGenerationJobListItem; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      setDescription('');
      setCategory('');
      setIndustry('');
      setAutoPublish(false);
      setActiveTab('jobs');
      await load();
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
    setError(null);
    const response = await fetchAdmin(`/api/admin/template-generation/publications/${publicationId}/regenerate-seo`, {
      method: 'POST',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    }
    await load();
  };

  const publishPublication = async (publicationId: string) => {
    setError(null);
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
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Шаблоны</h2>
            <p className="mt-1 text-sm text-slate-500">Admin workflow: source project → publication → SEO draft → manual publish.</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(['jobs', 'sources', 'publications'] as TemplateAdminTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {tab[0].toUpperCase()}{tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_160px]">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Опиши будущий шаблон: тип объекта, масштаб, ключевые этапы, ограничения, если есть."
              className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-primary"
            />
            <div className="space-y-3">
              <select value={kind} onChange={(event) => setKind(event.target.value as TemplatePublicationKind)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
                <option value="template">template</option>
                <option value="block">block</option>
              </select>
              <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Категория" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
              <input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Отрасль" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
                auto-publish
              </label>
              <button
                type="button"
                disabled={submitting || !description.trim()}
                onClick={() => { void submitCreateJob(); }}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Запуск…' : 'Создать по описанию'}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Загрузка…</div>}

        {!loading && activeTab === 'jobs' && (
          <div className="space-y-3">
            {jobs.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Jobs пока нет.</div> : jobs.map((job) => {
              const publication = job.publicationId ? publicationById.get(job.publicationId) ?? null : null;
              return (
                <div key={job.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(job.status)}`}>{statusLabel(job.status)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{job.kind}</span>
                    <span className="text-xs text-slate-500">{formatDateTime(job.createdAt)}</span>
                    {job.autoPublish && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">auto-publish</span>}
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-900">{job.title ?? 'Без заголовка'}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{job.sourceDescription}</div>
                  {job.errorMessage && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{job.errorMessage}</div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.sourceProjectId && (
                      <button type="button" onClick={() => { void onAssumeProject(job.sourceProjectId!); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        Открыть source
                      </button>
                    )}
                    {job.publicationId && (
                      <button type="button" onClick={() => setActiveTab('publications')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        Открыть publication
                      </button>
                    )}
                    {job.publicationId && (
                      <button type="button" onClick={() => { void regenerateSeo(job.publicationId!); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        Generate SEO draft
                      </button>
                    )}
                    {job.publicationId && job.status !== 'published' && (
                      <button type="button" onClick={() => { void publishJob(job.id); }} className="rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90">
                        Publish
                      </button>
                    )}
                  </div>
                  {publication && (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      publication: {publication.title} · {publication.visibility} · {publication.verificationStatus}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && activeTab === 'sources' && (
          <div className="space-y-3">
            {sources.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Sources пока нет.</div> : sources.map((source) => (
              <div key={source.projectId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-slate-900">{source.projectName}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(source.latestJobStatus)}`}>{statusLabel(source.latestJobStatus)}</span>
                  <span className="text-xs text-slate-500">{source.publicationCount} publications</span>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{source.sourceDescription}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { void onAssumeProject(source.projectId); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Открыть source
                  </button>
                  <button type="button" onClick={() => setActiveTab('jobs')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Перейти к job
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && activeTab === 'publications' && (
          <div className="space-y-3">
            {publications.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Publications пока нет.</div> : publications.map((publication) => (
              <div key={publication.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-slate-900">{publication.title}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(publication.status)}`}>{publication.status}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{publication.kind}</span>
                  <span className="text-xs text-slate-500">{publication.visibility} · {publication.verificationStatus}</span>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{publication.summary ?? 'Без summary'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { void onAssumeProject(publication.sourceProjectId); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Открыть source
                  </button>
                  <button type="button" onClick={() => { void regenerateSeo(publication.id); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Generate SEO draft
                  </button>
                  {publication.status !== 'published' && (
                    <button type="button" onClick={() => { void publishPublication(publication.id); }} className="rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90">
                      Опубликовать
                    </button>
                  )}
                  <a href={`/${publication.kind === 'block' ? 'blocks' : 'templates'}/${publication.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Preview marketplace
                  </a>
                  <a href={`/${publication.kind === 'block' ? 'blocks' : 'templates'}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    Preview catalog
                  </a>
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  SEO: {publication.seoTitle ?? '—'} / {publication.seoDescription ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
