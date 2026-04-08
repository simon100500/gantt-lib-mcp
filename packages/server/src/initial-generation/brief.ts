import type { GenerationBrief } from './types.js';

export type BuildGenerationBriefInput = {
  userMessage: string;
};

function detectScopeSignals(userMessage: string): string[] {
  const signals = new Set<string>();
  const message = userMessage.toLowerCase();

  if (/(строит|construction|build)/i.test(message)) {
    signals.add('new_build');
  }

  if (/(ремонт|fit[- ]?out|renovat)/i.test(message)) {
    signals.add('renovation');
  }

  if (/(газобетон|brick|кирпич|монолит)/i.test(message)) {
    signals.add('material_mentioned');
  }

  if (/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i.test(message)) {
    signals.add('explicit_area');
  }

  if (signals.size === 0) {
    signals.add('starter_generation_request');
  }

  return [...signals];
}

export function buildGenerationBrief(input: BuildGenerationBriefInput): GenerationBrief {
  return {
    objectType: 'project',
    scopeSignals: detectScopeSignals(input.userMessage),
    starterScheduleExpectation:
      'Return a full starter schedule baseline with realistic phases, subphases, and tasks.',
    namingBan:
      'Do not use filler titles like "Этап 1" or "Task 3"; every node title must name a real activity.',
    domainContextSummary: '',
    serverInferencePolicy:
      'Rely on the user request itself.',
  };
}
