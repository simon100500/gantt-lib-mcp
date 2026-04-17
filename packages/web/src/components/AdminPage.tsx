import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoginButton } from './LoginButton';
import { PLAN_CATALOG, PLAN_LABELS, formatDate, type BillingPeriod, type PlanId } from '../lib/billing';
import { useAuthStore, type AdminContext, type AuthProject } from '../stores/useAuthStore';

interface AdminPageProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLoginRequired: () => void;
}

interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  subscription: {
    plan: PlanId;
    planLabel: string;
    isActive: boolean;
    periodEnd: string | null;
    billingState: string;
    trialEndsAt: string | null;
  };
  projects: {
    active: number;
    archived: number;
  };
  usage: {
    aiQueriesUsed: number;
    aiQueriesLimit: number | string | null;
  };
}

interface AdminUserDetails {
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
  subscription: {
    plan: PlanId;
    periodEnd: string | null;
    isActive: boolean;
    billingState: string;
    trial: {
      startedAt: string | null;
      endsAt: string | null;
      endedAt: string | null;
      source: string | null;
      convertedAt: string | null;
      rolledBackAt: string | null;
    };
    usage: {
      ai_queries: {
        usageState: 'tracked' | 'not_applicable';
        used: number | null;
        limit: number | string;
      };
      projects: {
        usageState: 'tracked' | 'not_applicable';
        used: number | null;
        limit: number | string;
      };
    };
    remaining: {
      ai_queries: {
        remainingState: 'tracked' | 'unlimited' | 'not_applicable';
        remaining: number | string | null;
      };
      projects: {
        remainingState: 'tracked' | 'unlimited' | 'not_applicable';
        remaining: number | string | null;
      };
    };
  };
  billingEvents: Array<{
    id: string;
    actorType: string;
    actorId: string | null;
    previousState: string | null;
    newState: string;
    reason: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    created_at: string;
    plan: string;
    period: string;
    amount: number;
    status: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    archivedAt: string | null;
    deletedAt: string | null;
    messageCount: number;
    logCount: number;
  }>;
}

interface AdminProjectMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface AdminDebugLogEntry {
  id: string;
  source: string;
  event: string;
  userId: string | null;
  projectId: string | null;
  sessionId: string | null;
  runId: string | null;
  attempt: number | null;
  tool: string | null;
  toolUseId: string | null;
  aiMutationSource: string | null;
  createdAt: string;
  payload: unknown;
}

interface AdminUsersPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

const billingStateColors: Record<string, string> = {
  trial_active: 'bg-blue-100 text-blue-700',
  trial_expired: 'bg-orange-100 text-orange-700',
  paid_expired: 'bg-red-100 text-red-700',
};

const billingStateLabels: Record<string, string> = {
  trial_active: 'Пробный',
  trial_expired: 'Пробный истёк',
  paid_expired: 'Оплачен истёк',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function fetchAdminWithRetry(input: string, init: RequestInit = {}): Promise<Response> {
  let token = useAuthStore.getState().accessToken;

  const doFetch = (accessToken: string) => fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!token) {
    return new Response(null, { status: 401 });
  }

  let response = await doFetch(token);
  if (response.status !== 401) {
    return response;
  }

  token = await useAuthStore.getState().refreshAccessToken();
  if (!token) {
    return response;
  }

  return doFetch(token);
}

function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-3 text-slate-900">
          <img src="/favicon.svg" alt="" width="18" height="18" className="h-[18px] w-[18px]" aria-hidden="true" />
          <div className="text-sm font-semibold tracking-tight">ГетГант</div>
        </a>
        <span className="text-sm text-slate-400" aria-hidden="true">/</span>
        <span className="text-sm font-medium text-slate-900">Админка</span>
        {children}
      </div>
    </header>
  );
}

