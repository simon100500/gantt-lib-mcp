import type { ObjectProfileDefinition } from '../contracts.js';

export const KINDERGARTEN_PROFILE: ObjectProfileDefinition = {
  profileKey: 'kindergarten',
  archetypeKey: 'new_building',
  addedFamilies: [
    'playground',
    'kitchen_block',
    'specialized_child_spaces',
  ],
  excludedFamilies: [],
  milestoneAdditions: [
    'Готовность групповых помещений',
    'Готовность пищеблока',
    'Готовность прогулочных площадок',
  ],
  sequencingOverrides: [
    'Специализированные детские помещения не сводить к generic fitout stream.',
    'Наружные детские площадки учитывать как отдельный завершающий workstream.',
  ],
  assumptions: [
    'Сохранять отдельную логику для помещений детского сада и внешних игровых зон.',
  ],
};
