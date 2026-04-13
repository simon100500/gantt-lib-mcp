import { selectMutationExecutionMode } from './execution-routing.js';
import type { MutationIntent, MutationIntentType } from './types.js';

type ClassificationSeed = {
  intentType: MutationIntentType;
  confidence: number;
  entitiesMentioned: string[];
  requiresResolution: boolean;
  requiresSchedulingPlacement: boolean;
};

function normalizeRequest(userMessage: string): string {
  return userMessage.trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractQuotedEntity(rawRequest: string): string[] {
  const quoted = rawRequest.match(/["«](.+?)["»]/u);
  return quoted?.[1] ? [quoted[1]] : [];
}

function extractPairEntities(rawRequest: string): string[] {
  const quoted = Array.from(rawRequest.matchAll(/["«](.+?)["»]/gu)).map((match) => match[1]?.trim()).filter(Boolean);
  if (quoted.length >= 2) {
    return quoted as string[];
  }

  return rawRequest
    .replace(/^свяжи\s+/iu, '')
    .replace(/^убери\s+связь\s+между\s+/iu, '')
    .split(/\s+и\s+/iu)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function buildIntent(rawRequest: string, seed: ClassificationSeed): MutationIntent {
  const normalizedRequest = normalizeRequest(rawRequest);
  const intentWithoutMode = {
    intentType: seed.intentType,
    confidence: seed.confidence,
    rawRequest,
    normalizedRequest,
    entitiesMentioned: seed.entitiesMentioned,
    requiresResolution: seed.requiresResolution,
    requiresSchedulingPlacement: seed.requiresSchedulingPlacement,
    executionMode: 'deterministic',
  } satisfies Omit<MutationIntent, 'executionMode'> & { executionMode: 'deterministic' };

  return {
    ...intentWithoutMode,
    executionMode: selectMutationExecutionMode(intentWithoutMode),
  };
}

export function classifyMutationIntent(userMessage: string): MutationIntent {
  const rawRequest = userMessage.trim();
  const normalizedRequest = normalizeRequest(userMessage);
  const quotedEntity = extractQuotedEntity(rawRequest);

  if (normalizedRequest === 'добавь сдачу технадзору') {
    return buildIntent(rawRequest, {
      intentType: 'add_single_task',
      confidence: 0.93,
      entitiesMentioned: ['сдачу технадзору'],
      requiresResolution: true,
      requiresSchedulingPlacement: true,
    });
  }

  if (/^сдвин[ьу]?\s+.+\s+на\s+-?\d+\s+(?:дн(?:я|ей)|недел(?:ю|и|ь))/u.test(normalizedRequest)) {
    const entity = normalizedRequest.match(/^сдвин[ьу]?\s+(.+?)\s+на\s+/u)?.[1] ?? normalizedRequest;
    return buildIntent(rawRequest, {
      intentType: 'shift_relative',
      confidence: 0.92,
      entitiesMentioned: [entity],
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^перенеси?\s+.+\s+на\s+\d{4}-\d{2}-\d{2}$/u.test(normalizedRequest)) {
    const entity = normalizedRequest.match(/^перенеси?\s+(.+?)\s+на\s+\d{4}-\d{2}-\d{2}$/u)?.[1] ?? normalizedRequest;
    return buildIntent(rawRequest, {
      intentType: 'move_to_date',
      confidence: 0.94,
      entitiesMentioned: [entity],
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^свяжи\s+.+\s+и\s+.+$/u.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'link_tasks',
      confidence: 0.9,
      entitiesMentioned: extractPairEntities(rawRequest),
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^убери\s+связь\s+между\s+.+\s+и\s+.+$/u.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'unlink_tasks',
      confidence: 0.88,
      entitiesMentioned: extractPairEntities(rawRequest),
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^добавь\s+.+\s+на\s+кажд(?:ый|ую|ое|ые)\b/u.test(normalizedRequest)) {
    const entity = normalizedRequest.match(/^добавь\s+(.+?)\s+на\s+кажд(?:ый|ую|ое|ые)\b/u)?.[1] ?? normalizedRequest;
    return buildIntent(rawRequest, {
      intentType: 'add_repeated_fragment',
      confidence: 0.9,
      entitiesMentioned: [entity],
      requiresResolution: true,
      requiresSchedulingPlacement: true,
    });
  }

  if (/^добавь\s+.+\s+на\s+каждый\s+.+$/u.test(normalizedRequest)) {
    const entity = normalizedRequest.match(/^добавь\s+(.+?)\s+на\s+каждый\s+.+$/u)?.[1] ?? normalizedRequest;
    return buildIntent(rawRequest, {
      intentType: 'add_repeated_fragment',
      confidence: 0.9,
      entitiesMentioned: [entity],
      requiresResolution: true,
      requiresSchedulingPlacement: true,
    });
  }

  if (/^сделай\s+.+\s+красн(?:ой|ым|ыми)?$/u.test(normalizedRequest)) {
    const entity = normalizedRequest.match(/^сделай\s+(.+?)\s+красн/u)?.[1] ?? normalizedRequest;
    return buildIntent(rawRequest, {
      intentType: 'update_metadata',
      confidence: 0.89,
      entitiesMentioned: [entity],
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^переименуй\s+.+$/u.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'rename_task',
      confidence: 0.9,
      entitiesMentioned: quotedEntity.length > 0 ? quotedEntity : [rawRequest.replace(/^переименуй\s+/iu, '').trim()],
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^удали\s+.+$/u.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'delete_task',
      confidence: 0.9,
      entitiesMentioned: quotedEntity.length > 0 ? quotedEntity : [rawRequest.replace(/^удали\s+/iu, '').trim()],
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/(?:внутрь|подзадачей|под\s+["«a-zа-яё])/iu.test(normalizedRequest) && /(?:перенеси|сделай)/iu.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'move_in_hierarchy',
      confidence: 0.84,
      entitiesMentioned: quotedEntity,
      requiresResolution: true,
      requiresSchedulingPlacement: false,
    });
  }

  if (/^распиши\s+подробнее\s+пункт/u.test(normalizedRequest)) {
    return buildIntent(rawRequest, {
      intentType: 'expand_wbs',
      confidence: 0.91,
      entitiesMentioned: quotedEntity,
      requiresResolution: true,
      requiresSchedulingPlacement: true,
    });
  }

  if (/^полностью\s+перестрой/u.test(normalizedRequest) || normalizedRequest.includes('разбей')) {
    return buildIntent(rawRequest, {
      intentType: 'restructure_branch',
      confidence: 0.78,
      entitiesMentioned: quotedEntity,
      requiresResolution: true,
      requiresSchedulingPlacement: true,
    });
  }

  return buildIntent(rawRequest, {
    intentType: 'unsupported_or_ambiguous',
    confidence: 0.35,
    entitiesMentioned: quotedEntity,
    requiresResolution: false,
    requiresSchedulingPlacement: false,
  });
}