function GuardState({
  isAuthenticated,
  onLoginRequired,
  userEmail,
  forbidden,
}: {
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  userEmail?: string | null;
  forbidden?: boolean;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f4f5f7]">
      <PageHeader>
        {isAuthenticated ? (
          <span className="ml-auto hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
        ) : (
          <div className="ml-auto">
            <LoginButton onClick={onLoginRequired} />
          </div>
        )}
      </PageHeader>

      <main className="flex-1 overflow-y-auto px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Админка подписок</h1>
          <p className="mt-3 text-sm text-slate-600">
            {forbidden
              ? 'Доступ запрещён. Добавь свой email в ADMIN_EMAILS или ADMIN_EMAIL на сервере.'
              : 'Войди в систему, чтобы открыть админку подписок.'}
          </p>
          {!isAuthenticated && (
            <div className="mt-6 flex justify-center">
              <LoginButton onClick={onLoginRequired} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function AdminPage({ isAuthenticated, userEmail, onLoginRequired }: AdminPageProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [pagination, setPagination] = useState<AdminUsersPagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetails | null>(null);
  const [aiUsedDraft, setAiUsedDraft] = useState('0');
  const [periodEndDraft, setPeriodEndDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const [chatProjectId, setChatProjectId] = useState<string | null>(null);
  const [chatProjectName, setChatProjectName] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AdminProjectMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [logScope, setLogScope] = useState<'user' | 'project' | null>(null);
  const [logProjectId, setLogProjectId] = useState<string | null>(null);
  const [logProjectName, setLogProjectName] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminDebugLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'billing' | 'projects'>('billing');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const loadUsers = useCallback(async (nextQuery: string, nextPage = 1) => {
    setLoading(true);
    setError(null);

    try {
      const search = new URLSearchParams();
      if (nextQuery.trim()) {
        search.set('query', nextQuery.trim());
      }
      search.set('page', String(nextPage));
      search.set('pageSize', String(pagination.pageSize));

      const suffix = search.toString();
      const response = await fetchAdminWithRetry(suffix ? `/api/admin/users?${suffix}` : '/api/admin/users');
      if (response.status === 403) {
        setForbidden(true);
        setUsers([]);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { users: AdminUserSummary[]; pagination: AdminUsersPagination };
      setForbidden(false);
      setUsers(data.users);
      setPagination(data.pagination);
      if (data.users.length > 0) {
        setSelectedUserId((current) => (
          current && data.users.some((user) => user.id === current)
            ? current
            : data.users[0].id
        ));
      } else {
        setSelectedUserId(null);
        setSelectedUser(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize]);

  const loadUserDetails = useCallback(async (userId: string) => {
    setLoadingUser(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/users/${userId}/subscription`);
      if (response.status === 403) {
        setForbidden(true);
        setSelectedUser(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as AdminUserDetails;
      setForbidden(false);
      setSelectedUser(data);
      setActiveTab('billing');
      setChatProjectId(null);
      setChatProjectName(null);
      setChatMessages([]);
      setLogScope(null);
      setLogProjectId(null);
      setLogProjectName(null);
      setLogs([]);
      const trackedUsage = data.subscription.usage.ai_queries.usageState === 'tracked'
        ? data.subscription.usage.ai_queries.used ?? 0
        : 0;
      setAiUsedDraft(String(trackedUsage));
      const pe = data.subscription.periodEnd;
      setPeriodEndDraft(pe ? new Date(pe).toISOString().slice(0, 10) : '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load user details');
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void loadUsers('', 1);
  }, [isAuthenticated, loadUsers]);

  useEffect(() => {
    if (!selectedUserId || !isAuthenticated || forbidden) {
      return;
    }
    void loadUserDetails(selectedUserId);
  }, [forbidden, isAuthenticated, loadUserDetails, selectedUserId]);

  const selectedSummary = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const mutateSubscription = useCallback(async (payload: Record<string, unknown>) => {
    if (!selectedUserId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/users/${selectedUserId}/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as AdminUserDetails;
      setForbidden(false);
      setSelectedUser(data);
      await loadUsers(query, pagination.page);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update subscription');
    } finally {
      setSaving(false);
    }
  }, [loadUsers, pagination.page, query, selectedUserId]);

  const trialAction = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchAdminWithRetry(`/api/admin/users/${selectedUserId}/trial/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      const data = await response.json() as AdminUserDetails;
      setSelectedUser(data);
      await loadUsers(query, pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trial action failed');
    } finally {
      setSaving(false);
    }
  }, [loadUsers, pagination.page, query, selectedUserId]);

  const openProjectView = useCallback(async (projectId: string) => {
    setOpeningProjectId(projectId);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/projects/${projectId}/share`, {
        method: 'POST',
      });

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as { url: string };
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Failed to open project');
    } finally {
      setOpeningProjectId(null);
    }
  }, []);

  const assumeProjectSession = useCallback(async (projectId: string) => {
    setOpeningProjectId(projectId);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/projects/${projectId}/assume`, {
        method: 'POST',
      });

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        accessToken: string;
        refreshToken: string;
        project: AuthProject;
        adminContext: AdminContext;
      };

      useAuthStore.getState().assumeAdminProjectSession(
        {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        },
        data.project,
        data.adminContext,
      );

      window.location.href = '/';
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Failed to open editable project');
    } finally {
      setOpeningProjectId(null);
    }
  }, []);

  const openProjectChat = useCallback(async (projectId: string, projectName: string) => {
    setLoadingChat(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/projects/${projectId}/messages`);

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        project: { id: string; name: string };
        messages: AdminProjectMessage[];
      };
      setChatProjectId(data.project.id);
      setChatProjectName(data.project.name || projectName);
      setChatMessages(data.messages);
      setLogScope(null);
      setLogProjectId(null);
      setLogProjectName(null);
      setLogs([]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : 'Failed to load project chat');
    } finally {
      setLoadingChat(false);
    }
  }, []);

  const openProjectLogs = useCallback(async (projectId: string, projectName: string) => {
    setLoadingLogs(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/projects/${projectId}/logs?limit=200`);

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        project: { id: string; name: string };
        logs: AdminDebugLogEntry[];
      };
      setLogScope('project');
      setLogProjectId(data.project.id);
      setLogProjectName(data.project.name || projectName);
      setLogs(data.logs);
      setChatProjectId(null);
      setChatProjectName(null);
      setChatMessages([]);
    } catch (logError) {
      setError(logError instanceof Error ? logError.message : 'Failed to load project logs');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const openUserLogs = useCallback(async () => {
    if (!selectedUser) {
      return;
    }

    setLoadingLogs(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/users/${selectedUser.user.id}/logs?limit=200`);

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        user: { id: string; email: string };
        logs: AdminDebugLogEntry[];
      };
      setLogScope('user');
      setLogProjectId(null);
      setLogProjectName(data.user.email);
      setLogs(data.logs);
      setChatProjectId(null);
      setChatProjectName(null);
      setChatMessages([]);
    } catch (logError) {
      setError(logError instanceof Error ? logError.message : 'Failed to load user logs');
    } finally {
      setLoadingLogs(false);
    }
  }, [selectedUser]);

  const deleteProject = useCallback(async (projectId: string, projectName: string) => {
    if (!selectedUserId) {
      return;
    }

    if (!window.confirm(`Удалить проект "${projectName}" без возможности восстановления?`)) {
      return;
    }

    setDeletingProjectId(projectId);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; user: AdminUserDetails | null };
      setSelectedUser(data.user);
      if (chatProjectId === projectId) {
        setChatProjectId(null);
        setChatProjectName(null);
        setChatMessages([]);
      }
      if (logScope === 'project' && logProjectId === projectId) {
        setLogScope(null);
        setLogProjectId(null);
        setLogProjectName(null);
        setLogs([]);
      }
      await loadUsers(query, pagination.page);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  }, [chatProjectId, loadUsers, logProjectId, logScope, pagination.page, query, selectedUserId]);

  const deleteUser = useCallback(async () => {
    if (!selectedUser) {
      return;
    }

    if (!window.confirm(`Удалить пользователя ${selectedUser.user.email} со всеми проектами и данными без возможности восстановления?`)) {
      return;
    }

    setDeletingUser(true);
    setError(null);

    try {
      const response = await fetchAdminWithRetry(`/api/admin/users/${selectedUser.user.id}`, {
        method: 'DELETE',
      });

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setSelectedUser(null);
      setSelectedUserId(null);
      setChatProjectId(null);
      setChatProjectName(null);
      setChatMessages([]);
      setLogScope(null);
      setLogProjectId(null);
      setLogProjectName(null);
      setLogs([]);

      const nextTotalAfterDelete = Math.max(0, pagination.total - 1);
      const nextPage = Math.min(
        pagination.page,
        Math.max(1, Math.ceil(nextTotalAfterDelete / pagination.pageSize)),
      );
      await loadUsers(query, nextPage);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  }, [loadUsers, pagination.page, pagination.pageSize, pagination.total, query, selectedUser]);

  if (!isAuthenticated) {
    return <GuardState isAuthenticated={false} onLoginRequired={onLoginRequired} />;
  }

  if (forbidden) {
    return <GuardState isAuthenticated onLoginRequired={onLoginRequired} userEmail={userEmail} forbidden />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f4f5f7]">
      <PageHeader>
        <span className="ml-auto hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
      </PageHeader>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-[1600px] space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-slate-900">Пользователи</h1>
                <button
                  type="button"
                  onClick={() => void loadUsers(query, pagination.page)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Обновить
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void loadUsers(query, 1);
                    }
                  }}
                  placeholder="Поиск по email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void loadUsers(query, 1)}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                >
                  Найти
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">Загрузка…</div>
                ) : users.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">Пользователи не найдены.</div>
                ) : (
                  users.map((user) => {
                    const planColors: Record<string, string> = {
                      free: 'bg-slate-100 text-slate-600',
                      start: 'bg-blue-100 text-blue-700',
                      team: 'bg-violet-100 text-violet-700',
                      enterprise: 'bg-amber-100 text-amber-700',
                    };
                    const statusColor = user.subscription.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          selectedUserId === user.id ? 'border-primary bg-primary/[0.04]' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-medium text-slate-900">{user.email}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${planColors[user.subscription.plan] ?? 'bg-slate-100 text-slate-600'}`}>
                            {user.subscription.planLabel}
                          </span>
                          {user.subscription.plan !== 'free' && (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${statusColor}`}>
                              {user.subscription.isActive ? 'активна' : 'истекла'}
                            </span>
                          )}
                          {user.subscription.billingState && user.subscription.billingState !== 'free' && user.subscription.billingState !== 'paid_active' && (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${billingStateColors[user.subscription.billingState] ?? 'bg-slate-100 text-slate-600'}`}>
                              {billingStateLabels[user.subscription.billingState] ?? user.subscription.billingState}
                            </span>
                          )}
                          <span className="text-slate-500">{user.projects.active} пр.</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
                <span>
                  {pagination.total > 0
                    ? `${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} из ${pagination.total}`
                    : '0 пользователей'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || pagination.page <= 1}
                    onClick={() => void loadUsers(query, pagination.page - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <span>{pagination.page}/{pagination.totalPages}</span>
                  <button
                    type="button"
                    disabled={loading || pagination.page >= pagination.totalPages}
                    onClick={() => void loadUsers(query, pagination.page + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {!selectedUserId ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Выбери пользователя слева.</div>
              ) : loadingUser && !selectedUser ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Загрузка пользователя…</div>
              ) : selectedUser ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">{selectedUser.user.email}</h2>
                      <div className="mt-2 text-sm text-slate-500">Регистрация: {formatDate(selectedUser.user.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full px-3 py-1 text-sm ${
                        selectedUser.subscription.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {selectedUser.subscription.isActive ? 'Подписка активна' : 'Подписка истекла'}
                      </div>
                      <button
                        type="button"
                        disabled={saving || deletingUser || userEmail === selectedUser.user.email}
                        onClick={() => void deleteUser()}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingUser ? 'Удаление…' : 'Удалить пользователя'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('billing')}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'billing'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Биллинг
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('projects')}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'projects'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Проекты ({selectedUser.projects.length})
                    </button>
                  </div>

                  {activeTab === 'billing' ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Текущий план</div>
                          <div className="mt-2 text-lg font-semibold text-slate-900">{PLAN_LABELS[selectedUser.subscription.plan]}</div>
                          <div className="mt-1 text-sm text-slate-500">До {formatDate(selectedUser.subscription.periodEnd)}</div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">AI-запросы</div>
                          <div className="mt-2 text-lg font-semibold text-slate-900">
                            {selectedUser.subscription.usage.ai_queries.usageState === 'tracked'
                              ? `${selectedUser.subscription.usage.ai_queries.used} / ${selectedUser.subscription.usage.ai_queries.limit}`
                              : '—'}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">Осталось: {String(selectedUser.subscription.remaining.ai_queries.remaining ?? '—')}</div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Проекты</div>
                          <div className="mt-2 text-lg font-semibold text-slate-900">
                            {selectedSummary ? `${selectedSummary.projects.active} активных / ${selectedSummary.projects.archived} в архиве` : '—'}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">Осталось: {String(selectedUser.subscription.remaining.projects.remaining ?? '—')}</div>
                        </div>
                      </div>

                      {/* Trial Status Card */}
                      {selectedUser.subscription.trial?.startedAt && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                          <div className="text-sm font-medium text-blue-900">Пробный период</div>
                          <div className="mt-2 text-sm text-blue-700">
                            {selectedUser.subscription.billingState === 'trial_active'
                              ? `Активен, осталось ${daysUntil(selectedUser.subscription.trial.endsAt)} дн.`
                              : selectedUser.subscription.billingState === 'trial_expired'
                                ? 'Закончился'
                                : 'Откат выполнен'}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-600">
                            {selectedUser.subscription.trial.startedAt && (
                              <span>Начало: {formatDate(selectedUser.subscription.trial.startedAt)}</span>
                            )}
                            {selectedUser.subscription.trial.endsAt && (
                              <span>Конец: {formatDate(selectedUser.subscription.trial.endsAt)}</span>
                            )}
                            {selectedUser.subscription.trial.endedAt && (
                              <span>Завершён: {formatDate(selectedUser.subscription.trial.endedAt)}</span>
                            )}
                            {selectedUser.subscription.trial.rolledBackAt && (
                              <span>Откат: {formatDate(selectedUser.subscription.trial.rolledBackAt)}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Trial Actions */}
                      {selectedUser.subscription.billingState && (
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <div className="text-sm font-medium text-slate-900">Управление пробным периодом</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedUser.subscription.billingState === 'free' && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void trialAction('start', { durationDays: 14, reason: 'Admin initiated' })}
                                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Начать 14-дневный пробный период
                              </button>
                            )}
                            {selectedUser.subscription.billingState === 'trial_active' && (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void trialAction('extend', { days: 3, reason: 'Admin extend 3d' })}
                                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Продлить +3 дня
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void trialAction('extend', { days: 7, reason: 'Admin extend 7d' })}
                                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Продлить +7 дней
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void trialAction('end', { reason: 'Admin ended trial' })}
                                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Завершить сейчас
                                </button>
                              </>
                            )}
                            {selectedUser.subscription.trial?.startedAt && (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => {
                                    const overLimit = selectedSummary ? Math.max(0, selectedSummary.projects.active - 3) : 0;
                                    const msg = overLimit > 0
                                      ? `У пользователя ${overLimit} проект(ов) сверх лимта бесплатного плана. Они будут скрыты. Продолжить откат?`
                                      : 'Сбросить пробный период и вернуть на бесплатный план?';
                                    if (window.confirm(msg)) {
                                      void trialAction('rollback', { reason: 'Admin rollback' });
                                    }
                                  }}
                                  className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Откатить на Free
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => {
                                    if (window.confirm('Полностью сбросить триал? Пользователь сможет запустить триал заново.')) {
                                      void trialAction('reset', { reason: 'Admin trial reset' });
                                    }
                                  }}
                                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Сбросить триал
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void trialAction('convert', { paidPlan: 'start', period: 'monthly', reason: 'Admin convert' })}
                                  className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Конвертировать в Start
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Billing Events Timeline */}
                      {selectedUser.billingEvents && selectedUser.billingEvents.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <div className="text-sm font-medium text-slate-900">История событий</div>
                          <div className="mt-3 space-y-2">
                            {selectedUser.billingEvents.slice(0, 10).map((event) => (
                              <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                                <div className="text-slate-900">
                                  {event.previousState ?? '—'} {'->'} {event.newState}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {event.actorType}{event.reason ? `: ${event.reason}` : ''} {formatDate(event.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-sm font-medium text-slate-900">План и срок</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {(['free', 'start', 'team', 'enterprise'] as PlanId[]).map((plan) => {
                            const def = PLAN_CATALOG[plan];
                            const isActive = selectedUser.subscription.plan === plan;
                            return (
                              <button
                                key={plan}
                                type="button"
                                disabled={saving}
                                onClick={() => void mutateSubscription({ plan, period: plan === 'free' ? undefined : 'monthly' })}
                                className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isActive
                                    ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{def.label}</span>
                                  {isActive && (
                                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-white">Текущий</span>
                                  )}
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-slate-500">
                                  <div>{def.limits.projects === 'unlimited' ? 'Безлимит' : def.limits.projects} проектов</div>
                                  <div>{def.limits.ai_queries.value} AI{def.limits.ai_queries.period === 'daily' ? '/день' : ''}</div>
                                  <div>{def.pricing.monthly === 0 ? 'Бесплатно' : `${def.pricing.monthly.toLocaleString('ru-RU')} ₽/мес`}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <input
                            type="date"
                            value={periodEndDraft}
                            onChange={(event) => setPeriodEndDraft(event.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                          />
                          <button
                            type="button"
                            disabled={saving || !periodEndDraft}
                            onClick={() => void mutateSubscription({ periodEnd: new Date(periodEndDraft).toISOString() })}
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Сохранить дату
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void mutateSubscription({ expireNow: true })}
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Истечь сейчас
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-sm font-medium text-slate-900">AI-запросы</div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            value={aiUsedDraft}
                            onChange={(event) => setAiUsedDraft(event.target.value)}
                            className="w-40 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                          />
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void mutateSubscription({ aiQueriesUsed: Number(aiUsedDraft) })}
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Применить usage
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Меняет текущий AI usage bucket. Счётчик проектов — через реальные create/archive/restore.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-sm font-medium text-slate-900">Последние платежи</div>
                        <div className="mt-3 space-y-2">
                          {selectedUser.payments.length === 0 ? (
                            <div className="text-sm text-slate-400">Платежей нет.</div>
                          ) : selectedUser.payments.slice(0, 10).map((payment) => (
                            <div key={payment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                              <div className="font-medium text-slate-900">{PLAN_LABELS[payment.plan as PlanId] ?? payment.plan}</div>
                              <div className="mt-1 text-slate-500">{payment.period} • {payment.status} • {formatDate(payment.created_at)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">Последние проекты</div>
                        <button
                          type="button"
                          disabled={loadingLogs}
                          onClick={() => void openUserLogs()}
                          className={`rounded-lg border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            logScope === 'user'
                              ? 'border-primary bg-primary/[0.08] text-primary'
                              : 'border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {loadingLogs && logScope === 'user' ? 'Загрузка…' : 'Логи пользователя'}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedUser.projects.length === 0 ? (
                          <div className="text-sm text-slate-400">Проектов нет.</div>
                        ) : selectedUser.projects.map((project) => (
                          <div key={project.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900">{project.name}</div>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    project.status === 'active'
                                      ? 'bg-green-100 text-green-700'
                                      : project.status === 'archived'
                                        ? 'bg-slate-200 text-slate-600'
                                        : 'bg-red-100 text-red-700'
                                  }`}>
                                    {project.status === 'active'
                                      ? 'активный'
                                      : project.status === 'archived'
                                        ? 'архив'
                                        : 'удалён'}
                                  </span>
                                  <span className="text-xs text-slate-500">{formatDate(project.createdAt)}</span>
                                  {project.archivedAt && project.status === 'archived' && (
                                    <span className="text-xs text-slate-500">архив: {formatDate(project.archivedAt)}</span>
                                  )}
                                  {project.deletedAt && project.status === 'deleted' && (
                                    <span className="text-xs text-slate-500">удалён: {formatDate(project.deletedAt)}</span>
                                  )}
                                  <span className="text-xs text-slate-500">логов: {project.logCount ?? 0}</span>
                                </div>
                              </div>
                              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-none lg:auto-cols-max lg:grid-flow-col">
                                <button
                                  type="button"
                                  disabled={loadingChat && chatProjectId === project.id}
                                  onClick={() => void openProjectChat(project.id, project.name)}
                                  className={`min-w-0 rounded-lg border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                    chatProjectId === project.id
                                      ? 'border-primary bg-primary/[0.08] text-primary'
                                      : 'border-slate-200 text-slate-700 hover:bg-white'
                                  }`}
                                >
                                  {loadingChat && chatProjectId === project.id ? 'Загрузка…' : `Чат (${project.messageCount ?? 0})`}
                                </button>
                                <button
                                  type="button"
                                  disabled={loadingLogs && logProjectId === project.id}
                                  onClick={() => void openProjectLogs(project.id, project.name)}
                                  className={`min-w-0 rounded-lg border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                    logScope === 'project' && logProjectId === project.id
                                      ? 'border-primary bg-primary/[0.08] text-primary'
                                      : 'border-slate-200 text-slate-700 hover:bg-white'
                                  }`}
                                >
                                  {loadingLogs && logProjectId === project.id ? 'Загрузка…' : `Логи (${project.logCount ?? 0})`}
                                </button>
                                <button
                                  type="button"
                                  disabled={openingProjectId === project.id}
                                  onClick={() => void (project.status === 'deleted' ? assumeProjectSession(project.id) : openProjectView(project.id))}
                                  className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {openingProjectId === project.id ? 'Открытие…' : 'Открыть'}
                                </button>
                                <button
                                  type="button"
                                  disabled={openingProjectId === project.id}
                                  onClick={() => void assumeProjectSession(project.id)}
                                  className="min-w-0 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {openingProjectId === project.id ? 'Переключение…' : 'Редактировать'}
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingProjectId === project.id}
                                  onClick={() => void deleteProject(project.id, project.name)}
                                  className="min-w-0 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingProjectId === project.id ? 'Удаление…' : 'Удалить'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">
                          {chatProjectId
                            ? `Чат проекта: ${chatProjectName}`
                            : logScope === 'project'
                              ? `Логи проекта: ${logProjectName}`
                              : logScope === 'user'
                                ? `Логи пользователя: ${logProjectName}`
                                : 'Чат и логи'}
                        </div>
                        {(chatProjectName || logScope) && (
                          <div className="flex items-center gap-2">
                            {logScope && logs.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const header = logScope === 'project'
                                    ? `Логи проекта: ${logProjectName}`
                                    : `Логи пользователя: ${logProjectName}`;
                                  const text = [
                                    header,
                                    '='.repeat(header.length),
                                    '',
                                    ...logs.map((log) => {
                                      const parts = [
                                        `[${formatDate(log.createdAt)} ${formatTime(log.createdAt)}] ${log.source} | ${log.event}`,
                                      ];
                                      if (log.tool) parts.push(`  tool: ${log.tool}`);
                                      if (log.aiMutationSource) parts.push(`  aiMutationSource: ${log.aiMutationSource}`);
                                      parts.push(`  projectId: ${log.projectId ?? '—'}`);
                                      parts.push(`  sessionId: ${log.sessionId ?? '—'}`);
                                      parts.push(`  runId: ${log.runId ?? '—'}`);
                                      parts.push(`  attempt: ${log.attempt ?? '—'}`);
                                      parts.push('');
                                      parts.push(formatJson(log.payload));
                                      return parts.join('\n');
                                    }),
                                  ].join('\n\n');
                                  void navigator.clipboard.writeText(text).then(() => {
                                    setCopiedLogs(true);
                                    setTimeout(() => setCopiedLogs(false), 2000);
                                  });
                                }}
                                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                                  copiedLogs
                                    ? 'border-green-200 bg-green-50 text-green-700'
                                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {copiedLogs ? 'Скопировано' : 'Копировать логи'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setChatProjectId(null);
                                setChatProjectName(null);
                                setChatMessages([]);
                                setLogScope(null);
                                setLogProjectId(null);
                                setLogProjectName(null);
                                setLogs([]);
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              Очистить
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-3">
                        {!chatProjectId && !logScope ? (
                          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                            Выберите проект и нажмите «Чат» или «Логи». Для общего потока нажмите «Логи пользователя».
                          </div>
                        ) : loadingChat ? (
                          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                            Загрузка чата…
                          </div>
                        ) : loadingLogs ? (
                          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                            Загрузка логов…
                          </div>
                        ) : logScope ? (
                          logs.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                              Логов пока нет.
                            </div>
                          ) : logs.map((log) => (
                            <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm shadow-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
                                  {log.source}
                                </span>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                  {log.event}
                                </span>
                                {log.tool && (
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                    tool: {log.tool}
                                  </span>
                                )}
                                <span className="ml-auto text-xs text-slate-500">{formatDate(log.createdAt)} {formatTime(log.createdAt)}</span>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                                <div>projectId: <span className="font-mono text-slate-700">{log.projectId ?? '—'}</span></div>
                                <div>sessionId: <span className="font-mono text-slate-700">{log.sessionId ?? '—'}</span></div>
                                <div>runId: <span className="font-mono text-slate-700">{log.runId ?? '—'}</span></div>
                                <div>attempt: <span className="font-mono text-slate-700">{log.attempt ?? '—'}</span></div>
                              </div>
                              <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">{formatJson(log.payload)}</pre>
                            </div>
                          ))
                        ) : chatMessages.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                            В этом проекте пока нет сообщений.
                          </div>
                        ) : chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                message.role === 'user'
                                  ? 'border border-primary/15 bg-primary/[0.08] text-slate-900'
                                  : 'border border-slate-200 bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-slate-900">
                                  {message.role === 'user' ? 'Пользователь' : 'Ассистент'}
                                </span>
                                <span className="text-xs text-slate-500">{formatTime(message.createdAt)}</span>
                              </div>
                              <div className="mt-2 whitespace-pre-wrap break-words leading-6">
                                {message.content}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">Выбери пользователя слева.</div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
