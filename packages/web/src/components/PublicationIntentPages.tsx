import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, FolderPlus, Layers3, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthProject, UseAuthResult } from '../hooks/useAuth.ts';
import type { AuthSuccessResponse, TemplatePublicationDetail } from '../lib/apiTypes.ts';
import type { ConstraintDenialPayload } from '../lib/constraintUi.ts';
import { LimitReachedModal } from './LimitReachedModal.tsx';
import { LoginButton } from './LoginButton.tsx';
import { ProjectGroupModal } from './ProjectGroupModal.tsx';
import { useBillingStore } from '../stores/useBillingStore.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';

interface BasePublicationPageProps {
  publicationId: string;
  auth: UseAuthResult;
  onLoginRequired: () => void;
}

interface TemplateCreatePageProps extends BasePublicationPageProps {
  onProjectCreated: (project: AuthProject) => Promise<void>;
}

function getLatestAccessToken(auth: UseAuthResult): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
}

function isConstraintCode(code: string | undefined): code is ConstraintDenialPayload['code'] {
  return code === 'PROJECT_LIMIT_REACHED' || code === 'AI_LIMIT_REACHED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'ARCHIVE_FEATURE_LOCKED' || code === 'EXPORT_FEATURE_LOCKED';
}

async function fetchWithTokenRetry(auth: UseAuthResult, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = getLatestAccessToken(auth);
  if (!token) {
    throw new Error('Не удалось получить access token.');
  }

  const withToken = (accessToken: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let response = await fetch(input, withToken(token));
  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await auth.refreshAccessToken();
  if (!refreshedToken) {
    return response;
  }

  token = localStorage.getItem(ACCESS_TOKEN_KEY) || refreshedToken;
  return fetch(input, withToken(token));
}

function PublicationShell({
  eyebrow,
  title,
  description,
  isAuthenticated,
  userEmail,
  onLoginRequired,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-3 text-slate-900">
            <img src="/favicon.svg" alt="" width="18" height="18" className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">ГетГант</span>
          </a>
          <span className="text-sm text-slate-400" aria-hidden="true">/</span>
          <span className="text-sm font-medium text-slate-900">{eyebrow}</span>
          <div className="ml-auto flex items-center gap-3">
            {isAuthenticated ? (
              <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
            ) : (
              <LoginButton onClick={onLoginRequired} />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function PublicationMeta({ publication }: { publication: TemplatePublicationDetail }) {
  const metaItems = [
    { label: 'Тип', value: publication.kind === 'template' ? 'Шаблон проекта' : 'Блок работ' },
    { label: 'Задач', value: String(publication.taskCount) },
    { label: 'Категория', value: publication.category ?? 'Не указана' },
    { label: 'Отрасль', value: publication.industry ?? 'Не указана' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metaItems.map((item) => (
        <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function usePublicationDetail(publicationId: string, auth: UseAuthResult) {
  const [publication, setPublication] = useState<TemplatePublicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithTokenRetry(auth, `/api/template-publications/${encodeURIComponent(publicationId)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }

        const payload = await response.json() as TemplatePublicationDetail;
        if (!cancelled) {
          setPublication(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить publication.');
          setPublication(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (auth.isAuthenticated) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [auth, auth.isAuthenticated, publicationId]);

  return { publication, loading, error };
}

export function TemplateCreateFromPublicationPage({
  publicationId,
  auth,
  onLoginRequired,
  onProjectCreated,
}: TemplateCreatePageProps) {
  const { publication, loading, error } = usePublicationDetail(publicationId, auth);
  const [projectName, setProjectName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [limitDenial, setLimitDenial] = useState<Partial<ConstraintDenialPayload> | null>(null);
  const [limitUsage, setLimitUsage] = useState<ReturnType<typeof useBillingStore.getState>['usage'] | ReturnType<typeof useBillingStore.getState>['subscription'] | null>(null);
  const fetchSubscription = useBillingStore((state) => state.fetchSubscription);
  const fetchUsage = useBillingStore((state) => state.fetchUsage);

  useEffect(() => {
    if (!publication) {
      return;
    }

    setProjectName((current) => current.trim() ? current : publication.title);
  }, [publication]);

  useEffect(() => {
    if (!auth.projectGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(auth.project?.groupId ?? auth.projectGroups[0]?.id ?? '');
    }
  }, [auth.project?.groupId, auth.projectGroups, selectedGroupId]);

  const openLimitModal = useCallback(async (denial: Partial<ConstraintDenialPayload>) => {
    await Promise.all([fetchSubscription(), fetchUsage()]);
    setLimitUsage(useBillingStore.getState().usage ?? useBillingStore.getState().subscription);
    setLimitDenial(denial);
  }, [fetchSubscription, fetchUsage]);

  const canSubmit = useMemo(() => (
    publication?.kind === 'template'
    && projectName.trim().length > 0
    && selectedGroupId.trim().length > 0
    && !submitting
  ), [projectName, publication, selectedGroupId, submitting]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    if (!publication) {
      return;
    }
    if (publication.kind !== 'template') {
      setSubmitError('Этот publication нельзя использовать для создания нового проекта.');
      return;
    }
    if (!selectedGroupId) {
      setSubmitError('Выберите портфель проектов.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithTokenRetry(auth, `/api/template-publications/${encodeURIComponent(publication.id)}/create-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: projectName.trim(),
          groupId: selectedGroupId,
        }),
      });

      if (response.status === 403) {
        const denial = await response.json().catch(() => null) as Partial<ConstraintDenialPayload> | null;
        if (denial?.code && isConstraintCode(denial.code)) {
          await openLimitModal(denial);
          return;
        }
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      const payload = await response.json() as { project: AuthProject };
      await auth.refreshProjects();
      await onProjectCreated(payload.project);
    } catch (submitFailure) {
      setSubmitError(submitFailure instanceof Error ? submitFailure.message : 'Не удалось создать проект.');
    } finally {
      setSubmitting(false);
    }
  }, [auth, onProjectCreated, openLimitModal, projectName, publication, selectedGroupId]);

  return (
    <PublicationShell
      eyebrow="Создание проекта"
      title="Создайте проект из шаблона"
      description="Preview на сайте нужен только для просмотра. Новый проект будет создан в GetGantt, а все реальные правки графика вы сделаете уже в редакторе."
      isAuthenticated={auth.isAuthenticated}
      userEmail={auth.user?.email ?? null}
      onLoginRequired={onLoginRequired}
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Загружаем шаблон…</span>
          </div>
        </div>
      ) : error || !publication ? (
        <Card className="rounded-[32px] border border-red-200 shadow-sm">
          <CardHeader>
            <CardTitle>Publication не найден</CardTitle>
            <CardDescription>{error ?? 'Проверьте ссылку или повторите попытку позже.'}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-6">
          <PublicationMeta publication={publication} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="rounded-[32px] border-0 shadow-sm">
              <CardHeader className="space-y-3">
                <CardTitle className="text-2xl">{publication.title}</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-600">
                  {publication.summary ?? 'Новый проект будет создан на основе опубликованного шаблона.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  Редактирование и адаптация шаблона доступны только после входа и создания проекта в рабочем пространстве.
                </div>
                <p>После нажатия на кнопку создастся новый проект из publication. Текущий preview и любые изменения на сайте не переносятся в app.</p>
              </CardContent>
            </Card>

            <Card className="rounded-[32px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Параметры проекта</CardTitle>
                <CardDescription>Шаблон уже выбран. Укажите имя проекта и портфель, куда его нужно добавить.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-project-name">Название проекта</Label>
                    <Input
                      id="template-project-name"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder={publication.title}
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="template-project-group">Портфель проектов</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setGroupModalOpen(true)}
                        disabled={submitting}
                        className="h-8 px-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        <FolderPlus className="h-4 w-4" />
                        <span>Новый портфель</span>
                      </Button>
                    </div>
                    <select
                      id="template-project-group"
                      value={selectedGroupId}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      disabled={submitting || auth.projectGroups.length === 0}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {auth.projectGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    {auth.projectGroups.length === 0 ? (
                      <p className="text-sm text-slate-500">Сначала создайте портфель проектов.</p>
                    ) : null}
                  </div>
                  {submitError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {submitError}
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-3">
                  <Button type="submit" disabled={!canSubmit} className="h-11 rounded-2xl text-sm font-medium">
                    {submitting ? 'Создаём проект…' : 'Создать проект'}
                  </Button>
                  <p className="text-sm leading-6 text-slate-500">
                    После создания вы сразу попадёте в редактор проекта и сможете менять график как угодно.
                  </p>
                </CardFooter>
              </form>
            </Card>
          </div>
        </div>
      )}

      {groupModalOpen ? (
        <ProjectGroupModal
          mode="create"
          initialName="Новый портфель"
          onSave={async (name) => {
            const createdGroup = await auth.createProjectGroup(name);
            if (createdGroup) {
              setSelectedGroupId(createdGroup.id);
            }
          }}
          onClose={() => setGroupModalOpen(false)}
        />
      ) : null}

      {limitDenial?.code ? (
        <LimitReachedModal
          denial={limitDenial}
          usage={limitUsage}
          onClose={() => {
            setLimitDenial(null);
            setLimitUsage(null);
          }}
        />
      ) : null}
    </PublicationShell>
  );
}

export function BlockPublicationIntentPage({
  publicationId,
  auth,
  onLoginRequired,
}: BasePublicationPageProps) {
  const { publication, loading, error } = usePublicationDetail(publicationId, auth);

  return (
    <PublicationShell
      eyebrow="Работа с блоком"
      title="Продолжите работу с блоком в сервисе"
      description="На сайте блок доступен только для просмотра. Использовать и редактировать его можно уже внутри рабочего пространства GetGantt."
      isAuthenticated={auth.isAuthenticated}
      userEmail={auth.user?.email ?? null}
      onLoginRequired={onLoginRequired}
    >
      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Загружаем блок…</span>
          </div>
        </div>
      ) : error || !publication ? (
        <Card className="rounded-[32px] border border-red-200 shadow-sm">
          <CardHeader>
            <CardTitle>Publication не найден</CardTitle>
            <CardDescription>{error ?? 'Проверьте ссылку или повторите попытку позже.'}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-6">
          <PublicationMeta publication={publication} />

          <Card className="rounded-[32px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Layers3 className="h-6 w-6 text-primary" />
                <span>{publication.title}</span>
              </CardTitle>
              <CardDescription className="text-base leading-7 text-slate-600">
                {publication.summary ?? 'Этот блок можно использовать внутри существующего проекта в GetGantt.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                Preview на сайте не редактируется и не переносится автоматически в проект.
              </div>
              <p>На следующем этапе можно будет сделать insert-flow прямо в проект. Сейчас intent-screen ведёт вас в сервис, где вы продолжите работу в полноценном редакторе.</p>
            </CardContent>
            <CardFooter>
              <a
                href="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90"
              >
                <span>Открыть сервис</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </CardFooter>
          </Card>
        </div>
      )}
    </PublicationShell>
  );
}
