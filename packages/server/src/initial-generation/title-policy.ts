const MAX_TITLE_LENGTH = 70;
const TARGET_TITLE_LENGTH = 55;
const ENUMERATION_SEPARATOR_PATTERN = /\s*[,;]\s*/;
const MULTISPACE_PATTERN = /\s+/g;

function collapseWhitespace(value: string): string {
  return value.replace(MULTISPACE_PATTERN, ' ').trim();
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, Math.max(0, maxLength - 3));
  const lastSpace = slice.lastIndexOf(' ');
  const base = lastSpace >= 24 ? slice.slice(0, lastSpace) : slice;
  return `${base.trim()}...`;
}

export function normalizeGeneratedTitle(input: unknown, fallback: string): string {
  const raw = typeof input === 'string' ? input : '';
  const collapsed = collapseWhitespace(raw);
  const safeFallback = collapseWhitespace(fallback) || 'Без названия';

  if (!collapsed) {
    return safeFallback;
  }

  const enumeratedParts = collapsed
    .split(ENUMERATION_SEPARATOR_PATTERN)
    .map((part) => collapseWhitespace(part))
    .filter((part) => part.length > 0);

  const compact = enumeratedParts.length > 1 && collapsed.length > TARGET_TITLE_LENGTH
    ? enumeratedParts[0] ?? collapsed
    : collapsed;

  return truncateAtWordBoundary(compact, MAX_TITLE_LENGTH);
}

export function isTitleTooLong(title: string): boolean {
  return collapseWhitespace(title).length > MAX_TITLE_LENGTH;
}

export function isEnumerativeTitle(title: string): boolean {
  const compact = collapseWhitespace(title);
  return compact.length > TARGET_TITLE_LENGTH && ENUMERATION_SEPARATOR_PATTERN.test(compact);
}
