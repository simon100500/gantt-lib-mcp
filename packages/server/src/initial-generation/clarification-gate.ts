import type {
  ClarificationDecision,
  InitialGenerationClassification,
  InitialRequestInterpretation,
  NormalizedInitialRequest,
} from './types.js';

function proceedWithAssumptions(...assumptions: string[]): ClarificationDecision {
  return {
    action: 'proceed_with_assumptions',
    assumptions: assumptions.filter(Boolean),
  };
}

type DecideInitialClarificationInput = {
  normalizedRequest: NormalizedInitialRequest;
  interpretation: InitialRequestInterpretation;
  classification: InitialGenerationClassification;
};

export function decideInitialClarification(
  input: DecideInitialClarificationInput,
): ClarificationDecision {
  const { normalizedRequest, interpretation, classification } = input;
  const sectionList = normalizedRequest.locationScope?.sections?.join(', ');

  if (interpretation.clarification.needed && interpretation.clarification.reason === 'scope_boundary_ambiguity') {
    return {
      action: 'ask',
      impact: 'high',
      reason: 'scope_boundary_ambiguity',
      question: 'Нужен полный график по объекту или только по указанному фрагменту?',
      choices: ['Только указанный фрагмент', 'Нужен полный график по объекту'],
      fallbackAssumption: 'Считать запрос локальным фрагментом и не расширять график до всего объекта.',
    };
  }

  if (
    interpretation.clarification.needed
    && (
      interpretation.clarification.reason === 'ambiguous_list'
      || interpretation.clarification.reason === 'worklist_completeness_ambiguity'
    )
    && interpretation.scopeMode === 'explicit_worklist'
    && interpretation.requestKind === 'explicit_worklist'
  ) {
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
    interpretation.clarification.needed
    && interpretation.clarification.reason === 'fragment_target_ambiguity'
    && interpretation.scopeMode === 'partial_scope'
    && interpretation.requestKind === 'partial_scope'
    && normalizedRequest.locationScope
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
