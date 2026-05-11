export type SitePublicationItem = {
  id: string;
  slug: string;
  kind: 'template' | 'block';
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string | null;
  industry: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoBody: string | null;
  verificationStatus: 'unverified' | 'reviewed' | 'verified' | 'editorial';
  taskCount: number;
};

export type SitePublicationDetail = SitePublicationItem & {
  snapshot: {
    tasks: Array<{
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      parentId?: string;
      type?: 'task' | 'milestone';
      color?: string;
      progress?: number;
      sortOrder?: number;
    }>;
    dependencies: Array<{
      id: string;
      taskId: string;
      depTaskId: string;
      type: 'FS' | 'SS' | 'FF' | 'SF';
      lag: number;
    }>;
  };
};

function getApiBaseUrl(): string {
  const envUrl = import.meta.env.SITE_PUBLICATIONS_API_BASE_URL
    ?? import.meta.env.PUBLIC_SITE_PUBLICATIONS_API_BASE_URL;
  const normalized = typeof envUrl === 'string' ? envUrl.trim() : '';
  return normalized || 'http://localhost:3000';
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`);
    if (!response.ok) {
      return null;
    }
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function fetchSitePublicationList(kind: 'template' | 'block'): Promise<SitePublicationItem[]> {
  const data = await fetchJson<{ publications: SitePublicationItem[] }>(
    `/api/public/template-publications?visibilityTarget=site&kind=${kind}`,
  );
  return data?.publications ?? [];
}

export async function fetchSitePublicationDetail(kind: 'template' | 'block', slug: string): Promise<SitePublicationDetail | null> {
  const data = await fetchJson<SitePublicationDetail>(
    `/api/public/template-publications/${encodeURIComponent(slug)}?visibilityTarget=site`,
  );
  if (!data || data.kind !== kind) {
    return null;
  }
  return data;
}
