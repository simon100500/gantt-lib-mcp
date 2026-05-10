import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getAppOrigin(): string {
  const envUrl = import.meta.env.PUBLIC_APP_URL ?? import.meta.env.SITE_APP_URL;
  const normalized = typeof envUrl === 'string' ? envUrl.trim().replace(/\/+$/, '') : '';
  return normalized || 'http://localhost:5173';
}

export function getSiteApiOrigin(): string {
  const envUrl = import.meta.env.SITE_PUBLICATIONS_API_BASE_URL
    ?? import.meta.env.PUBLIC_SITE_PUBLICATIONS_API_BASE_URL;
  const normalized = typeof envUrl === 'string' ? envUrl.trim().replace(/\/+$/, '') : '';
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
