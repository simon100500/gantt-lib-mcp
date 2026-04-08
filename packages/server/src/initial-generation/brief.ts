import type { ResolvedDomainReference } from './domain-reference.js';

export type PlannerGenerationBrief = {
  objectType: string;
  scopeSignals: string[];
  starterScheduleExpectation: string;
  namingBan: string;
  domainContextSummary: string;
  serverInferencePolicy: string;
};

export type BuildGenerationBriefInput = {
  userMessage: string;
  reference: ResolvedDomainReference;
};

function detectScopeSignals(userMessage: string, reference: ResolvedDomainReference): string[] {
  const signals = new Set<string>();
  const message = userMessage.toLowerCase();

  if (reference.defaultInterpretation === 'private_residential_house') {
    signals.add('broad_request');
    signals.add('fallback_private_house_baseline');
  }

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

export function buildGenerationBrief(input: BuildGenerationBriefInput): PlannerGenerationBrief {
  const { reference } = input;

  return {
    objectType: reference.defaultInterpretation ?? reference.projectType,
    scopeSignals: detectScopeSignals(input.userMessage, reference),
    starterScheduleExpectation:
      'Return a full starter schedule baseline, not a fragment: include the main phases, enough concrete child tasks to make the project usable, and realistic sequencing from setup through handover.',
    namingBan:
      'Do not use filler titles such as "Этап 1", "Задача 2", "Stage 1", or "Task 3"; every node title must name a real construction or repair activity.',
    domainContextSummary: reference.domainContextSummary,
    serverInferencePolicy:
      'Infer the baseline server-side from the request and domain reference when the prompt is broad; produce the strongest plausible baseline without waiting for extra user input.',
  };
}
