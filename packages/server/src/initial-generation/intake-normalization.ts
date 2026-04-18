import type {
  LocationScope,
  NormalizedInitialRequest,
  SourceConfidence,
} from './types.js';

const ZONE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /подвал(?:а|е|)/i, value: 'подвал' },
  { pattern: /кровл(?:я|и|ю)/i, value: 'кровля' },
  { pattern: /фасад(?:а|е|)/i, value: 'фасад' },
  { pattern: /паркинг/i, value: 'паркинг' },
  { pattern: /секци(?:я|и|ю|ях)/i, value: 'секции' },
];

const MONTH_MAP: Record<string, number> = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeItemText(value: string): string {
  return value
    .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTableCell(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function isExplicitWorkItemLine(line: string): boolean {
  return /^(?:[-*•]\s+|\d+[.)]\s+)/.test(line.trim());
}

function looksLikeTableHeader(cell: string): boolean {
  const normalized = cell.toLowerCase().replace(/ё/g, 'е');
  return /\b(?:этап|задач[аи]?|наименование|работа|вид работ)\b/u.test(normalized);
}

function looksLikeDateOrDurationCell(cell: string): boolean {
  const normalized = cell.toLowerCase().trim();
  return /^(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?|\d{4}-\d{2}-\d{2}|\d+)$/u.test(normalized)
    || /\b(?:дата|начал|окончан|продолжител|duration|start|end)\b/u.test(normalized);
}

function extractTabularWorkItems(rawRequest: string): string[] {
  const lines = rawRequest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: string[] = [];

  for (const line of lines) {
    if (!line.includes('\t')) {
      continue;
    }

    const cells = line
      .split('\t')
      .map(normalizeTableCell)
      .filter(Boolean);
    if (cells.length < 2) {
      continue;
    }

    const [firstCell, ...restCells] = cells;
    if (!firstCell) {
      continue;
    }

    const normalizedFirstCell = firstCell.replace(/^[^:]{0,40}:\s*/u, '').trim();
    const headerCandidate = normalizedFirstCell || firstCell;
    const isHeader = looksLikeTableHeader(headerCandidate)
      && restCells.every((cell) => looksLikeDateOrDurationCell(cell) || /[а-яa-z]/iu.test(cell));
    if (isHeader) {
      continue;
    }

    const hasTabularMetadata = restCells.some((cell) => looksLikeDateOrDurationCell(cell));
    if (!hasTabularMetadata) {
      continue;
    }

    items.push(normalizedFirstCell || firstCell);
  }

  return [...new Set(items)];
}

function extractExplicitWorkItems(rawRequest: string): string[] {
  const tabularLines = extractTabularWorkItems(rawRequest);
  if (tabularLines.length >= 3) {
    return tabularLines;
  }

  const lines = rawRequest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter(isExplicitWorkItemLine).map(normalizeItemText);
  if (bulletLines.length >= 3) {
    return [...new Set(bulletLines)];
  }

  if (lines.length === 1 && rawRequest.includes(';')) {
    const parts = rawRequest
      .split(';')
      .map(normalizeItemText)
      .filter(Boolean);
    if (parts.length >= 4) {
      return [...new Set(parts)];
    }
  }

  return [];
}

function expandRange(start: string, end: string): string[] {
  const startMatch = start.match(/^(\d+)\.(\d+)$/);
  const endMatch = end.match(/^(\d+)\.(\d+)$/);
  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) {
    return [start, end];
  }

  const prefix = startMatch[1];
  const from = Number.parseInt(startMatch[2], 10);
  const to = Number.parseInt(endMatch[2], 10);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 20) {
    return [start, end];
  }

  return Array.from({ length: to - from + 1 }, (_, index) => `${prefix}.${from + index}`);
}

function extractSections(rawRequest: string): string[] {
  const sections = new Set<string>();
  for (const match of rawRequest.matchAll(/\b\d+\.\d+\b(?!\.\d{2,4}\b)/g)) {
    sections.add(match[0]);
  }

  for (const match of rawRequest.matchAll(/\b(\d+\.\d+)\s*[-–]\s*(\d+\.\d+)\b(?!\.\d{2,4}\b)/g)) {
    for (const section of expandRange(match[1], match[2])) {
      sections.add(section);
    }
  }

  return [...sections].sort((left, right) => {
    const [leftMajor, leftMinor] = left.split('.').map((value) => Number.parseInt(value, 10));
    const [rightMajor, rightMinor] = right.split('.').map((value) => Number.parseInt(value, 10));

    if (leftMajor !== rightMajor) {
      return leftMajor - rightMajor;
    }

    return leftMinor - rightMinor;
  });
}

