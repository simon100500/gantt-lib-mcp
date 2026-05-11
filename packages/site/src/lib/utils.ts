import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSiteOrigin(): string {
  const candidates = [import.meta.env.PUBLIC_SITE_URL, import.meta.env.SITE_URL];
  const normalized = candidates
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim()
    .replace(/\/+$/, '') ?? '';
  return normalized || 'https://getgantt.ru';
}

export function buildSiteUrl(pathname = '/'): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getSiteOrigin()}${normalizedPath}`;
}

function getAppOrigin(): string {
  const candidates = [import.meta.env.PUBLIC_APP_URL, import.meta.env.SITE_APP_URL];
  const normalized = candidates
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim()
    .replace(/\/+$/, '') ?? '';
  return normalized || 'http://localhost:5173';
}

export function getSiteApiOrigin(): string {
  const candidates = [
    import.meta.env.SITE_PUBLICATIONS_API_BASE_URL,
    import.meta.env.PUBLIC_SITE_PUBLICATIONS_API_BASE_URL,
  ];
  const normalized = candidates
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim()
    .replace(/\/+$/, '') ?? '';
  return normalized || 'http://localhost:3000';
}

export function buildAppTemplateCreateUrl(publicationId: string): string {
  return `${getAppOrigin()}/app/templates/${encodeURIComponent(publicationId)}/create`;
}

export function buildAppBlockIntentUrl(publicationId: string): string {
  return `${getAppOrigin()}/app/blocks/${encodeURIComponent(publicationId)}`;
}

export function buildAppProjectIntentUrl(intentId: string): string {
  return `${getAppOrigin()}/app/new?intent=${encodeURIComponent(intentId)}`;
}
