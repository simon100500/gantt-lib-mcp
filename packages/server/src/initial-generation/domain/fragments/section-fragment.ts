import type { FragmentDefinition } from '../contracts.js';

export const SECTION_FRAGMENT: FragmentDefinition = {
  fragmentKey: 'section_fragment',
  label: 'Локальный фрагмент секций',
  addedFamilies: [
    'section_specific_workfront',
    'local_readiness_checks',
  ],
  milestoneAdditions: [
    'Готовность указанной секции/секций',
  ],
  scopeBoundaries: [
    'Не расширять график до других секций без явного запроса.',
    'Сохранять привязку к явно указанным section identifiers.',
  ],
  sequencingExpectations: [
    'Структурировать график вокруг локального workfront и его приемки.',
  ],
  assumptions: [
    'Считать указанные секции самостоятельным локальным фрагментом планирования.',
  ],
};
