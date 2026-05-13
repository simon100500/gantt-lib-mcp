const PROJECT_CREATION_INTENT_STORAGE_KEY = 'gantt_pending_project_creation_intent';
const GENERATION_JOB_STORAGE_KEY_PREFIX = 'gantt_generation_job:';
const GENERATION_PREVIEW_STORAGE_KEY_PREFIX = 'gantt_generation_preview:';

export function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getGenerationJobStorageKey(projectId: string): string {
  return `${GENERATION_JOB_STORAGE_KEY_PREFIX}${projectId}`;
}

export function getGenerationPreviewStorageKey(projectId: string): string {
  return `${GENERATION_PREVIEW_STORAGE_KEY_PREFIX}${projectId}`;
}

export function readPendingProjectCreationIntentId(): string | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  const value = window.sessionStorage.getItem(PROJECT_CREATION_INTENT_STORAGE_KEY)?.trim() ?? '';
  return value || null;
}

export function writePendingProjectCreationIntentId(intentId: string | null): void {
  if (!canUseSessionStorage()) {
    return;
  }

  if (!intentId) {
    window.sessionStorage.removeItem(PROJECT_CREATION_INTENT_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(PROJECT_CREATION_INTENT_STORAGE_KEY, intentId);
}
