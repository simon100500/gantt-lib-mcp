import type { ExplicitScheduleItem, NormalizedInitialRequest } from './types.js';

const STRICT_WORKLIST_DIRECTIVE_PATTERN = /\b(?:только\s+(?:по|из)\s+списк|строго\s+по\s+списк|следуй\s+списк|без\s+(?:добавлен|дополнен|расширен)|only\s+from\s+the\s+list|strict(?:ly)?\s+from\s+the\s+list|follow\s+the\s+list|do\s+not\s+add|without\s+(?:adding|expanding))/iu;
const EXPLICIT_LIST_LINE_PATTERN = /^(?:[-*•]\s+|\d+[.)]\s+)/u;

function getContentLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countNonListLines(value: string): number {
  return getContentLines(value).filter((line) => !EXPLICIT_LIST_LINE_PATTERN.test(line) && !line.includes('\t')).length;
}

function countListLines(value: string): number {
  return getContentLines(value).filter((line) => EXPLICIT_LIST_LINE_PATTERN.test(line) || line.includes('\t')).length;
}

function hasListHeader(value: string): boolean {
  return getContentLines(value).some((line) => !EXPLICIT_LIST_LINE_PATTERN.test(line) && /[:;]$/u.test(line));
}

function hasStrictWorklistDirective(userMessage: string, normalizedRequest?: string): boolean {
  return STRICT_WORKLIST_DIRECTIVE_PATTERN.test(userMessage) || STRICT_WORKLIST_DIRECTIVE_PATTERN.test(normalizedRequest ?? '');
}

function hasDirectScheduleFacts(explicitScheduleItems?: ExplicitScheduleItem[]): boolean {
  return (explicitScheduleItems?.length ?? 0) >= 3;
}

type StrictExplicitWorklistInput = {
  userMessage: string;
  normalizedRequest?: Pick<NormalizedInitialRequest, 'normalizedRequest' | 'explicitWorkItems' | 'explicitScheduleItems'>;
};

export type ExplicitWorklistIntentAssessment = {
  probability: number;
  isStrict: boolean;
  criteria: Array<{ key: string; matched: boolean; weight: number }>;
};

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function assessExplicitWorklistIntent(input: StrictExplicitWorklistInput): ExplicitWorklistIntentAssessment {
  const explicitWorkItems = input.normalizedRequest?.explicitWorkItems ?? [];
  const explicitWorklistCount = explicitWorkItems.length;
  if (explicitWorklistCount === 0) {
    return {
      probability: 0,
      isStrict: false,
      criteria: [],
    };
  }

  const strictDirective = hasStrictWorklistDirective(input.userMessage, input.normalizedRequest?.normalizedRequest);
  const directScheduleFacts = hasDirectScheduleFacts(input.normalizedRequest?.explicitScheduleItems);
  const listLineCount = countListLines(input.userMessage);
  const nonListLineCount = countNonListLines(input.userMessage);
  const listDominant = listLineCount > 0 && nonListLineCount <= Math.max(1, Math.floor(listLineCount / 2));
  const averageWordsPerItem = explicitWorkItems.length === 0
    ? 0
    : explicitWorkItems.reduce((sum, item) => sum + item.split(/\s+/u).filter(Boolean).length, 0) / explicitWorkItems.length;
  const looksLikeConcreteTaskList = averageWordsPerItem >= 2 && averageWordsPerItem <= 8;
  const looksDirectionalOnly = averageWordsPerItem > 0 && averageWordsPerItem < 2;
  const headerIntroducesList = hasListHeader(input.userMessage);
  const standaloneListDocument = listDominant && nonListLineCount <= 1;
  const longEnoughList = explicitWorklistCount >= 5;
  const veryShortList = explicitWorklistCount <= 2;

  const criteria: ExplicitWorklistIntentAssessment['criteria'] = [
    { key: 'direct_schedule_facts', matched: directScheduleFacts, weight: 0.42 },
    { key: 'strict_follow_list_directive', matched: strictDirective, weight: 0.24 },
    { key: 'list_dominant_format', matched: listDominant, weight: 0.14 },
    { key: 'standalone_list_document', matched: standaloneListDocument, weight: 0.16 },
    { key: 'list_header_present', matched: headerIntroducesList, weight: 0.06 },
    { key: 'concrete_task_granularity', matched: looksLikeConcreteTaskList, weight: 0.12 },
    { key: 'long_enough_list', matched: longEnoughList, weight: 0.06 },
    { key: 'directional_short_labels', matched: looksDirectionalOnly, weight: -0.12 },
    { key: 'too_few_items_for_strict_scope', matched: veryShortList, weight: -0.12 },
    { key: 'non_list_context_dominates', matched: !listDominant, weight: -0.14 },
  ];

  if (directScheduleFacts) {
    return {
      probability: 0.86,
      isStrict: true,
      criteria,
    };
  }

  const probability = clampProbability(
    0.12 + criteria.reduce((sum, criterion) => sum + (criterion.matched ? criterion.weight : 0), 0),
  );

  return {
    probability,
    isStrict: probability >= 0.54,
    criteria,
  };
}

export function shouldTreatAsStrictExplicitWorklist(input: StrictExplicitWorklistInput): boolean {
  return assessExplicitWorklistIntent(input).isStrict;
}
