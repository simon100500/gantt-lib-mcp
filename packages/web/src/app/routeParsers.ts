export function parseTemplateCreatePath(pathname: string): { publicationId: string } | null {
  const match = pathname.match(/^\/app\/templates\/([^/]+)\/create$/);
  if (!match) {
    return null;
  }

  const publicationId = match[1] ? decodeURIComponent(match[1]) : '';
  return publicationId ? { publicationId } : null;
}

export function parseBlockIntentPath(pathname: string): { publicationId: string } | null {
  const match = pathname.match(/^\/app\/blocks\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const publicationId = match[1] ? decodeURIComponent(match[1]) : '';
  return publicationId ? { publicationId } : null;
}

export function parseProjectOpenSearch(search: string): { projectId: string } | null {
  const projectId = new URLSearchParams(search).get('projectId')?.trim() ?? '';
  return projectId ? { projectId } : null;
}

export function parseProjectCreationIntentRoute(pathname: string, search: string): { intentId: string | null } | null {
  if (pathname !== '/app/new') {
    return null;
  }

  const intentId = new URLSearchParams(search).get('intent')?.trim() ?? '';
  return { intentId: intentId || null };
}
