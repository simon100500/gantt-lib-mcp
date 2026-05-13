import type { TemplatePublicationDetail } from '../../lib/apiTypes.ts';
import type { AuthProject, UseAuthResult } from '../../stores/useAuthStore.ts';

const ACCESS_TOKEN_KEY = 'gantt_access_token';

export type ProjectIntentReadResponse = {
  id: string;
  text: string;
  source: string;
  projectId: string | null;
  requestContextId: string | null;
  historyGroupId: string | null;
  templateSlug: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

function getLatestAccessToken(auth: Pick<UseAuthResult, 'accessToken'>): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || auth.accessToken;
}

export async function fetchWithLifecycleTokenRetry(
  auth: Pick<UseAuthResult, 'accessToken' | 'refreshAccessToken'>,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token = getLatestAccessToken(auth);
  if (!token) {
    throw new Error('Missing access token');
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

export async function createProjectFromTemplatePublication(
  auth: Pick<UseAuthResult, 'accessToken' | 'refreshAccessToken'>,
  templatePublicationId: string,
  input: { projectName: string; groupId?: string },
): Promise<Response> {
  return fetchWithLifecycleTokenRetry(
    auth,
    `/api/template-publications/${encodeURIComponent(templatePublicationId)}/create-project`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchTemplatePublicationDetail(
  auth: Pick<UseAuthResult, 'accessToken' | 'refreshAccessToken'>,
  templatePublicationId: string,
): Promise<TemplatePublicationDetail | null> {
  const response = await fetchWithLifecycleTokenRetry(
    auth,
    `/api/template-publications/${encodeURIComponent(templatePublicationId)}`,
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<TemplatePublicationDetail>;
}

export async function fetchProjectIntent(
  auth: Pick<UseAuthResult, 'accessToken' | 'refreshAccessToken'>,
  projectIntentId: string,
): Promise<Response> {
  return fetchWithLifecycleTokenRetry(
    auth,
    `/api/project-intents/${encodeURIComponent(projectIntentId)}`,
  );
}

export async function parseTemplateProjectCreationResponse(response: Response): Promise<{ project: AuthProject }> {
  return response.json() as Promise<{ project: AuthProject }>;
}
