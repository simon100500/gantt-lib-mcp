import type { FragmentDefinition } from '../contracts.js';

export const BASEMENT_HANDOVER_FRAGMENT: FragmentDefinition = {
  fragmentKey: 'basement_handover',
  label: 'Передача конструкций подвала',
  addedFamilies: [
    'basement_structure',
    'waterproofing_readiness',
    'handover_preparation',
  ],
  milestoneAdditions: [
    'Готовность конструкций подвала к передаче',
    'Закрытие замечаний по подвалу',
  ],
  scopeBoundaries: [
    'Не добавлять unrelated надземные workstreams.',
    'Ограничить график подвалом и непосредственно связанными preparatory/closeout задачами.',
  ],
  sequencingExpectations: [
    'Сначала конструктивная готовность подвала, затем контроль, устранение замечаний и передача.',
  ],
  assumptions: [
    'Целевое состояние фрагмента: передача конструкций подвала, а не полный finish объекта.',
  ],
};