function extractFloors(rawRequest: string): string[] {
  const floors = new Set<string>();

  for (const match of rawRequest.matchAll(/(?:этаж(?:а|ей)?|floor)\s*(\d+)/gi)) {
    floors.add(match[1]);
  }

  return [...floors];
}

function extractZones(rawRequest: string): string[] {
  const zones = new Set<string>();
  for (const entry of ZONE_PATTERNS) {
    if (entry.pattern.test(rawRequest)) {
      zones.add(entry.value);
    }
  }

  return [...zones];
}

function buildLocationScope(rawRequest: string): LocationScope | undefined {
  const sections = extractSections(rawRequest);
  const floors = extractFloors(rawRequest);
  const zones = extractZones(rawRequest);

  if (sections.length === 0 && floors.length === 0 && zones.length === 0) {
    return undefined;
  }

  return {
    ...(sections.length > 0 ? { sections } : {}),
    ...(floors.length > 0 ? { floors } : {}),
    ...(zones.length > 0 ? { zones } : {}),
  };
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveMonthToken(token: string): number | null {
  const normalized = token.toLowerCase().replace(/ё/g, 'е');
  for (const [prefix, month] of Object.entries(MONTH_MAP)) {
    if (normalized.startsWith(prefix)) {
      return month;
    }
  }
  return null;
}

function extractProjectDateRange(rawRequest: string): { startDate: string; endDate: string } | undefined {
  const isoRange = rawRequest.match(/\b(\d{4}-\d{2}-\d{2})\b\s*(?:до|по|[-–—])\s*\b(\d{4}-\d{2}-\d{2})\b/i);
  if (isoRange) {
    return {
      startDate: isoRange[1],
      endDate: isoRange[2],
    };
  }

  const russianRange = rawRequest.match(
    /\bс\s+(\d{1,2})\s+([а-яё]+)\s+(?:(\d{4})\s+г(?:ода|\.?)?\s*)?(?:по|до|-|–|—)\s*(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+г(?:ода|\.?)?/iu,
  );
  if (!russianRange) {
    return undefined;
  }

  const startDay = Number.parseInt(russianRange[1] ?? '', 10);
  const startMonth = resolveMonthToken(russianRange[2] ?? '');
  const explicitStartYear = russianRange[3] ? Number.parseInt(russianRange[3], 10) : null;
  const endDay = Number.parseInt(russianRange[4] ?? '', 10);
  const endMonth = resolveMonthToken(russianRange[5] ?? '');
  const endYear = Number.parseInt(russianRange[6] ?? '', 10);

  if (!startMonth || !endMonth || !Number.isInteger(endYear)) {
    return undefined;
  }

  const startYear = explicitStartYear ?? endYear;
  const startDate = toIsoDate(startYear, startMonth, startDay);
  const endDate = toIsoDate(endYear, endMonth, endDay);
  if (!startDate || !endDate) {
    return undefined;
  }

  return {
    startDate,
    endDate,
  };
}

function inferSourceConfidence(
  explicitWorkItems: string[],
  locationScope: LocationScope | undefined,
): SourceConfidence {
  const locationEvidenceCount = (locationScope?.sections?.length ?? 0)
    + (locationScope?.floors?.length ?? 0)
    + (locationScope?.zones?.length ?? 0);

  if (explicitWorkItems.length >= 4 || locationEvidenceCount >= 3) {
    return 'high';
  }

  if (explicitWorkItems.length >= 2 || locationEvidenceCount > 0) {
    return 'medium';
  }

  return 'low';
}

export function normalizeInitialRequest(rawRequest: string): NormalizedInitialRequest {
  const normalizedRequest = normalizeWhitespace(rawRequest);
  const explicitWorkItems = extractExplicitWorkItems(rawRequest);
  const locationScope = buildLocationScope(normalizedRequest);
  const projectDateRange = extractProjectDateRange(normalizedRequest);
  const sourceConfidence = inferSourceConfidence(explicitWorkItems, locationScope);

  return {
    rawRequest,
    normalizedRequest,
    explicitWorkItems,
    ...(locationScope ? { locationScope } : {}),
    ...(projectDateRange ? { projectDateRange } : {}),
    sourceConfidence,
  };
}
