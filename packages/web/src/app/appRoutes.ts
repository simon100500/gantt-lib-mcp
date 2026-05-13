export const SUPPORTED_APP_PATHS = new Set(['/', '/login', '/auth/yandex/callback', '/purchase', '/account', '/admin']);
export const TRANSIENT_QUERY_PARAMS = new Set(['auth']);

export function buildLoginRoute(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function sanitizeNextPath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    if (!url.pathname.startsWith('/')) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function removeTransientSearchParams(search: string): string {
  if (!search) {
    return '';
  }

  const params = new URLSearchParams(search);
  let changed = false;

  TRANSIENT_QUERY_PARAMS.forEach((key) => {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  });

  if (!changed) {
    return search;
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}
