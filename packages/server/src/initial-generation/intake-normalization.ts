import type {
  IntakeScopeSignals,
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeItemText(value: string): string {
  return value
    .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExplicitWorkItemLine(line: string): boolean {
  return /^(?:[-*•]\s+|\d+[.)]\s+)/.test(line.trim());
}

function extractExplicitWorkItems(rawRequest: string): string[] {
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
  for (const match of rawRequest.matchAll(/\b\d+\.\d+\b/g)) {
    sections.add(match[0]);
  }

  for (const match of rawRequest.matchAll(/\b(\d+\.\d+)\s*[-–]\s*(\d+\.\d+)\b/g)) {
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

function detectScopeSignals(rawRequest: string, explicitWorkItems: string[], locationScope?: LocationScope): IntakeScopeSignals {
  const message = rawRequest.toLowerCase();
  const fragment = Boolean(
    locationScope
    || /(?:фрагмент|подвал|секци(?:я|и|ю|ях)|зона|фасад|крыло|корпус|паркинг)/i.test(message),
  );
  const wholeProject = /(?:строительств(?:о|а)|весь объект|по всему объекту|полный график|график проекта)/i.test(message);
  const handoverIntent = /(?:передач[аи]|сдач[аи]|handover|готовност(?:ь|и))/i.test(message);

  return {
    fragment,
    wholeProject,
    handoverIntent,
    explicitWorklist: explicitWorkItems.length > 0,
  };
}

function inferSourceConfidence(
  rawRequest: string,
  explicitWorkItems: string[],
  locationScope: LocationScope | undefined,
  scopeSignals: IntakeScopeSignals,
): SourceConfidence {
  if (explicitWorkItems.length >= 4) {
    return 'high';
  }

  if (locationScope || scopeSignals.fragment || scopeSignals.wholeProject || rawRequest.length >= 40) {
    return 'medium';
  }

  return 'low';
}

export function normalizeInitialRequest(rawRequest: string): NormalizedInitialRequest {
  const normalizedRequest = normalizeWhitespace(rawRequest);
  const explicitWorkItems = extractExplicitWorkItems(normalizedRequest);
  const locationScope = buildLocationScope(normalizedRequest);
  const scopeSignals = detectScopeSignals(normalizedRequest, explicitWorkItems, locationScope);
  const sourceConfidence = inferSourceConfidence(normalizedRequest, explicitWorkItems, locationScope, scopeSignals);

  return {
    rawRequest,
    normalizedRequest,
    scopeSignals,
    explicitWorkItems,
    ...(locationScope ? { locationScope } : {}),
    sourceConfidence,
  };
}
