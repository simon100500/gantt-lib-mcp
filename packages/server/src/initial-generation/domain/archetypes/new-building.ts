import type { ProjectArchetypeDefinition } from '../contracts.js';

export const NEW_BUILDING_ARCHETYPE: ProjectArchetypeDefinition = {
  archetypeKey: 'new_building',
  defaultStages: [
    'Подготовительный этап',
    'Нулевой цикл',
    'Несущий каркас',
    'Контур и фасады',
    'Инженерные системы',
    'Внутренняя отделка',
    'Пусконаладка и сдача',
  ],
  requiredFamilies: [
    'site_preparation',
    'earthworks',
    'foundation',
    'superstructure',
    'envelope',
    'mep',
    'fitout',
    'handover',
  ],
  milestoneSkeleton: [
    'Старт площадки',
    'Завершение нулевого цикла',
    'Замыкание теплого контура',
    'Готовность инженерных систем',
    'Готовность к сдаче',
  ],
  sequencingExpectations: [
    'Подготовка площадки предшествует земляным работам и нулевому циклу.',
    'Несущий каркас не должен стартовать раньше базовой готовности фундамента.',
    'Инженерные системы следуют за достижением устойчивого строительного фронта.',
    'Чистовая отделка не стартует раньше завершения ключевых черновых MEP работ.',
  ],
  assumptions: [
    'Использовать типовую логику нового строительства без ресурсного планирования.',
  ],
};
