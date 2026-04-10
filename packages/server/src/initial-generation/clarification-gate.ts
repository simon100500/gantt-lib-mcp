import type {
  ClarificationDecision,
  InitialGenerationClassification,
  NormalizedInitialRequest,
} from './types.js';

function proceedWithAssumptions(...assumptions: string[]): ClarificationDecision {
  return {
    action: 'proceed_with_assumptions',
    assumptions: assumptions.filter(Boolean),
  };
}

function hasAmbiguousListLanguage(message: string): boolean {
  return /(?:например|и\s+т\.?\s*д\.?|etc|основн(?:ые|ой)|чернов(?:ой|ые)|примерн(?:о|ый))/i.test(message);
}

function hasExplicitFragmentTarget(message: string): boolean {
  return /(?:передач[аи]|сдач[аи]|handover|полная готовность|завершени[ея]|completion)/i.test(message);
}

export function decideInitialClarification(
  normalized: NormalizedInitialRequest,
  classification: InitialGenerationClassification,
): ClarificationDecision {
  const message = normalized.normalizedRequest;
  const sectionList = normalized.locationScope?.sections?.join(', ');

  if (normalized.scopeSignals.fragment && normalized.scopeSignals.wholeProject) {
    return {
      action: 'ask',
      impact: 'high',
      reason: 'scope_boundary_ambiguity',
      question: 'Нужен полный график по объекту или только по указанному фрагменту?',
      choices: ['Только указанный фрагмент', 'Нужен полный график по объекту'],
      fallbackAssumption: 'Считать запрос локальным фрагментом и не расширять график до всего объекта.',
    };
  }

  if (classification.scopeMode === 'explicit_worklist' && hasAmbiguousListLanguage(message)) {
    return {
      action: 'ask',
      impact: 'high',
      reason: 'worklist_completeness_ambiguity',
      question: 'Считать ваш список работ исчерпывающим или можно добавить недостающие supporting tasks?',
      choices: ['Список исчерпывающий', 'Можно добавить недостающие supporting tasks'],
      fallbackAssumption: 'Считать список работ исчерпывающим и не добавлять новые работы без явного запроса.',
    };
  }

  if (
    classification.scopeMode === 'partial_scope'
    && normalized.locationScope
    && !hasExplicitFragmentTarget(message)
    && !normalized.scopeSignals.handoverIntent
  ) {
    const fragmentLabel = sectionList
      ? `по фрагменту ${sectionList}`
      : 'по этому фрагменту';
    return {
      action: 'ask',
      impact: 'high',
      reason: 'fragment_target_ambiguity',
      question: `Какой итог нужен ${fragmentLabel}: передача конструкций или полное завершение работ?`,
      choices: ['Передача конструкций', 'Полное завершение работ'],
      fallbackAssumption: 'Считать целевым состоянием передачу конструкций для указанного фрагмента.',
    };
  }

  if (classification.scopeMode === 'full_project') {
    return proceedWithAssumptions('Считать запрос стартовым графиком по всему объекту.');
  }

  if (classification.scopeMode === 'explicit_worklist') {
    return proceedWithAssumptions('Считать пользовательский список работ основным источником состава графика.');
  }

  return proceedWithAssumptions('Считать запрос локальным фрагментом и держать генерацию внутри указанной области.');
}
