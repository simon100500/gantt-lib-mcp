import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REFERENCE_HELP_REGEX = [
  /\bhow\b/i,
  /\bhow to\b/i,
  /\bhelp\b/i,
  /\breference\b/i,
  /\bguide\b/i,
  /\bwhat can\b/i,
  /\bwhere is\b/i,
  /\bcan i\b/i,
  /можно ли/i,
  /как/i,
  /справк/i,
  /подскажи/i,
  /объясни/i,
  /что уме[её]т/i,
  /где находится/i,
];

const DIRECT_MUTATION_REGEX = /(добавь|создай|сдвинь|перенеси|измени|удали|свяжи|убери связь|пересчитай|проверь график)(?!.*\?)/i;
const MAX_REFERENCE_CONTEXT_CHARS = 4_000;

let cachedReferenceBrief: string | null = null;
let cachedReferenceBriefPath: string | null = null;

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function looksLikeReferenceRequest(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }

  if (DIRECT_MUTATION_REGEX.test(trimmed) && !trimmed.includes('?')) {
    return false;
  }

  return REFERENCE_HELP_REGEX.some((pattern) => pattern.test(trimmed));
}

export function loadReferenceBrief(projectRoot: string): string {
  const briefPath = join(projectRoot, 'PI-REFERENCE-BRIEF.md');
  if (cachedReferenceBrief && cachedReferenceBriefPath === briefPath) {
    return cachedReferenceBrief;
  }

  cachedReferenceBriefPath = briefPath;
  cachedReferenceBrief = clipText(readFileSync(briefPath, 'utf-8'), MAX_REFERENCE_CONTEXT_CHARS);
  return cachedReferenceBrief;
}
