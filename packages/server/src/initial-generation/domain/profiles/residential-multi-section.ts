import type { ObjectProfileDefinition } from '../contracts.js';

export const RESIDENTIAL_MULTI_SECTION_PROFILE: ObjectProfileDefinition = {
  profileKey: 'residential_multi_section',
  archetypeKey: 'new_building',
  addedFamilies: [
    'section_handover',
    'common_areas',
    'roof_and_technical_spaces',
  ],
  excludedFamilies: [],
  milestoneAdditions: [
    'Готовность типовой секции',
    'Готовность общих зон',
    'Готовность к поэтапной передаче секций',
  ],
  sequencingOverrides: [
    'При наличии секций допускается секционное разбиение без расширения до всего комплекса.',
    'Общие зоны и секционные работы не смешивать в одну subphase без явного повода.',
  ],
  assumptions: [
    'Учитывать возможность поэтапной передачи секций и локальных фрагментов.',
  ],
};
