import type { ObjectProfileDefinition } from '../contracts.js';

export const OFFICE_FITOUT_PROFILE: ObjectProfileDefinition = {
  profileKey: 'office_fitout',
  archetypeKey: 'new_building',
  addedFamilies: [
    'space_planning',
    'ceiling_and_floor_finishes',
    'commissioning',
  ],
  excludedFamilies: [
    'earthworks',
    'foundation',
    'superstructure',
  ],
  milestoneAdditions: [
    'Готовность чернового fit-out',
    'Готовность офисных инженерных систем',
    'Готовность к вводу в эксплуатацию арендатора',
  ],
  sequencingOverrides: [
    'Для office fitout не добавлять нулевой цикл и коробку здания.',
    'Привязывать sequencing к внутренним помещениям и инженерии fitout scope.',
  ],
  assumptions: [
    'Если профиль office_fitout выбран по тексту, держать scope внутри внутренней отделки и MEP fitout.',
  ],
};
